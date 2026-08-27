"""widen genre columns

Revision ID: 9c1a2d7f4e3b
Revises: 8e17d1b8c9a1
Create Date: 2026-08-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9c1a2d7f4e3b'
down_revision: Union[str, None] = '8e17d1b8c9a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.alter_column('track_genres', 'genre',
                     existing_type=sa.String(50),
                     type_=sa.String(255))
    op.alter_column('local_file_genres', 'genre',
                     existing_type=sa.String(50),
                     type_=sa.String(255))


def downgrade():
    op.alter_column('local_file_genres', 'genre',
                     existing_type=sa.String(255),
                     type_=sa.String(50))
    op.alter_column('track_genres', 'genre',
                     existing_type=sa.String(255),
                     type_=sa.String(50))
