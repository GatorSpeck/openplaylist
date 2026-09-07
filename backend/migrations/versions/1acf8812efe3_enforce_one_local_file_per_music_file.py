"""enforce one local_file per music_file

MusicFileDB.local_file is a one-to-one relationship (uselist=False), but
nothing enforced that at the database level. If more than one local_files
row ends up pointing at the same music_file_id (e.g. the same track scanned
twice under two different mount paths), SQLAlchemy silently picks one of
them when lazily loading `.local_file`, making `.missing`/`.path`/
`.last_scanned` on that track nondeterministic.

Revision ID: 1acf8812efe3
Revises: 9c1a2d7f4e3b
Create Date: 2026-09-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = '1acf8812efe3'
down_revision: Union[str, None] = '9c1a2d7f4e3b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()

    # Find music_files with more than one local_files row pointing at them.
    duplicate_groups = conn.execute(
        text("""
            SELECT music_file_id FROM local_files
            WHERE music_file_id IS NOT NULL
            GROUP BY music_file_id
            HAVING COUNT(*) > 1
        """)
    ).fetchall()

    for (music_file_id,) in duplicate_groups:
        rows = conn.execute(
            text("""
                SELECT id FROM local_files
                WHERE music_file_id = :music_file_id
                ORDER BY missing ASC, last_scanned DESC, id ASC
            """),
            {"music_file_id": music_file_id}
        ).fetchall()

        # Keep the first (best) row linked; detach the rest so they remain as
        # independent local file records instead of competing for the same
        # music_file_id.
        loser_ids = [row[0] for row in rows[1:]]
        if loser_ids:
            conn.execute(
                text("UPDATE local_files SET music_file_id = NULL WHERE id IN :ids").bindparams(
                    sa.bindparam("ids", expanding=True)
                ),
                {"ids": loser_ids}
            )

    with op.batch_alter_table('local_files') as batch_op:
        batch_op.create_unique_constraint(
            'uq_local_files_music_file_id',
            ['music_file_id']
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('local_files') as batch_op:
        # MySQL/MariaDB requires an index backing the music_file_id foreign
        # key at all times, so add a plain one before dropping the unique
        # constraint that was previously serving that role.
        batch_op.create_index('ix_local_files_music_file_id', ['music_file_id'])
        batch_op.drop_constraint(
            'uq_local_files_music_file_id',
            type_='unique'
        )
