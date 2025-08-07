import os
import logging
import json
from datetime import datetime
from typing import List, Optional, Dict, Any, Set, NamedTuple
from fastapi.exceptions import HTTPException
from pydantic import BaseModel
from abc import ABC, abstractmethod
import difflib
from tqdm import tqdm

from models import PlaylistSnapshot as PlaylistSnapshotModel, PlaylistDB
from response_models import PlaylistItem, PlaylistSnapshot, SyncTarget

def get_local_tz():
    return datetime.now().astimezone().tzinfo

def diff_snapshots(left: PlaylistSnapshot, right: PlaylistSnapshot):
    logging.info(f"Left timestamp: {left.last_updated}, Right timestamp: {right.last_updated}")
    d = left.diff(right)
    changes = 0
    for line in d:
        if line.startswith("+ "):
            changes += 1
            logging.info(f"Added: {line[2:]}")
        elif line.startswith("- "):
            changes += 1
            logging.info(f"Removed: {line[2:]}")
        elif line.startswith("? "):
            changes += 1
            logging.info(f"Changed: {line[2:]}")
        else:
            logging.info(f"Unchanged: {line[2:]}")
    
    logging.info(f"Found {changes} changes")

class SyncChange(NamedTuple):
    """Represents a single sync change"""
    action: str  # 'add' or 'remove'
    item: PlaylistItem
    source: str  # 'local' or 'remote'
    reason: str  # description of why this change is needed

def create_snapshot(playlist: PlaylistDB) -> PlaylistSnapshot:
    """Create a snapshot from a local playlist"""
    result = PlaylistSnapshot(
        name=playlist.name,
        last_updated=playlist.updated_at.replace(tzinfo=get_local_tz()),
        items=[]
    )

    for e in playlist.entries:
        if not e.entry_type == "music_file":
            continue
        if not e.details.artist or not e.details.title:
            continue

        new_item = PlaylistItem(
            artist=e.details.artist,
            album=e.details.album,
            title=e.details.title,
            local_path=e.details.path,
            spotify_uri=e.details.spotify_uri,
            youtube_url=e.details.youtube_url,
            plex_rating_key=e.details.plex_rating_key,
            music_file_id=e.details.id
        )

        result.add_item(new_item)
    
    logging.info(f"Created snapshot for playlist {playlist.name} with {len(result.items)} items")
    
    return result

class RemotePlaylistRepository(ABC):
    """Base class for remote playlist repositories"""
    
    def __init__(self, session, config: Dict[str, str] = None):
        """
        Initialize the repository
        
        Args:
            session: Database session
            config: Configuration dictionary with service-specific settings
        """
        self.session = session
        self.config = config or {}
        
    def get_current_snapshot(self, playlist_name: str) -> Optional[PlaylistSnapshot]:
        """Get the current snapshot from the database"""
        this_playlist = self.session.query(PlaylistSnapshotModel).filter_by(name=playlist_name).first()
        if not this_playlist:
            return None
        
        result = PlaylistSnapshot(
            name=this_playlist.name,
            last_updated=this_playlist.last_updated.astimezone(get_local_tz()),
            items=[]
        )

        for item in this_playlist.contents:
            i = PlaylistItem(
                artist=item.get("artist"),
                album=item.get("album"),
                title=item.get("title"),
                local_path=item.get("local_path", None),
                spotify_uri=item.get("spotify_uri", None),
                youtube_url=item.get("youtube_url", None),
                plex_rating_key=item.get("plex_rating_key", None),
                music_file_id=item.get("music_file_id", None)
            )

            result.add_item(i)

        return result

    def write_snapshot(self, snapshot: PlaylistSnapshot):
        """Write a snapshot to the database"""
        result = self.session.query(PlaylistSnapshotModel).filter_by(name=snapshot.name).first()
        if result:
            self.session.delete(result)
            self.session.commit()

        result = PlaylistSnapshotModel(
            name=snapshot.name,
            last_updated=datetime.now(get_local_tz()),
            contents=[]
        )
        
        result.contents = []

        for item in snapshot.items:
            record = {
                "artist": item.artist,
                "album": item.album,
                "title": item.title,
            }

            if item.local_path:
                record["local_path"] = item.local_path
            if item.spotify_uri:
                record["spotify_uri"] = item.spotify_uri
            if item.youtube_url:
                record["youtube_url"] = item.youtube_url
            if item.plex_rating_key:
                record["plex_rating_key"] = item.plex_rating_key
            if item.music_file_id:
                record["music_file_id"] = item.music_file_id

            result.contents.append(record)
        
        self.session.add(result)
        self.session.commit()
    
    @abstractmethod
    def get_playlist_snapshot(self, playlist_name: str) -> Optional[PlaylistSnapshot]:
        """Get a snapshot from the remote service"""
        pass
    
    @abstractmethod
    def create_playlist(self, playlist_name: str, snapshot: PlaylistSnapshot) -> Any:
        """Create a playlist on the remote service"""
        pass
    
    @abstractmethod
    def add_items(self, playlist_name: str, items: List[PlaylistItem]) -> None:
        """Add items to a remote playlist"""
        pass
    
    @abstractmethod
    def remove_items(self, playlist_name: str, items: List[PlaylistItem]) -> None:
        """Remove items from a remote playlist"""
        pass
    
    @abstractmethod
    def fetch_media_item(self, item: PlaylistItem) -> Any:
        """Fetch a media item from the remote service"""
        pass
    
    def create_sync_plan(self, old_remote_snapshot: Optional[PlaylistSnapshot], 
                    new_remote_snapshot: Optional[PlaylistSnapshot],
                    new_local_snapshot: PlaylistSnapshot,
                    sync_target: SyncTarget) -> List[SyncChange]:
        """
        Create a unified sync plan based on snapshot timestamps and sync configuration
        Uses timestamps to determine which changes are newer and should be applied
        """
        plan = []
        
        # Get sync configuration
        send_adds = sync_target.sendEntryAdds
        send_removes = sync_target.sendEntryRemovals
        receive_adds = sync_target.receiveEntryAdds
        receive_removes = sync_target.receiveEntryRemovals

        local_changed_since_last_sync = False
        remote_changed_since_last_sync = False
        
        # If we don't have an old snapshot, treat as initial sync
        if not old_remote_snapshot:
            logging.info("No previous remote snapshot found, performing initial sync")
            
            if new_remote_snapshot:
                # Initial sync: compare current local vs current remote
                if send_adds:
                    for item in new_local_snapshot.items:
                        if not new_remote_snapshot.has(item):

                            plan.append(SyncChange('add', item, 'local', 'Initial sync: item exists locally but not remotely'))
                
                if receive_adds:
                    for item in new_remote_snapshot.items:
                        if not new_local_snapshot.has(item):
                            plan.append(SyncChange('add', item, 'remote', 'Initial sync: item exists remotely but not locally'))
            else:
                # No remote playlist exists, send everything local to remote
                if send_adds:
                    for item in new_local_snapshot.items:
                        plan.append(SyncChange('add', item, 'local', 'Initial sync: creating remote playlist from local'))

            return plan
        
        if new_remote_snapshot:
            # Compare timestamps to see what changed since last sync
            local_changed_since_last_sync = new_local_snapshot.last_updated > old_remote_snapshot.last_updated
            remote_changed_since_last_sync = new_remote_snapshot.last_updated > old_remote_snapshot.last_updated
            
            logging.info(f"Timestamp comparison:")
            logging.info(f"  Local: {new_local_snapshot.last_updated}")
            logging.info(f"  Remote: {new_remote_snapshot.last_updated}")
            logging.info(f"  Last sync: {old_remote_snapshot.last_updated}")
            logging.info(f"  Local changed: {local_changed_since_last_sync}")
            logging.info(f"  Remote changed: {remote_changed_since_last_sync}")
            
            # Create sets for efficient lookups
            old_remote_items = {item.to_string(normalize=True): item for item in old_remote_snapshot.items}
            new_remote_items = {item.to_string(normalize=True): item for item in new_remote_snapshot.items}
            new_local_items = {item.to_string(normalize=True): item for item in new_local_snapshot.items}
            
            # Handle local changes (if local is newer than last sync)
            if local_changed_since_last_sync:
                logging.info("Processing local changes since last sync")
                
                # Find items added locally
                if send_adds:
                    for item_str, item in new_local_items.items():
                        if item_str not in old_remote_items:
                            # Item was added locally since last sync
                            if item_str not in new_remote_items:
                                # Item doesn't exist remotely, safe to add
                                plan.append(SyncChange('add', item, 'local', 'Item added locally since last sync'))
                            else:
                                logging.debug(f"Item {item_str} already exists remotely, skipping add")
                
                # Find items removed locally
                if send_removes:
                    for item_str, item in old_remote_items.items():
                        if item_str not in new_local_items:
                            # Item was removed locally since last sync
                            if item_str in new_remote_items:
                                # Item still exists remotely, safe to remove
                                plan.append(SyncChange('remove', item, 'local', 'Item removed locally since last sync'))
                            else:
                                logging.debug(f"Item {item_str} already removed remotely, skipping remove")

        target_name = f"{sync_target.id}/{sync_target.service}" if sync_target else "remote playlist"

        # Handle remote changes (if remote is newer than last sync)
        if remote_changed_since_last_sync:
            logging.info("Processing remote changes since last sync")
            
            # Find items added remotely
            if receive_adds:
                for item_str, item in new_remote_items.items():
                    if item_str not in old_remote_items:
                        # Item was added remotely since last sync
                        if item_str not in new_local_items:
                            # Item doesn't exist locally, safe to add
                            plan.append(SyncChange('add', item, 'remote', f'Item added to {target_name} since last sync'))
                        else:
                            logging.debug(f"Item {item_str} already exists locally, skipping add")
            
            # Find items removed remotely
            if receive_removes:
                for item_str, item in old_remote_items.items():
                    if item_str not in new_remote_items:
                        # Item was removed remotely since last sync
                        if item_str in new_local_items:
                            # Item still exists locally, safe to remove
                            plan.append(SyncChange('remove', item, 'remote', f'Item removed from {target_name} since last sync'))
                        else:
                            logging.debug(f"Item {item_str} already removed locally, skipping remove")
        
        # Handle conflicts (both changed since last sync)
        if local_changed_since_last_sync and remote_changed_since_last_sync:
            logging.warning("Both local and remote playlists changed since last sync - potential conflicts")
            
            # You could implement conflict resolution here
            # For now, we'll let both sets of changes apply and rely on duplicate detection
            pass

        return plan
    
    def apply_sync_plan(self, repo, playlist_id: int, remote_playlist_name: str, plan: List[SyncChange]):
        """
        Apply the unified sync plan to both local and remote playlists
        """
        for change in plan:
            change.log_change()
        
        # Apply remote changes
        remote_adds = [change for change in plan if change.action == 'add' and change.target == 'remote']
        if remote_adds:
            try:
                self.add_items(remote_playlist_name, remote_adds)
                logging.info(f"Added {len(remote_adds)} tracks to remote playlist")
            except Exception as e:
                logging.error(f"Error adding tracks to remote playlist: {e}")

        remote_removes = [change for change in plan if change.action == 'remove' and change.target == 'remote']
        if remote_removes:
            removed_count = 0
            for item in remote_removes:
                try:
                    self.remove_items(remote_playlist_name, [item])
                    removed_count += 1
                except Exception as e:
                    logging.error(f"Error removing {item.to_string()} from remote playlist: {e}")
            
            if removed_count > 0:
                logging.info(f"Removed {removed_count} tracks from remote playlist")
        
        logging.info(f"Applying local changes to playlist {playlist_id}")
