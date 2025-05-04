"""remove_lastfm_url_unique_constraint

Revision ID: fddadfd24416
Revises: 210027997761
Create Date: 2025-05-04 11:28:02.906997

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fddadfd24416'
down_revision: Union[str, None] = '210027997761'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_index('ix_lastfm_tracks_url', table_name='lastfm_tracks')
    
    # Create a new non-unique index
    op.create_index('ix_lastfm_tracks_url', 'lastfm_tracks', ['url'], unique=False)



def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_lastfm_tracks_url', table_name='lastfm_tracks')
    
    # Recreate the unique index (warning: this might fail if there are duplicate URLs)
    op.create_index('ix_lastfm_tracks_url', 'lastfm_tracks', ['url'], unique=True)
