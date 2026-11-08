"""add sync track states

Revision ID: b7c4e2a9d013
Revises: 1acf8812efe3
Create Date: 2026-11-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = 'b7c4e2a9d013'
down_revision: Union[str, None] = '1acf8812efe3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = 'sync_track_states'
INDEXED_COLUMNS = ['id', 'sync_target_id', 'music_file_id']


def _has_table(table_name: str) -> bool:
    return inspect(op.get_bind()).has_table(table_name)


def _has_index(table_name: str, index_name: str) -> bool:
    inspector = inspect(op.get_bind())
    if not inspector.has_table(table_name):
        return False
    return any(idx.get("name") == index_name for idx in inspector.get_indexes(table_name))


def upgrade() -> None:
    """Upgrade schema."""
    if not _has_table(TABLE):
        op.create_table(
            TABLE,
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('sync_target_id', sa.Integer(), nullable=False),
            sa.Column('music_file_id', sa.Integer(), nullable=True),
            sa.Column('item_key', sa.String(length=1024), nullable=False),
            sa.Column('status', sa.String(length=20), nullable=False),
            sa.Column('remote_id', sa.String(length=1024), nullable=True),
            sa.Column('metadata_fingerprint', sa.String(length=64), nullable=False),
            sa.Column('confidence', sa.JSON(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(['sync_target_id'], ['sync_targets.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )

    for column in INDEXED_COLUMNS:
        index_name = op.f(f'ix_{TABLE}_{column}')
        if not _has_index(TABLE, index_name):
            op.create_index(index_name, TABLE, [column], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    for column in INDEXED_COLUMNS:
        index_name = op.f(f'ix_{TABLE}_{column}')
        if _has_index(TABLE, index_name):
            op.drop_index(index_name, table_name=TABLE)
    if _has_table(TABLE):
        op.drop_table(TABLE)
