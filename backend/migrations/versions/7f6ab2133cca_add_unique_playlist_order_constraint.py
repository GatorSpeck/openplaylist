"""add_unique_playlist_order_constraint

Revision ID: 7f6ab2133cca
Revises: e95ca2c42ec3
Create Date: 2025-03-21 09:26:02.132322

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = '7f6ab2133cca'
down_revision: Union[str, None] = 'e95ca2c42ec3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('playlist_entries') as batch_op:
        conn = op.get_bind()
        
        # Get ALL entries grouped by playlist to handle ordering comprehensively
        playlists = conn.execute(
            text("SELECT DISTINCT playlist_id FROM playlist_entries")
        ).fetchall()
        
        for (playlist_id,) in playlists:
            # Get all entries for this playlist, ordered by their current order
            entries = conn.execute(
                text("""
                SELECT id, "order" 
                FROM playlist_entries 
                WHERE playlist_id = :playlist_id
                ORDER BY "order", id
                """),
                {"playlist_id": playlist_id}
            ).fetchall()
            
            # Build a dictionary to track duplicates
            order_counts = {}
            for _, order_val in entries:
                order_counts[order_val] = order_counts.get(order_val, 0) + 1
            
            # Only process playlists with duplicates
            if all(count == 1 for count in order_counts.values()):
                continue
                
            # Find the highest current order to start assigning new orders
            next_order = max(order_counts.keys()) + 1 if order_counts else 0
            
            # Track which entries we've processed
            seen_orders = set()
            
            # Process entries in order
            for entry_id, current_order in entries:
                # If we've already seen this order and it's not the first one,
                # assign it a new unique order
                order_key = (playlist_id, current_order)
                
                if order_key in seen_orders:
                    # Update to a guaranteed unique order value
                    conn.execute(
                        text("""
                        UPDATE playlist_entries
                        SET "order" = :new_order
                        WHERE id = :entry_id
                        """),
                        {"new_order": next_order, "entry_id": entry_id}
                    )
                    next_order += 1
                else:
                    # Mark this order as seen
                    seen_orders.add(order_key)
        
        # Now add the unique constraint
        batch_op.create_unique_constraint(
            'uq_playlist_entries_playlist_id_order', 
            ['playlist_id', 'order']
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('playlist_entries') as batch_op:
        batch_op.drop_constraint(
            'uq_playlist_entries_playlist_id_order', 
            type_='unique'
        )
