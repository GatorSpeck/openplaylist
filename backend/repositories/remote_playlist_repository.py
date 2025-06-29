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

class SyncPlan:
    """Unified plan of all changes to be applied during sync"""
    
    def __init__(self):
        self.remote_changes: List[SyncChange] = []
        self.local_changes: List[SyncChange] = []
    
    def add_remote_change(self, action: str, item: PlaylistItem, source: str, reason: str):
        """Add a change to be applied to the remote playlist"""
        self.remote_changes.append(SyncChange(action, item, source, reason))
    
    def add_local_change(self, action: str, item: PlaylistItem, source: str, reason: str):
        """Add a change to be applied to the local playlist"""
        self.local_changes.append(SyncChange(action, item, source, reason))
    
    def get_remote_adds(self) -> List[PlaylistItem]:
        """Get all items to add to remote playlist"""
        return [change.item for change in self.remote_changes if change.action == 'add']
    
    def get_remote_removes(self) -> List[PlaylistItem]:
        """Get all items to remove from remote playlist"""
        return [change.item for change in self.remote_changes if change.action == 'remove']
    
    def get_local_adds(self) -> List[PlaylistItem]:
        """Get all items to add to local playlist"""
        return [change.item for change in self.local_changes if change.action == 'add']
    
    def get_local_removes(self) -> List[PlaylistItem]:
        """Get all items to remove from local playlist"""
        return [change.item for change in self.local_changes if change.action == 'remove']
    
    def log_plan(self):
        """Log the sync plan for debugging"""
        logging.info(f"Sync plan: {len(self.remote_changes)} remote changes, {len(self.local_changes)} local changes")
        
        for change in self.remote_changes:
            logging.info(f"Remote {change.action}: {change.item.to_string()} ({change.reason})")
        
        for change in self.local_changes:
            logging.info(f"Local {change.action}: {change.item.to_string()} ({change.reason})")

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
                uri=item.get("uri", None)  # Optional URI field
            )

            result.add_item(i)

        return result
    
    def create_snapshot(self, playlist: PlaylistDB) -> PlaylistSnapshot:
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
            )

            result.add_item(new_item)
        
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
            result.contents.append({
                "artist": item.artist,
                "album": item.album,
                "title": item.title,
                "uri": item.uri  # Optional URI field
            })
        
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
                    sync_target: SyncTarget) -> SyncPlan:
        """
        Create a unified sync plan based on the three snapshots and sync configuration
        Race condition safe - compares actual current states rather than relying on timestamps
        """
        plan = SyncPlan()
        
        # Get sync configuration
        send_adds = sync_target.sendEntryAdds
        send_removes = sync_target.sendEntryRemovals
        receive_adds = sync_target.receiveEntryAdds
        receive_removes = sync_target.receiveEntryRemovals
        
        # If we don't have an old snapshot, treat as initial sync
        if not old_remote_snapshot:
            logging.info("No previous remote snapshot found, performing initial sync")
            
            if new_remote_snapshot:
                # Initial sync: compare current local vs current remote
                if send_adds:
                    for item in new_local_snapshot.items:
                        if not new_remote_snapshot.has(item):
                            plan.add_remote_change('add', item, 'local', 'Initial sync: item exists locally but not remotely')
                
                if receive_adds:
                    for item in new_remote_snapshot.items:
                        if not new_local_snapshot.has(item):
                            plan.add_local_change('add', item, 'remote', 'Initial sync: item exists remotely but not locally')
            
            return plan
        
        # For subsequent syncs, we need to determine what actually changed
        # by comparing the three snapshots carefully
        
        # Create sets for efficient lookups
        old_remote_items = {item.to_string(): item for item in old_remote_snapshot.items}
        new_remote_items = {item.to_string(): item for item in new_remote_snapshot.items} if new_remote_snapshot else {}
        new_local_items = {item.to_string(): item for item in new_local_snapshot.items}
    
        # 1. Detect local changes since last sync
        local_adds = {}  # Use dict to store actual items, not just strings
        local_removes = {}
        
        for item_str, item in new_local_items.items():
            if item_str not in old_remote_items:
                # This item is in current local but wasn't in our last known remote state
                if item_str in new_remote_items:
                    # Item exists in both current local and current remote
                    # This means it was likely added remotely and we already synced it
                    logging.debug(f"Item {item_str} exists in both local and remote, no action needed")
                else:
                    # Item exists in local but not in current remote
                    # This is a genuine local addition
                    local_adds[item_str] = item
                    logging.debug(f"Detected local addition: {item_str}")
        
        for item_str, item in old_remote_items.items():
            if item_str not in new_local_items:
                # This item was in our last known remote state but isn't in current local
                if item_str in new_remote_items:
                    # Item still exists in current remote but not in current local
                    # This is a genuine local removal
                    local_removes[item_str] = item
                    logging.debug(f"Detected local removal: {item_str}")
                else:
                    # Item doesn't exist in either current local or current remote
                    # This means it was removed remotely and we already synced it
                    logging.debug(f"Item {item_str} removed from both local and remote, no action needed")
    
        # 2. Detect remote changes since last sync
        remote_adds = {}
        remote_removes = {}
        
        if new_remote_snapshot:
            for item_str, item in new_remote_items.items():
                if item_str not in old_remote_items:
                    # This item is in current remote but wasn't in our last known remote state
                    # This is a genuine remote addition (unless we just added it locally)
                    if item_str not in local_adds:
                        remote_adds[item_str] = item
                        logging.debug(f"Detected remote addition: {item_str}")
            
            for item_str, item in old_remote_items.items():
                if item_str not in new_remote_items:
                    # This item was in our last known remote state but isn't in current remote
                    # This is a genuine remote removal (unless we just removed it locally)
                    if item_str not in local_removes:
                        remote_removes[item_str] = item
                        logging.debug(f"Detected remote removal: {item_str}")
    
        # 3. Apply sync configuration to create the plan with duplicate detection
        if send_adds:
            for item_str, item in local_adds.items():
                # Double-check that we're not adding a duplicate
                if new_remote_snapshot and new_remote_snapshot.has(item):
                    logging.warning(f"Skipping add to remote - item {item_str} already exists in remote playlist")
                    continue
                plan.add_remote_change('add', item, 'local', 'Item added locally')
    
        if send_removes:
            for item_str, item in local_removes.items():
                # Only remove if the item actually exists in the current remote snapshot
                if new_remote_snapshot and not new_remote_snapshot.has(item):
                    logging.warning(f"Skipping remove from remote - item {item_str} doesn't exist in remote playlist")
                    continue
                plan.add_remote_change('remove', item, 'local', 'Item removed locally')
    
        if receive_adds and new_remote_snapshot:
            for item_str, item in remote_adds.items():
                # Double-check that we're not adding a duplicate to local
                if new_local_snapshot.has(item):
                    logging.warning(f"Skipping add to local - item {item_str} already exists in local playlist")
                    continue
                plan.add_local_change('add', item, 'remote', 'Item added remotely')
    
        if receive_removes:
            for item_str, item in remote_removes.items():
                # Only remove if the item actually exists in the current local snapshot
                if not new_local_snapshot.has(item):
                    logging.warning(f"Skipping remove from local - item {item_str} doesn't exist in local playlist")
                    continue
                plan.add_local_change('remove', item, 'remote', 'Item removed remotely')
    
        return plan
    
    def apply_sync_plan(self, repo, playlist_id: int, remote_playlist_name: str, plan: SyncPlan):
        """
        Apply the unified sync plan to both local and remote playlists
        """
        plan.log_plan()
        
        # Apply remote changes
        remote_adds = plan.get_remote_adds()
        if remote_adds:
            try:
                self.add_items(remote_playlist_name, remote_adds)
                logging.info(f"Added {len(remote_adds)} tracks to remote playlist")
            except Exception as e:
                logging.error(f"Error adding tracks to remote playlist: {e}")
        
        remote_removes = plan.get_remote_removes()
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
        
        # Apply local changes
        local_adds = plan.get_local_adds()
        for item in local_adds:
            logging.info(f"Adding {item.to_string()} to local playlist")
            result = repo.add_music_file(playlist_id, item, normalize=True)
            if not result:
                logging.info(f"Could not find music file for {item.to_string()}, adding as requested track")
                repo.add_requested_track(playlist_id, item)
        
        local_removes = plan.get_local_removes()
        for item in local_removes:
            logging.info(f"Removing {item.to_string()} from local playlist")
            repo.remove_music_file(playlist_id, item)

    def sync_playlist(self, repo, playlist_id: int, sync_target: SyncTarget):
        """
        Sync a local playlist with a remote playlist according to sync configuration
        
        Args:
            repo: Local playlist repository
            playlist_id: ID of the local playlist
            sync_target: SyncTargetDB instance containing sync configuration
        """
        # lookup playlist by id
        playlist = repo.get_by_id(playlist_id)
        if not playlist:
            logging.error(f"Playlist with id {playlist_id} not found")
            raise HTTPException(status_code=404, detail="Playlist not found")
        
        # Get configuration options from the sync target
        target_name = sync_target.config.get("playlist_name") or sync_target.config.get("playlist_uri")
        enabled = sync_target.enabled
        
        # Skip syncing if disabled
        if not enabled:
            logging.info(f"Sync is disabled for playlist {playlist.name}, skipping")
            return
        
        # Use the provided target name or fall back to the playlist name
        remote_playlist_name = target_name or playlist.name
        
        logging.info(f"Syncing playlist {playlist.name} to remote as {remote_playlist_name}")
        logging.info(f"Sync options: send_adds={sync_target.sendEntryAdds}, send_removes={sync_target.sendEntryRemovals}, receive_adds={sync_target.receiveEntryAdds}, receive_removes={sync_target.receiveEntryRemovals}")

        # Collect our three snapshots
        old_remote_snapshot = self.get_current_snapshot(remote_playlist_name)
        if old_remote_snapshot:
            logging.info(f"Existing remote snapshot last updated at {old_remote_snapshot.last_updated}")

        new_remote_snapshot = self.get_playlist_snapshot(remote_playlist_name)
        if new_remote_snapshot:
            logging.info(f"New remote snapshot last updated at {new_remote_snapshot.last_updated}")

        new_local_snapshot = self.create_snapshot(playlist)
        if new_local_snapshot:
            logging.info(f"New local snapshot last updated at {new_local_snapshot.last_updated}")
        
        # If remote playlist doesn't exist, create it
        if not new_remote_snapshot:                
            logging.info(f"Remote snapshot for playlist {remote_playlist_name} not found, creating new one")
            self.create_playlist(remote_playlist_name, new_local_snapshot)
            new_remote_snapshot = self.get_playlist_snapshot(remote_playlist_name)
            if new_remote_snapshot:
                self.write_snapshot(new_remote_snapshot)
                logging.info(f"Created new remote playlist {new_remote_snapshot.name}")
            return
        
        # Create and apply the unified sync plan
        sync_plan = self.create_sync_plan(old_remote_snapshot, new_remote_snapshot, new_local_snapshot, sync_target)
        self.apply_sync_plan(repo, playlist_id, remote_playlist_name, sync_plan)
        
        # Finally, create a new snapshot and persist it
        new_remote_snapshot = self.get_playlist_snapshot(remote_playlist_name)
        self.write_snapshot(new_remote_snapshot)
        logging.info(f"Wrote new remote snapshot to DB for future comparison")
