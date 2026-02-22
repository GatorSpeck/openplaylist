"""add remote sync log tables

Revision ID: 8e17d1b8c9a1
Revises: ddf1a1f9c947
Create Date: 2026-02-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '8e17d1b8c9a1'
down_revision: Union[str, None] = 'ddf1a1f9c947'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(table_name: str) -> bool:
    connection = op.get_bind()
    inspector = inspect(connection)
    return inspector.has_table(table_name)


def _has_index(table_name: str, index_name: str) -> bool:
    connection = op.get_bind()
    inspector = inspect(connection)
    if not inspector.has_table(table_name):
        return False
    indexes = inspector.get_indexes(table_name)
    return any(idx.get("name") == index_name for idx in indexes)


def upgrade() -> None:
    """Upgrade schema."""
    if not _has_table('remote_sync_runs'):
        op.create_table(
            'remote_sync_runs',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('playlist_id', sa.Integer(), nullable=False),
            sa.Column('started_at', sa.DateTime(), nullable=False),
            sa.Column('completed_at', sa.DateTime(), nullable=True),
            sa.Column('status', sa.String(length=20), nullable=False),
            sa.Column('force_push', sa.Boolean(), nullable=False),
            sa.Column('summary', sa.JSON(), nullable=True),
            sa.Column('error', sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(['playlist_id'], ['playlists.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )

    if not _has_index('remote_sync_runs', op.f('ix_remote_sync_runs_id')):
        op.create_index(op.f('ix_remote_sync_runs_id'), 'remote_sync_runs', ['id'], unique=False)
    if not _has_index('remote_sync_runs', op.f('ix_remote_sync_runs_playlist_id')):
        op.create_index(op.f('ix_remote_sync_runs_playlist_id'), 'remote_sync_runs', ['playlist_id'], unique=False)
    if not _has_index('remote_sync_runs', op.f('ix_remote_sync_runs_started_at')):
        op.create_index(op.f('ix_remote_sync_runs_started_at'), 'remote_sync_runs', ['started_at'], unique=False)
    if not _has_index('remote_sync_runs', op.f('ix_remote_sync_runs_completed_at')):
        op.create_index(op.f('ix_remote_sync_runs_completed_at'), 'remote_sync_runs', ['completed_at'], unique=False)
    if not _has_index('remote_sync_runs', op.f('ix_remote_sync_runs_status')):
        op.create_index(op.f('ix_remote_sync_runs_status'), 'remote_sync_runs', ['status'], unique=False)

    if not _has_table('remote_sync_events'):
        op.create_table(
            'remote_sync_events',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('sync_run_id', sa.Integer(), nullable=False),
            sa.Column('playlist_id', sa.Integer(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('event_kind', sa.String(length=50), nullable=False),
            sa.Column('action', sa.String(length=50), nullable=False),
            sa.Column('track', sa.String(length=2048), nullable=True),
            sa.Column('target', sa.String(length=128), nullable=False),
            sa.Column('target_name', sa.String(length=1024), nullable=True),
            sa.Column('reason', sa.Text(), nullable=True),
            sa.Column('success', sa.Boolean(), nullable=False),
            sa.Column('error', sa.Text(), nullable=True),
            sa.Column('metadata', sa.JSON(), nullable=True),
            sa.ForeignKeyConstraint(['playlist_id'], ['playlists.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['sync_run_id'], ['remote_sync_runs.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )

    if not _has_index('remote_sync_events', op.f('ix_remote_sync_events_id')):
        op.create_index(op.f('ix_remote_sync_events_id'), 'remote_sync_events', ['id'], unique=False)
    if not _has_index('remote_sync_events', op.f('ix_remote_sync_events_sync_run_id')):
        op.create_index(op.f('ix_remote_sync_events_sync_run_id'), 'remote_sync_events', ['sync_run_id'], unique=False)
    if not _has_index('remote_sync_events', op.f('ix_remote_sync_events_playlist_id')):
        op.create_index(op.f('ix_remote_sync_events_playlist_id'), 'remote_sync_events', ['playlist_id'], unique=False)
    if not _has_index('remote_sync_events', op.f('ix_remote_sync_events_created_at')):
        op.create_index(op.f('ix_remote_sync_events_created_at'), 'remote_sync_events', ['created_at'], unique=False)
    if not _has_index('remote_sync_events', op.f('ix_remote_sync_events_event_kind')):
        op.create_index(op.f('ix_remote_sync_events_event_kind'), 'remote_sync_events', ['event_kind'], unique=False)
    if not _has_index('remote_sync_events', op.f('ix_remote_sync_events_action')):
        op.create_index(op.f('ix_remote_sync_events_action'), 'remote_sync_events', ['action'], unique=False)
    if not _has_index('remote_sync_events', op.f('ix_remote_sync_events_target')):
        op.create_index(op.f('ix_remote_sync_events_target'), 'remote_sync_events', ['target'], unique=False)
    if not _has_index('remote_sync_events', op.f('ix_remote_sync_events_success')):
        op.create_index(op.f('ix_remote_sync_events_success'), 'remote_sync_events', ['success'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    if _has_table('remote_sync_events'):
        for index_name in [
            op.f('ix_remote_sync_events_success'),
            op.f('ix_remote_sync_events_target'),
            op.f('ix_remote_sync_events_action'),
            op.f('ix_remote_sync_events_event_kind'),
            op.f('ix_remote_sync_events_created_at'),
            op.f('ix_remote_sync_events_playlist_id'),
            op.f('ix_remote_sync_events_sync_run_id'),
            op.f('ix_remote_sync_events_id'),
        ]:
            if _has_index('remote_sync_events', index_name):
                op.drop_index(index_name, table_name='remote_sync_events')
        op.drop_table('remote_sync_events')

    if _has_table('remote_sync_runs'):
        for index_name in [
            op.f('ix_remote_sync_runs_status'),
            op.f('ix_remote_sync_runs_completed_at'),
            op.f('ix_remote_sync_runs_started_at'),
            op.f('ix_remote_sync_runs_playlist_id'),
            op.f('ix_remote_sync_runs_id'),
        ]:
            if _has_index('remote_sync_runs', index_name):
                op.drop_index(index_name, table_name='remote_sync_runs')
        op.drop_table('remote_sync_runs')
