from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.exc import OperationalError, ProgrammingError
import os
import sys
import dotenv
import urllib.parse
import logging
import time
import subprocess
from pathlib import Path

dotenv.load_dotenv(override=True)

Base = declarative_base()

class Database:
    _instance = None
    _engine = None
    _sessionmaker = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(Database, cls).__new__(cls)
            
            # MariaDB is the only supported database type
            cls._setup_mariadb()
            
            cls._sessionmaker = sessionmaker(
                autocommit=False, autoflush=False, bind=cls._engine
            )
            
            # Create tables if they don't exist
            try:
                # Check if this is a new database by looking for alembic_version table
                is_new_database = cls._is_new_database()
                
                Base.metadata.create_all(bind=cls._engine)
                logging.info("Database tables initialized successfully")
                
                # If this is a new database, stamp it with the current migration
                if is_new_database:
                    cls._stamp_new_database()
                    
            except Exception as e:
                logging.error(f"Failed to create database tables: {e}")
                raise
                
        return cls._instance

    @classmethod
    def _setup_mariadb(cls):
        """Setup MariaDB connection with database creation if needed"""
        db_host = os.getenv("DB_HOST", "localhost")
        db_port = os.getenv("DB_PORT", "3306")
        db_user = urllib.parse.quote_plus(os.getenv("DB_USER", "playlist"))
        db_pass = urllib.parse.quote_plus(os.getenv("DB_PASSWORD", "password"))
        db_name = os.getenv("DB_NAME", "playlists")
        
        logging.info(f"Configuring MariaDB at {db_host}:{db_port}/{db_name}")
        
        # First try to connect to the specific database
        database_url = f"mysql+pymysql://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"
        connect_args = {"charset": "utf8mb4"}
        
        try:
            # Try to connect to the database directly
            cls._engine = create_engine(
                database_url, 
                echo=(os.getenv("LOG_LEVEL", "INFO") == "DEBUG"),
                connect_args=connect_args,
                pool_pre_ping=True,
                pool_recycle=3600,
            )
            
            # Test the connection
            with cls._engine.connect() as conn:
                conn.execute(text("SELECT 1"))
                logging.info(f"Successfully connected to MariaDB database '{db_name}'")
                
        except (OperationalError, ProgrammingError) as e:
            error_msg = str(e)
            logging.warning(f"Initial connection to database '{db_name}' failed: {e}")
            
            # Check if it's a privilege issue vs database not existing
            if "Access denied" in error_msg and "database" in error_msg:
                # Try connecting without specifying database to check if DB exists
                logging.info("Checking if database exists and user has access...")
                try:
                    admin_url = f"mysql+pymysql://{db_user}:{db_pass}@{db_host}:{db_port}"
                    admin_engine = create_engine(admin_url, connect_args=connect_args)
                    
                    with admin_engine.connect() as conn:
                        # Check if database exists
                        result = conn.execute(text(f"SHOW DATABASES LIKE '{db_name}'"))
                        db_exists = result.fetchone() is not None
                        
                        if db_exists:
                            # Database exists, check user privileges on it
                            try:
                                result = conn.execute(text("SHOW GRANTS"))
                                grants = [row[0] for row in result.fetchall()]
                                has_db_access = any(
                                    f"`{db_name}`" in grant or "ON *.*" in grant 
                                    for grant in grants
                                )
                                
                                if has_db_access:
                                    logging.info(f"Database '{db_name}' exists and user has access. Connection issue may be temporary.")
                                    # Retry the original connection
                                    cls._engine = create_engine(
                                        database_url, 
                                        echo=(os.getenv("LOG_LEVEL", "INFO") == "DEBUG"),
                                        connect_args=connect_args,
                                        pool_pre_ping=True,
                                        pool_recycle=3600,
                                    )
                                    # Test the connection
                                    with cls._engine.connect() as test_conn:
                                        test_conn.execute(text("SELECT 1"))
                                    logging.info(f"Successfully connected to existing database '{db_name}'")
                                    admin_engine.dispose()
                                    return
                                else:
                                    logging.error(f"Database '{db_name}' exists but user '{db_user}' lacks privileges")
                                    
                            except Exception as grant_e:
                                logging.warning(f"Could not check user privileges: {grant_e}")
                        
                        admin_engine.dispose()
                        
                    # If we get here, either DB doesn't exist or user lacks privileges
                    if not db_exists:
                        logging.info(f"Database '{db_name}' does not exist, attempting to create...")
                    
                except Exception as check_e:
                    logging.warning(f"Could not check database existence: {check_e}")
                
                # Try to use root credentials if available
                root_password = os.getenv("MARIADB_ROOT_PASSWORD")
                if root_password and not db_exists:
                    logging.info("Database doesn't exist and root password available, attempting creation as root...")
                    try:
                        root_user_encoded = urllib.parse.quote_plus("root")
                        root_pass_encoded = urllib.parse.quote_plus(root_password)
                        root_url = f"mysql+pymysql://{root_user_encoded}:{root_pass_encoded}@{db_host}:{db_port}"
                        
                        root_engine = create_engine(root_url, connect_args=connect_args)
                        with root_engine.connect() as conn:
                            conn.execute(text(f"CREATE DATABASE IF NOT EXISTS `{db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"))
                            conn.execute(text(f"GRANT ALL PRIVILEGES ON `{db_name}`.* TO '{db_user}'@'%'"))
                            conn.commit()
                            logging.info(f"Successfully created database '{db_name}' and granted privileges")
                        
                        root_engine.dispose()
                        
                        # Now connect with the original user
                        cls._engine = create_engine(
                            database_url, 
                            echo=(os.getenv("LOG_LEVEL", "INFO") == "DEBUG"),
                            connect_args=connect_args,
                            pool_pre_ping=True,
                            pool_recycle=3600,
                        )
                        logging.info(f"Successfully connected after root setup")
                        return
                        
                    except Exception as root_e:
                        logging.error(f"Failed to create database as root: {root_e}")
                
                # Provide helpful error message
                logging.error(f"Cannot resolve database connection issue:")
                logging.error(f"- Database: {db_name}")  
                logging.error(f"- User: {db_user}")
                logging.error(f"- Error: {error_msg}")
                logging.error("Possible solutions:")
                logging.error("1. Ensure database exists and user has privileges:")
                logging.error(f"   GRANT ALL PRIVILEGES ON `{db_name}`.* TO '{db_user}'@'%';")
                logging.error("2. Run the setup utility:")
                logging.error("   python setup_mariadb.py")
                
                raise Exception(f"Database connection failed: {e}")
            
            # Original database creation logic for other errors
            logging.info(f"Attempting to create database '{db_name}'...")
            
            admin_url = f"mysql+pymysql://{db_user}:{db_pass}@{db_host}:{db_port}"
            max_retries = 10
            retry_count = 0
            
            while retry_count < max_retries:
                try:
                    admin_engine = create_engine(admin_url, connect_args=connect_args)
                    
                    with admin_engine.connect() as conn:
                        conn.execute(text(f"CREATE DATABASE IF NOT EXISTS `{db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"))
                        conn.commit()
                        logging.info(f"Database '{db_name}' created successfully")
                    
                    admin_engine.dispose()
                    break
                    
                except OperationalError as retry_e:
                    retry_count += 1
                    if "Can't connect to MySQL server" in str(retry_e) or "Connection refused" in str(retry_e):
                        logging.warning(f"MariaDB not ready yet (attempt {retry_count}/{max_retries}). Waiting 2 seconds...")
                        time.sleep(2)
                    else:
                        logging.error(f"Failed to create database after {retry_count} attempts: {retry_e}")
                        raise
                        
                except Exception as retry_e:
                    logging.error(f"Unexpected error creating database: {retry_e}")
                    raise
                    
            if retry_count >= max_retries:
                raise Exception(f"Could not connect to MariaDB after {max_retries} attempts")
            
            # Now connect to the created database
            cls._engine = create_engine(
                database_url, 
                echo=(os.getenv("LOG_LEVEL", "INFO") == "DEBUG"),
                connect_args=connect_args,
                pool_pre_ping=True,
                pool_recycle=3600,
            )
            
            logging.info(f"Successfully connected to MariaDB database '{db_name}'")
    
    @classmethod
    def _is_new_database(cls):
        """Check if this is a new database by looking for alembic_version table and data"""
        try:
            with cls._engine.connect() as conn:
                # Check if alembic_version table exists and has data
                result = conn.execute(text("SELECT COUNT(*) FROM alembic_version"))
                count = result.fetchone()[0]
                
                # If the table exists but has no rows, treat as new database
                if count == 0:
                    logging.info("Found empty alembic_version table, treating as new database")
                    return True
                    
                # If it has rows, check if we can get the version
                result = conn.execute(text("SELECT version_num FROM alembic_version LIMIT 1"))
                version = result.fetchone()
                
                if version and version[0]:
                    logging.info(f"Found existing migration version: {version[0]}")
                    return False
                else:
                    logging.info("Found null version in alembic_version, treating as new database")
                    return True
                    
        except Exception as e:
            # If we get any exception (table doesn't exist, etc.), assume it's a new database
            logging.info(f"Exception checking alembic_version table, treating as new database: {e}")
            return True
    
    @classmethod
    def _stamp_new_database(cls):
        """Stamp a new database with the current migration head"""
        try:
            # Get the directory where this file is located (backend directory)
            backend_dir = os.path.dirname(__file__)
            
            # First, try to stamp head directly
            result = subprocess.run(
                ["alembic", "stamp", "head"],
                cwd=backend_dir,
                capture_output=True,
                text=True,
                check=True
            )
            
            logging.info("New database stamped with current migration head")
            logging.debug(f"Alembic stamp output: {result.stdout}")
            
        except subprocess.CalledProcessError as e:
            # If stamping fails, it might be because alembic hasn't been initialized
            # This can happen if the alembic_version table doesn't exist at all
            logging.warning(f"Failed to stamp database directly: {e.stderr}")
            
            try:
                # Try to create the alembic_version table first by running a dummy migration check
                logging.info("Attempting to initialize Alembic version table...")
                subprocess.run(
                    ["alembic", "current"],
                    cwd=backend_dir,
                    capture_output=True,
                    text=True,
                    check=True
                )
                
                # Now try stamping again
                result = subprocess.run(
                    ["alembic", "stamp", "head"],
                    cwd=backend_dir,
                    capture_output=True,
                    text=True,
                    check=True
                )
                
                logging.info("New database stamped with current migration head after initialization")
                logging.debug(f"Alembic stamp output: {result.stdout}")
                
            except subprocess.CalledProcessError as e2:
                logging.warning(f"Failed to stamp new database with migration: {e2.stderr}")
                logging.warning("Database will show all migrations as pending, but this is non-fatal")
                
        except Exception as e:
            logging.warning(f"Unexpected error stamping database: {e}")
            logging.warning("Database will show all migrations as pending, but this is non-fatal")

    @classmethod
    def get_session(cls):
        if not cls._instance:
            cls()
        return cls._sessionmaker()

    @classmethod
    def get_engine(cls):
        if not cls._instance:
            cls()
        return cls._engine

    @classmethod
    def get_database_info(cls):
        """Get information about the current MariaDB database configuration"""
        if not cls._instance:
            cls()
            
        info = {
            "type": "mariadb",
            "url": str(cls._engine.url).replace(cls._engine.url.password or "", "***") if cls._engine.url.password else str(cls._engine.url),
            "connected": False
        }
        
        try:
            with cls._engine.connect() as conn:
                conn.execute(text("SELECT 1"))
                info["connected"] = True
        except Exception as e:
            info["error"] = str(e)
            
        return info

    @classmethod 
    def test_connection(cls):
        """Test the database connection and return status"""
        try:
            if not cls._instance:
                cls()
                
            with cls._engine.connect() as conn:
                conn.execute(text("SELECT 1"))
                return True, "Connection successful"
                
        except Exception as e:
            return False, str(e)
