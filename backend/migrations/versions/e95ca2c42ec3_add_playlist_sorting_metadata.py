"""add playlist sorting metadata

Revision ID: e95ca2c42ec3
Revises: d4312ed97da7
Create Date: 2025-03-15 15:01:06.439379

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text


# revision identifiers, used by Alembic.
revision: str = 'e95ca2c42ec3'
down_revision: Union[str, None] = 'd4312ed97da7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.add_column('playlists', sa.Column('updated_at', sa.DateTime(), nullable=True))
    op.execute(text("UPDATE playlists SET updated_at = CURRENT_TIMESTAMP"))

    op.add_column('playlists', sa.Column('pinned', sa.Boolean(), nullable=True))
    op.add_column('playlists', sa.Column('pinned_order', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_playlists_pinned_order'), 'playlists', ['pinned_order'], unique=False)
    op.create_index(op.f('ix_playlists_updated_at'), 'playlists', ['updated_at'], unique=False)
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_index(op.f('ix_playlists_updated_at'), table_name='playlists')
    op.drop_index(op.f('ix_playlists_pinned_order'), table_name='playlists')
    op.drop_column('playlists', 'pinned_order')
    op.drop_column('playlists', 'pinned')
    op.drop_column('playlists', 'updated_at')
    # ### end Alembic commands ###
