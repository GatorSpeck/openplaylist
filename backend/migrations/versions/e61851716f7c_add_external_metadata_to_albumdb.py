"""add external metadata to AlbumDB

Revision ID: e61851716f7c
Revises: 8585ce0935c5
Create Date: 2025-08-03 12:13:37.893518

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e61851716f7c'
down_revision: Union[str, None] = '8585ce0935c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # Add missing columns to albums table
    op.add_column('albums', sa.Column('exact_release_date', sa.DateTime(), nullable=True))
    op.add_column('albums', sa.Column('spotify_uri', sa.String(1024), nullable=True))
    op.add_column('albums', sa.Column('plex_rating_key', sa.String(1024), nullable=True))
    op.add_column('albums', sa.Column('youtube_url', sa.String(1024), nullable=True))
    
    # Add indexes
    op.create_index('ix_albums_exact_release_date', 'albums', ['exact_release_date'])

def downgrade():
    # Remove indexes
    op.drop_index('ix_albums_exact_release_date', table_name='albums')
    
    # Remove columns
    op.drop_column('albums', 'youtube_url')
    op.drop_column('albums', 'plex_rating_key')
    op.drop_column('albums', 'spotify_uri')
    op.drop_column('albums', 'exact_release_date')