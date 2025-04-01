"""save album URL along with album

Revision ID: 452de8f7c7c7
Revises: 7f6ab2133cca
Create Date: 2025-03-24 22:48:50.704744

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '452de8f7c7c7'
down_revision: Union[str, None] = '7f6ab2133cca'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add column works fine with SQLite
    try:
        op.add_column('albums', sa.Column('last_fm_url', sa.String(), nullable=True))
    except sa.exc.OperationalError:
        # Handle the case where the column already exists
        pass


def downgrade() -> None:
    """Downgrade schema."""
    # Use batch operations for constraint modifications
    op.drop_column('albums', 'last_fm_url')
