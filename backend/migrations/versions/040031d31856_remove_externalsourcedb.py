"""remove ExternalSourceDB

Revision ID: 040031d31856
Revises: e61851716f7c
Create Date: 2025-08-03 12:33:08.609991

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '040031d31856'
down_revision: Union[str, None] = 'e61851716f7c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""    
    print("Migrating external source data back to music_files table...")

    # add columns
    op.add_column('music_files', sa.Column('last_fm_url', sa.String(1024), nullable=True))
    op.add_column('music_files', sa.Column('spotify_uri', sa.String(1024), nullable=True))
    op.add_column('music_files', sa.Column('youtube_url', sa.String(1024), nullable=True))
    op.add_column('music_files', sa.Column('mbid', sa.String(1024), nullable=True))
    op.add_column('music_files', sa.Column('plex_rating_key', sa.String(1024), nullable=True))

    # move data
    conn = op.get_bind()
    conn.execute(sa.text("""
        UPDATE music_files
        SET last_fm_url = (SELECT url FROM external_sources WHERE music_file_id = music_files.id AND source_type = 'lastfm'),
            spotify_uri = (SELECT external_id FROM external_sources WHERE music_file_id = music_files.id AND source_type = 'spotify'),
            youtube_url = (SELECT url FROM external_sources WHERE music_file_id = music_files.id AND source_type = 'youtube'),
            mbid = (SELECT external_id FROM external_sources WHERE music_file_id = music_files.id AND source_type = 'musicbrainz'),
            plex_rating_key = (SELECT external_id FROM external_sources WHERE music_file_id = music_files.id AND source_type = 'plex')
    """))

    print("Dropping external_sources table...")
    # Don't drop the index separately - just drop the table
    # The index will be dropped automatically when the table is dropped
    op.drop_table('external_sources')
    
    print("Migration completed!")


def downgrade() -> None:
    """Downgrade schema."""    
    print("Recreating external_sources table...")
    
    # Recreate the external_sources table
    op.create_table('external_sources',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('source_type', sa.String(50), nullable=False),
        sa.Column('external_id', sa.String(1024), nullable=False),
        sa.Column('url', sa.String(1024), nullable=True),
        sa.Column('music_file_id', sa.Integer(), sa.ForeignKey('music_files.id'), nullable=False)
    )
    
    op.create_index('external_sources_music_file_type_idx', 'external_sources', ['music_file_id', 'source_type'])