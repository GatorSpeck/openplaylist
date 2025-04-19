#!/usr/bin/env python3
# filepath: migrate_sqlite_to_mysql.py
import os
import sys
from sqlalchemy import create_engine, MetaData, Table, select, text
from sqlalchemy.orm import sessionmaker
import dotenv
import logging
from tqdm import tqdm

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

# Load environment variables
dotenv.load_dotenv()

def clean_track_data(row_dict):
    """Clean and convert track-related data to appropriate types"""
    
    # Handle track_number
    if 'track_number' in row_dict and row_dict['track_number'] is not None:
        try:
            # If it's a string like "1/10", take just the first number
            if isinstance(row_dict['track_number'], str) and '/' in row_dict['track_number']:
                row_dict['track_number'] = int(row_dict['track_number'].split('/')[0])
            else:
                row_dict['track_number'] = int(row_dict['track_number'])
        except (ValueError, TypeError):
            # If conversion fails, set to NULL
            row_dict['track_number'] = None
    
    # Handle disc_number similarly
    if 'disc_number' in row_dict and row_dict['disc_number'] is not None:
        try:
            if isinstance(row_dict['disc_number'], str) and '/' in row_dict['disc_number']:
                row_dict['disc_number'] = int(row_dict['disc_number'].split('/')[0])
            else:
                row_dict['disc_number'] = int(row_dict['disc_number'])
        except (ValueError, TypeError):
            row_dict['disc_number'] = None
    
    # Handle length field
    if 'length' in row_dict and row_dict['length'] is not None:
        try:
            row_dict['length'] = int(float(row_dict['length']))
        except (ValueError, TypeError):
            row_dict['length'] = None
            
    # Handle year field - ensure it doesn't exceed MySQL varchar limits
    if 'year' in row_dict and row_dict['year'] is not None:
        if isinstance(row_dict['year'], str) and len(row_dict['year']) > 32:
            row_dict['year'] = row_dict['year'][:32]
    
    return row_dict

def get_connection_params():
    # MySQL target settings
    mysql_host = os.getenv("DB_HOST", "openplaylist_db")
    mysql_port = os.getenv("DB_PORT", "3306")
    mysql_user = os.getenv("MARIADB_USER", "replaceme")
    mysql_password = os.getenv("MARIADB_PASSWORD", "replaceme")
    mysql_db = os.getenv("DB_NAME", "openplaylist")
    
    # SQLite source file
    sqlite_file = os.getenv("SQLITE_FILE", "music_files.db")
    
    return {
        "mysql_url": f"mysql+pymysql://{mysql_user}:{mysql_password}@{mysql_host}:{mysql_port}/{mysql_db}",
        "sqlite_url": f"sqlite:///{sqlite_file}"
    }

def migrate_data():
    params = get_connection_params()
    
    logger.info(f"Source: {params['sqlite_url']}")
    logger.info(f"Target: {params['mysql_url']}")
    
    # Create engines
    source_engine = create_engine(params['sqlite_url'])
    target_engine = create_engine(params['mysql_url'])
    
    # Get metadata
    metadata = MetaData()
    metadata.reflect(bind=source_engine)
    
    # Create sessions
    SourceSession = sessionmaker(bind=source_engine)
    TargetSession = sessionmaker(bind=target_engine)
    
    source_session = SourceSession()
    target_session = TargetSession()
    
    # Verify tables exist in target
    target_metadata = MetaData()
    target_metadata.reflect(bind=target_engine)
    if len(target_metadata.tables) == 0:
        logger.error("No tables found in target database after migration")
        return False
    
    # Start by disabling foreign key checks in MySQL
    logger.info("Disabling foreign key checks")
    target_session.execute(text("SET FOREIGN_KEY_CHECKS=0"))
    target_session.commit()
    
    try:
        # Migration order based on foreign key dependencies
        # Base tables first, then tables with foreign keys
        table_order = [
            # Base tables
            "base_elements",
            "playlists",
            # Secondary tables 
            "music_files",
            "lastfm_tracks",
            "albums",
            "requested_tracks",
            "nested_playlists",
            # Many-to-many and relationship tables
            "playlist_entries",
            "track_genres",
            "music_file_entries",
            "lastfm_entries", 
            "requested_entries",
            "nested_playlist_entries",
            "album_entries",
            "requested_album_entries",
            "album_tracks"
        ]
        
        # Skip tables that don't exist in source
        tables_to_migrate = [t for t in table_order if t in metadata.tables]
        
        for table_name in tables_to_migrate:
            if table_name not in metadata.tables:
                logger.warning(f"Table {table_name} not found in source database, skipping")
                continue
            
            if table_name not in target_metadata.tables:
                logger.warning(f"Table {table_name} not found in target database, skipping")
                continue
            
            source_table = metadata.tables[table_name]
            
            # Count rows for progress bar
            row_count = source_session.query(source_table).count()
            logger.info(f"Migrating table {table_name} ({row_count} rows)")
            
            # Clean target table
            target_session.execute(text(f"DELETE FROM {table_name}"))
            target_session.commit()
            
            # Process in batches for large tables
            batch_size = 1000
            for offset in tqdm(range(0, row_count, batch_size), desc=f"Migrating {table_name}"):
                # Get batch of rows from source
                stmt = select(source_table).offset(offset).limit(batch_size)
                rows = source_session.execute(stmt).fetchall()
                
                if not rows:
                    continue
                
                # Convert to dictionaries
                column_names = source_table.columns.keys()
                row_dicts = []
                for row in rows:
                    row_dict = {column_names[i]: value for i, value in enumerate(row)}
                    
                    # Clean data before insertion to MySQL
                    if table_name in ['music_files', 'lastfm_tracks', 'requested_tracks', 'album_tracks']:
                        row_dict = clean_track_data(row_dict)
                    
                    row_dicts.append(row_dict)
                
                # Insert into target
                if row_dicts:
                    try:
                        target_session.execute(target_metadata.tables[table_name].insert(), row_dicts)
                        target_session.commit()
                    except Exception as e:
                        logger.error(f"Error inserting into {table_name}: {e}")
                        # If batch fails, try inserting records one by one to skip problematic rows
                        target_session.rollback()
                        for row in row_dicts:
                            try:
                                target_session.execute(target_metadata.tables[table_name].insert(), [row])
                                target_session.commit()
                            except Exception as inner_e:
                                logger.warning(f"Skipping problematic row in {table_name}: {inner_e}")
                                target_session.rollback()
        
        logger.info("Re-enabling foreign key checks")
        target_session.execute(text("SET FOREIGN_KEY_CHECKS=1"))
        target_session.commit()
        
        logger.info("Migration completed successfully")
        return True
        
    except Exception as e:
        logger.error(f"Error during migration: {e}", exc_info=True)
        target_session.rollback()
        target_session.execute(text("SET FOREIGN_KEY_CHECKS=1"))
        target_session.commit()
        return False
    finally:
        source_session.close()
        target_session.close()

if __name__ == "__main__":
    if migrate_data():
        sys.exit(0)
    else:
        sys.exit(1)