"""empty message

Revision ID: 8585ce0935c5
Revises: 2cd52f5e6fad, consolidate_track_tables
Create Date: 2025-08-03 12:13:35.285597

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8585ce0935c5'
down_revision: Union[str, None] = ('2cd52f5e6fad', 'consolidate_track_tables')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
