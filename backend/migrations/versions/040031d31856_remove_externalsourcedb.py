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
    
    print("Dropping external_sources table...")
    op.drop_index('external_sources_music_file_type_idx', table_name='external_sources')
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