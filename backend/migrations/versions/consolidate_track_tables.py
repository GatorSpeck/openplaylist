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
    
    # Step 1: Create new tables for the refactored structure
    print("Creating local_files table...")
    op.create_table('local_files',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('path', sa.String(1024), index=True, unique=True),
        sa.Column('kind', sa.String(32), index=True),
        sa.Column('first_scanned', sa.DateTime()),
        sa.Column('last_scanned', sa.DateTime(), index=True),
        sa.Column('size', sa.Integer()),
        sa.Column('missing', sa.Boolean(), default=False),
        
        # File-based metadata (what was read from the file tags)
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
    
    print("Creating local_file_genres table...")
    op.create_table('local_file_genres',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('local_file_id', sa.Integer(), sa.ForeignKey('local_files.id'), nullable=False),
        sa.Column('genre', sa.String(50), index=True)
    )
    
    print("Creating external_sources table...")
    op.create_table('external_sources',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('source_type', sa.String(50), nullable=False),
        sa.Column('external_id', sa.String(1024), nullable=False),
        sa.Column('url', sa.String(1024), nullable=True),
        sa.Column('music_file_id', sa.Integer(), sa.ForeignKey('music_files.id'), nullable=False)
    )
    
    # Create index for external_sources
    op.create_index('external_sources_music_file_type_idx', 'external_sources', ['music_file_id', 'source_type'])
    
    # Step 2: Remove local file columns from music_files table (for SQLite, we need to recreate)
    print("Recreating music_files table without local file columns...")
    
    # Create new music_files table with only metadata columns
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
        sa.Column('notes', sa.Text(1024), nullable=True),
        sa.Column('comments', sa.Text(1024), nullable=True),
        sa.Column('disc_number', sa.Integer(), nullable=True),
        sa.Column('track_number', sa.Integer(), nullable=True)
    )
    
    # Step 3: Migrate existing music_files data
    print("Migrating existing music_files data...")
    
    # Get all existing music files with their local file data
    existing_music_files = conn.execute(text("""
        SELECT 
            id, path, kind, first_scanned, last_scanned, size, missing,
            last_fm_url, spotify_uri, youtube_url, mbid, plex_rating_key,
            title, artist, album_artist, album, year,
            exact_release_date, release_year, length, publisher,
            rating, notes, comments, disc_number, track_number
        FROM music_files
    """)).fetchall()
    
    # Insert metadata into new music_files table
    for track in existing_music_files:
        conn.execute(text("""
            INSERT INTO music_files_new (
                id, title, artist, album_artist, album, year,
                exact_release_date, release_year, length, publisher,
                rating, notes, comments, disc_number, track_number
            ) VALUES (
                :id, :title, :artist, :album_artist, :album, :year,
                :exact_release_date, :release_year, :length, :publisher,
                :rating, :notes, :comments, :disc_number, :track_number
            )
        """), {
            "id": track.id,
            "title": track.title,
            "artist": track.artist,
            "album_artist": track.album_artist,
            "album": track.album,
            "year": track.year,
            "exact_release_date": track.exact_release_date,
            "release_year": track.release_year,
            "length": track.length,
            "publisher": track.publisher,
            "rating": track.rating,
            "notes": track.notes,
            "comments": track.comments,
            "disc_number": track.disc_number,
            "track_number": track.track_number
        })
        
        # Create local file record if path exists
        if track.path:
            local_file_id = conn.execute(text("""
                INSERT INTO local_files (
                    path, kind, first_scanned, last_scanned, size, missing, 
                    file_title, file_artist, file_album_artist, file_album, file_year,
                    file_length, file_publisher, file_rating, file_comments,
                    file_disc_number, file_track_number, music_file_id
                ) VALUES (
                    :path, :kind, :first_scanned, :last_scanned, :size, :missing,
                    :file_title, :file_artist, :file_album_artist, :file_album, :file_year,
                    :file_length, :file_publisher, :file_rating, :file_comments,
                    :file_disc_number, :file_track_number, :music_file_id
                ) RETURNING id
            """), {
                "path": track.path,
                "kind": track.kind,
                "first_scanned": track.first_scanned,
                "last_scanned": track.last_scanned,
                "size": track.size,
                "missing": track.missing or False,
                # Initially, file metadata matches the current metadata
                "file_title": track.title,
                "file_artist": track.artist,
                "file_album_artist": track.album_artist,
                "file_album": track.album,
                "file_year": track.year,
                "file_length": track.length,
                "file_publisher": track.publisher,
                "file_rating": track.rating,
                "file_comments": track.comments,
                "file_disc_number": track.disc_number,
                "file_track_number": track.track_number,
                "music_file_id": track.id
            }).fetchone()
            
            # Migrate genres from track_genres to local_file_genres for this file
            existing_genres = conn.execute(text("""
                SELECT genre FROM track_genres 
                WHERE parent_type = 'music_file' AND music_file_id = :music_file_id
            """), {"music_file_id": track.id}).fetchall()
            
            for genre_row in existing_genres:
                conn.execute(text("""
                    INSERT INTO local_file_genres (local_file_id, genre)
                    VALUES (:local_file_id, :genre)
                """), {
                    "local_file_id": local_file_id[0] if local_file_id else local_file_id.id,
                    "genre": genre_row.genre
                })
        
        # Create external source records for existing external data
        if track.last_fm_url:
            conn.execute(text("""
                INSERT INTO external_sources (source_type, external_id, url, music_file_id)
                VALUES ('lastfm', :external_id, :url, :music_file_id)
            """), {
                "external_id": track.last_fm_url,
                "url": track.last_fm_url,
                "music_file_id": track.id
            })
        
        if track.spotify_uri:
            conn.execute(text("""
                INSERT INTO external_sources (source_type, external_id, url, music_file_id)
                VALUES ('spotify', :external_id, NULL, :music_file_id)
            """), {
                "external_id": track.spotify_uri,
                "music_file_id": track.id
            })
        
        if track.youtube_url:
            conn.execute(text("""
                INSERT INTO external_sources (source_type, external_id, url, music_file_id)
                VALUES ('youtube', :external_id, :url, :music_file_id)
            """), {
                "external_id": track.youtube_url,
                "url": track.youtube_url,
                "music_file_id": track.id
            })
        
        if track.mbid:
            conn.execute(text("""
                INSERT INTO external_sources (source_type, external_id, url, music_file_id)
                VALUES ('musicbrainz', :external_id, NULL, :music_file_id)
            """), {
                "external_id": track.mbid,
                "music_file_id": track.id
            })
        
        if track.plex_rating_key:
            conn.execute(text("""
                INSERT INTO external_sources (source_type, external_id, url, music_file_id)
                VALUES ('plex', :external_id, NULL, :music_file_id)
            """), {
                "external_id": track.plex_rating_key,
                "music_file_id": track.id
            })
    
    # Step 4: Migrate lastfm_tracks to music_files
    print("Migrating lastfm_tracks to music_files...")
    
    # Get all lastfm tracks with their data
    lastfm_tracks = conn.execute(text("""
        SELECT 
            lt.id, lt.url, lt.mbid,
            lt.title, lt.artist, lt.album_artist, lt.album, lt.year,
            lt.exact_release_date, lt.release_year, lt.length, lt.publisher,
            lt.rating, lt.notes, lt.comments, lt.disc_number, lt.track_number
        FROM lastfm_tracks lt
    """)).fetchall()
    
    # Insert into new music_files table
    for track in lastfm_tracks:
        conn.execute(text("""
            INSERT INTO music_files_new (
                id, title, artist, album_artist, album, year,
                exact_release_date, release_year, length, publisher,
                rating, notes, comments, disc_number, track_number
            ) VALUES (
                :id, :title, :artist, :album_artist, :album, :year,
                :exact_release_date, :release_year, :length, :publisher,
                :rating, :notes, :comments, :disc_number, :track_number
            )
        """), {
            "id": track.id,
            "title": track.title,
            "artist": track.artist,
            "album_artist": track.album_artist,
            "album": track.album,
            "year": track.year,
            "exact_release_date": track.exact_release_date,
            "release_year": track.release_year,
            "length": track.length,
            "publisher": track.publisher,
            "rating": track.rating,
            "notes": track.notes,
            "comments": track.comments,
            "disc_number": track.disc_number,
            "track_number": track.track_number
        })
        
        # Create external source record for Last.fm
        if track.url:
            conn.execute(text("""
                INSERT INTO external_sources (source_type, external_id, url, music_file_id)
                VALUES ('lastfm', :external_id, :url, :music_file_id)
            """), {
                "external_id": track.url,
                "url": track.url,
                "music_file_id": track.id
            })
        
        if track.mbid:
            conn.execute(text("""
                INSERT INTO external_sources (source_type, external_id, url, music_file_id)
                VALUES ('musicbrainz', :external_id, NULL, :music_file_id)
            """), {
                "external_id": track.mbid,
                "music_file_id": track.id
            })
    
    # Update base_elements entry_type for migrated lastfm tracks
    conn.execute(text("""
        UPDATE base_elements 
        SET entry_type = 'music_file' 
        WHERE entry_type = 'lastfm_track'
    """))
    
    # Step 5: Migrate requested_tracks to music_files
    print("Migrating requested_tracks to music_files...")
    
    # Get all requested tracks with their data
    requested_tracks = conn.execute(text("""
        SELECT 
            rt.id,
            rt.title, rt.artist, rt.album_artist, rt.album, rt.year,
            rt.exact_release_date, rt.release_year, rt.length, rt.publisher,
            rt.rating, rt.notes, rt.comments, rt.disc_number, rt.track_number
        FROM requested_tracks rt
    """)).fetchall()
    
    # Insert into new music_files table
    for track in requested_tracks:
        conn.execute(text("""
            INSERT INTO music_files_new (
                id, title, artist, album_artist, album, year,
                exact_release_date, release_year, length, publisher,
                rating, notes, comments, disc_number, track_number
            ) VALUES (
                :id, :title, :artist, :album_artist, :album, :year,
                :exact_release_date, :release_year, :length, :publisher,
                :rating, :notes, :comments, :disc_number, :track_number
            )
        """), {
            "id": track.id,
            "title": track.title,
            "artist": track.artist,
            "album_artist": track.album_artist,
            "album": track.album,
            "year": track.year,
            "exact_release_date": track.exact_release_date,
            "release_year": track.release_year,
            "length": track.length,
            "publisher": track.publisher,
            "rating": track.rating,
            "notes": track.notes,
            "comments": track.comments,
            "disc_number": track.disc_number,
            "track_number": track.track_number
        })
    
    # Update base_elements entry_type for migrated requested tracks
    conn.execute(text("""
        UPDATE base_elements 
        SET entry_type = 'music_file' 
        WHERE entry_type = 'requested_track'
    """))
    
    # Step 6: Replace old music_files table with new one
    print("Replacing music_files table...")
    op.drop_table('music_files')
    op.rename_table('music_files_new', 'music_files')
    
    # Step 7: Update playlist entries to point to music_files
    print("Updating playlist entries...")
    
    # Update lastfm_entries to become music_file_entries
    conn.execute(text("""
        UPDATE playlist_entries 
        SET entry_type = 'music_file' 
        WHERE entry_type = 'lastfm'
    """))
    
    # Update music_file_entries table for former lastfm entries
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
    
    # Update requested_entries to become music_file_entries
    conn.execute(text("""
        UPDATE playlist_entries 
        SET entry_type = 'music_file' 
        WHERE entry_type = 'requested'
    """))
    
    # Insert new music_file_entries records for former requested entries
    conn.execute(text("""
        INSERT INTO music_file_entries (id, music_file_id)
        SELECT re.id, re.requested_track_id
        FROM requested_entries re
        WHERE re.requested_track_id IS NOT NULL
        AND re.id NOT IN (SELECT id FROM music_file_entries)
    """))
    
    # Update existing music_file_entries records for requested entries
    conn.execute(text("""
        UPDATE music_file_entries 
        SET music_file_id = (
            SELECT requested_track_id 
            FROM requested_entries 
            WHERE requested_entries.id = music_file_entries.id
        )
        WHERE id IN (
            SELECT id FROM requested_entries WHERE requested_track_id IS NOT NULL
        )
        AND music_file_id IS NULL
    """))
    
    # Step 8: Migrate genre relationships
    print("Migrating genre relationships...")
    
    # Update track_genres to point to music_file instead of lastfm_track
    conn.execute(text("""
        UPDATE track_genres 
        SET parent_type = 'music_file', music_file_id = lastfm_track_id
        WHERE parent_type = 'lastfm' AND lastfm_track_id IS NOT NULL
    """))
    
    # Update track_genres to point to music_file instead of requested_track
    conn.execute(text("""
        UPDATE track_genres 
        SET parent_type = 'music_file', music_file_id = requested_track_id
        WHERE parent_type = 'requested' AND requested_track_id IS NOT NULL
    """))
    
    # Step 9: Clean up old tables and columns
    print("Cleaning up old tables...")
    
    # Drop the old entry tables
    op.drop_table('lastfm_entries')
    op.drop_table('requested_entries')
    
    # Drop the old track tables
    op.drop_table('lastfm_tracks')
    op.drop_table('requested_tracks')
    
    # Recreate track_genres table without the old foreign key columns
    print("Recreating track_genres table...")
    
    op.create_table('track_genres_new',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('parent_type', sa.String(50), nullable=False),
        sa.Column('music_file_id', sa.Integer(), sa.ForeignKey('music_files.id'), nullable=True),
        sa.Column('genre', sa.String(50), index=True)
    )
    
    # Copy data from old table to new table
    conn.execute(text("""
        INSERT INTO track_genres_new (id, parent_type, music_file_id, genre)
        SELECT id, parent_type, music_file_id, genre
        FROM track_genres
    """))
    
    # Drop old table and rename new table
    op.drop_table('track_genres')
    op.rename_table('track_genres_new', 'track_genres')


def downgrade() -> None:
    """Reverse the consolidation - split music_files back into separate tables."""
    # This is a complex downgrade that would need to recreate the old structure
    # For brevity, showing the key table recreations:
    
    # Would need to recreate all old tables and move data back from
    # music_files, local_files, and external_sources tables
    raise NotImplementedError("Downgrade not implemented due to complexity")