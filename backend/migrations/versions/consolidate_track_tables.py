"""consolidate lastfm and requested tracks into music files

Revision ID: consolidate_track_tables
Revises: b5caaba5e7d9
Create Date: 2025-01-XX XX:XX:XX.XXXXXX

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text


# revision identifiers, used by Alembic.
revision: str = 'consolidate_track_tables'
down_revision: Union[str, None] = 'b5caaba5e7d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Consolidate lastfm and requested tracks into music files table with separate local_files and external_sources."""
    conn = op.get_bind()
    
    print("Starting migration...")
    
    # Step 1: Create new tables for the refactored structure
    print("Creating new tables...")
    
    op.create_table('local_files',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('path', sa.String(1024), index=True, unique=True),
        sa.Column('kind', sa.String(32), index=True),
        sa.Column('first_scanned', sa.DateTime()),
        sa.Column('last_scanned', sa.DateTime(), index=True),
        sa.Column('size', sa.Integer()),
        sa.Column('missing', sa.Boolean(), default=False),
        
        # File-based metadata
        sa.Column('file_title', sa.String(1024), index=True, nullable=True),
        sa.Column('file_artist', sa.String(1024), index=True, nullable=True),
        sa.Column('file_album_artist', sa.String(1024), index=True, nullable=True),
        sa.Column('file_album', sa.String(1024), index=True, nullable=True),
        sa.Column('file_year', sa.String(32), index=True, nullable=True),
        sa.Column('file_length', sa.Integer(), index=True, nullable=True),
        sa.Column('file_publisher', sa.String(255), index=True, nullable=True),
        sa.Column('file_rating', sa.Integer(), index=True, nullable=True),
        sa.Column('file_comments', sa.Text(1024), nullable=True),
        sa.Column('file_disc_number', sa.Integer(), nullable=True),
        sa.Column('file_track_number', sa.Integer(), nullable=True),
        
        sa.Column('music_file_id', sa.Integer(), sa.ForeignKey('music_files.id'), nullable=True)
    )
    
    op.create_table('local_file_genres',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('local_file_id', sa.Integer(), sa.ForeignKey('local_files.id'), nullable=False),
        sa.Column('genre', sa.String(50), index=True)
    )
    
    op.create_table('external_sources',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('source_type', sa.String(50), nullable=False),
        sa.Column('external_id', sa.String(1024), nullable=False),
        sa.Column('url', sa.String(1024), nullable=True),
        sa.Column('music_file_id', sa.Integer(), sa.ForeignKey('music_files.id'), nullable=False)
    )
    
    op.create_index('external_sources_music_file_type_idx', 'external_sources', ['music_file_id', 'source_type'])
    
    # Step 2: Create new music_files table structure (WITHOUT notes - notes belong to playlist entries)
    print("Creating new music_files table...")
    
    op.create_table('music_files_new',
        sa.Column('id', sa.Integer(), sa.ForeignKey('base_elements.id'), primary_key=True),
        sa.Column('title', sa.String(1024), index=True, nullable=True),
        sa.Column('artist', sa.String(1024), index=True, nullable=True),
        sa.Column('album_artist', sa.String(1024), index=True, nullable=True),
        sa.Column('album', sa.String(1024), index=True, nullable=True),
        sa.Column('year', sa.String(32), index=True, nullable=True),
        sa.Column('exact_release_date', sa.DateTime(), index=True, nullable=True),
        sa.Column('release_year', sa.Integer(), index=True, nullable=True),
        sa.Column('length', sa.Integer(), index=True, nullable=True),
        sa.Column('publisher', sa.String(255), index=True, nullable=True),
        sa.Column('rating', sa.Integer(), index=True, nullable=True),
        sa.Column('comments', sa.Text(1024), nullable=True),  # Keep comments on music file
        sa.Column('disc_number', sa.Integer(), nullable=True),
        sa.Column('track_number', sa.Integer(), nullable=True)
        # NOTE: notes field removed - it belongs to playlist entries
    )
    
    # Step 2.5: Add notes column to playlist_entries table
    print("Adding notes column to playlist_entries...")
    
    # Check if notes column already exists
    inspector = sa.inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('playlist_entries')]
    
    if 'notes' not in columns:
        op.add_column('playlist_entries', sa.Column('notes', sa.Text(), nullable=True))
    
    # Step 3: Bulk migrate existing music_files data (without notes)
    print("Bulk migrating existing music_files metadata...")
    
    # Insert metadata using bulk INSERT FROM SELECT (excluding notes)
    conn.execute(text("""
        INSERT INTO music_files_new (
            id, title, artist, album_artist, album, year,
            exact_release_date, release_year, length, publisher,
            rating, comments, disc_number, track_number
        )
        SELECT 
            id, title, artist, album_artist, album, year,
            exact_release_date, release_year, length, publisher,
            rating, comments, disc_number, track_number
        FROM music_files
    """))
    
    print("Bulk creating local_files records...")
    
    # Bulk insert local files for tracks that have path data
    conn.execute(text("""
        INSERT INTO local_files (
            path, kind, first_scanned, last_scanned, size, missing, 
            file_title, file_artist, file_album_artist, file_album, file_year,
            file_length, file_publisher, file_rating, file_comments,
            file_disc_number, file_track_number, music_file_id
        )
        SELECT 
            path, kind, first_scanned, last_scanned, size, 
            COALESCE(missing, 0) as missing,
            title, artist, album_artist, album, year,
            length, publisher, rating, comments,
            disc_number, track_number, id
        FROM music_files 
        WHERE path IS NOT NULL AND path != ''
    """))
    
    print("Bulk migrating local file genres...")
    
    # Bulk migrate genres to local_file_genres using JOIN
    conn.execute(text("""
        INSERT INTO local_file_genres (local_file_id, genre)
        SELECT lf.id, tg.genre
        FROM local_files lf
        JOIN track_genres tg ON tg.music_file_id = lf.music_file_id 
            AND tg.parent_type = 'music_file'
    """))
    
    print("Bulk creating external sources...")
    
    # Bulk insert external sources using UNION ALL for better performance
    conn.execute(text("""
        INSERT INTO external_sources (source_type, external_id, url, music_file_id)
        SELECT 'lastfm', last_fm_url, last_fm_url, id
        FROM music_files 
        WHERE last_fm_url IS NOT NULL AND last_fm_url != ''
        
        UNION ALL
        
        SELECT 'spotify', spotify_uri, NULL, id
        FROM music_files 
        WHERE spotify_uri IS NOT NULL AND spotify_uri != ''
        
        UNION ALL
        
        SELECT 'youtube', youtube_url, youtube_url, id
        FROM music_files 
        WHERE youtube_url IS NOT NULL AND youtube_url != ''
        
        UNION ALL
        
        SELECT 'musicbrainz', mbid, NULL, id
        FROM music_files 
        WHERE mbid IS NOT NULL AND mbid != ''
        
        UNION ALL
        
        SELECT 'plex', plex_rating_key, NULL, id
        FROM music_files 
        WHERE plex_rating_key IS NOT NULL AND plex_rating_key != ''
    """))
    
    # Step 4: Bulk migrate lastfm_tracks (without notes - notes go to playlist entries)
    print("Bulk migrating lastfm_tracks...")
    
    conn.execute(text("""
        INSERT INTO music_files_new (
            id, title, artist, album_artist, album, year,
            exact_release_date, release_year, length, publisher,
            rating, comments, disc_number, track_number
        )
        SELECT 
            id, title, artist, album_artist, album, year,
            exact_release_date, release_year, length, publisher,
            rating, comments, disc_number, track_number
        FROM lastfm_tracks
    """))
    
    # Bulk create external sources for lastfm tracks
    conn.execute(text("""
        INSERT INTO external_sources (source_type, external_id, url, music_file_id)
        SELECT 'lastfm', url, url, id
        FROM lastfm_tracks 
        WHERE url IS NOT NULL AND url != ''
        
        UNION ALL
        
        SELECT 'musicbrainz', mbid, NULL, id
        FROM lastfm_tracks 
        WHERE mbid IS NOT NULL AND mbid != ''
    """))
    
    # Step 5: Bulk migrate requested_tracks (without notes - notes go to playlist entries)
    print("Bulk migrating requested_tracks...")
    
    conn.execute(text("""
        INSERT INTO music_files_new (
            id, title, artist, album_artist, album, year,
            exact_release_date, release_year, length, publisher,
            rating, comments, disc_number, track_number
        )
        SELECT 
            id, title, artist, album_artist, album, year,
            exact_release_date, release_year, length, publisher,
            rating, comments, disc_number, track_number
        FROM requested_tracks
    """))
    
    # Step 6: Bulk update base_elements
    print("Updating base_elements...")
    
    conn.execute(text("""
        UPDATE base_elements 
        SET entry_type = 'music_file' 
        WHERE entry_type IN ('lastfm_track', 'requested_track')
    """))
    
    # Step 7: Replace music_files table
    print("Replacing music_files table...")
    op.drop_table('music_files')
    op.rename_table('music_files_new', 'music_files')
    
    # Step 8: Bulk update playlist entries
    print("Updating playlist entries...")
    
    # Update entry types in bulk
    conn.execute(text("""
        UPDATE playlist_entries 
        SET entry_type = 'music_file' 
        WHERE entry_type IN ('lastfm', 'requested')
    """))
    
    # Bulk update music_file_entries for lastfm entries
    conn.execute(text("""
        UPDATE music_file_entries 
        SET music_file_id = (
            SELECT lastfm_track_id 
            FROM lastfm_entries 
            WHERE lastfm_entries.id = music_file_entries.id
        )
        WHERE id IN (
            SELECT id FROM lastfm_entries WHERE lastfm_track_id IS NOT NULL
        )
    """))
    
    # Bulk insert music_file_entries for requested entries
    conn.execute(text("""
        INSERT INTO music_file_entries (id, music_file_id)
        SELECT re.id, re.requested_track_id
        FROM requested_entries re
        WHERE re.requested_track_id IS NOT NULL
        AND re.id NOT IN (SELECT id FROM music_file_entries)
    """))
    
    # Step 9: Bulk migrate genres
    print("Migrating genre relationships...")
    
    conn.execute(text("""
        UPDATE track_genres 
        SET parent_type = 'music_file', music_file_id = lastfm_track_id
        WHERE parent_type = 'lastfm' AND lastfm_track_id IS NOT NULL
    """))
    
    conn.execute(text("""
        UPDATE track_genres 
        SET parent_type = 'music_file', music_file_id = requested_track_id
        WHERE parent_type = 'requested' AND requested_track_id IS NOT NULL
    """))
    
    # Step 10: Clean up
    print("Cleaning up old tables...")
    
    op.drop_table('lastfm_entries')
    op.drop_table('requested_entries')
    op.drop_table('lastfm_tracks')
    op.drop_table('requested_tracks')
    
    # Recreate track_genres without old columns
    print("Recreating track_genres table...")
    
    op.create_table('track_genres_new',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('parent_type', sa.String(50), nullable=False),
        sa.Column('music_file_id', sa.Integer(), sa.ForeignKey('music_files.id'), nullable=True),
        sa.Column('genre', sa.String(50), index=True)
    )
    
    conn.execute(text("""
        INSERT INTO track_genres_new (id, parent_type, music_file_id, genre)
        SELECT id, parent_type, music_file_id, genre
        FROM track_genres
        WHERE parent_type = 'music_file' AND music_file_id IS NOT NULL
    """))
    
    op.drop_table('track_genres')
    op.rename_table('track_genres_new', 'track_genres')
    
    print("Migration completed!")


def downgrade() -> None:
    """Reverse the consolidation - split music_files back into separate tables."""
    raise NotImplementedError("Downgrade not implemented due to complexity")