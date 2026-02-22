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
        name=playlist.name[-49:],
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
            local_path=getattr(e.details, 'path', None),
            spotify_uri=getattr(e.details, 'spotify_uri', None),
            youtube_url=getattr(e.details, 'youtube_url', None),
            plex_rating_key=getattr(e.details, 'plex_rating_key', None),
            music_file_id=getattr(e.details, 'id', None)
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
            name=this_playlist.name[-49:],
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
            name=snapshot.name[-49:],
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

    @abstractmethod
    def is_authenticated(self) -> bool:
        """Check if the repository is authenticated"""
        pass

    @abstractmethod
    def clear_playlist(self) -> None:
        """Clear all items from the remote playlist"""
        pass
    
    def create_force_push_sync_plan(self, 
                                   new_remote_snapshot: Optional[PlaylistSnapshot],
                                   new_local_snapshot: PlaylistSnapshot,
                                   sync_target: SyncTarget) -> List[SyncChange]:
        """
        Create a force push sync plan that removes all remote items and adds all local items
        """
        plan = []
        
        # Only proceed if this target supports sending adds and removes
        if not sync_target.sendEntryAdds or not sync_target.sendEntryRemovals:
            logging.warning(f"Force push requires both sendEntryAdds and sendEntryRemovals to be enabled for target {sync_target.id}")
            return []
        
        # Add all local items to remote
        for item in new_local_snapshot.items:
            plan.append(SyncChange('add', item, 'local', 'Force push: adding local item to remote'))
        
        logging.info(f"Created force push sync plan: {len([c for c in plan if c.action == 'remove'])} removes, {len([c for c in plan if c.action == 'add'])} adds")
        return plan

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
            
            # Build key indexes for efficient lookups (remote IDs, paths, and normalized title/artist)
            old_remote_index = old_remote_snapshot.build_key_index()
            new_remote_index = new_remote_snapshot.build_key_index()
            new_local_index = new_local_snapshot.build_key_index()

            def index_has(index: Dict[str, PlaylistItem], item: PlaylistItem) -> bool:
                for key in item.match_keys():
                    if key in index:
                        return True
                return False

            # Handle local changes (if local is newer than last sync)
            if local_changed_since_last_sync:
                logging.info("Processing local changes since last sync")
                
                # Find items added locally
                if send_adds:
                    for item in new_local_snapshot.items:
                        if not index_has(old_remote_index, item):
                            # Item was added locally since last sync
                            if not index_has(new_remote_index, item):
                                # Item doesn't exist remotely, safe to add
                                plan.append(SyncChange('add', item, 'local', 'Item added locally since last sync'))
                            else:
                                logging.debug(f"Item {item.to_string(normalize=True)} already exists remotely, skipping add")
                
                # Find items removed locally
                if send_removes:
                    for item in old_remote_snapshot.items:
                        if not index_has(new_local_index, item):
                            # Item was removed locally since last sync
                            if index_has(new_remote_index, item):
                                # Item still exists remotely, safe to remove
                                plan.append(SyncChange('remove', item, 'local', 'Item removed locally since last sync'))
                            else:
                                logging.debug(f"Item {item.to_string(normalize=True)} already removed remotely, skipping remove")

        target_name = f"{sync_target.id}/{sync_target.service}" if sync_target else "remote playlist"

        # Handle remote changes (if remote is newer than last sync)
        if remote_changed_since_last_sync:
            logging.info("Processing remote changes since last sync")
            
            # Find items added remotely
            if receive_adds:
                for item in new_remote_snapshot.items:
                    if not index_has(old_remote_index, item):
                        # Item was added remotely since last sync
                        if not index_has(new_local_index, item):
                            # Item doesn't exist locally, safe to add
                            plan.append(SyncChange('add', item, 'remote', f'Item added to {target_name} since last sync'))
                        else:
                            logging.debug(f"Item {item.to_string(normalize=True)} already exists locally, skipping add")
            
            # Find items removed remotely
            if receive_removes:
                for item in old_remote_snapshot.items:
                    if not index_has(new_remote_index, item):
                        # Item was removed remotely since last sync
                        if index_has(new_local_index, item):
                            # Item still exists locally, safe to remove
                            plan.append(SyncChange('remove', item, 'remote', f'Item removed from {target_name} since last sync'))
                        else:
                            logging.debug(f"Item {item.to_string(normalize=True)} already removed locally, skipping remove")
        
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
            logging.info(f"Sync change: {change.action} {change.item.to_string()} from {change.source} - {change.reason}")
        
        # Apply remote changes
        remote_adds = [change for change in plan if change.action == 'add' and change.source == 'local']
        if remote_adds:
            try:
                items_to_add = [change.item for change in remote_adds]
                self.add_items(remote_playlist_name, items_to_add)
                logging.info(f"Added {len(remote_adds)} tracks to remote playlist")
            except Exception as e:
                logging.error(f"Error adding tracks to remote playlist: {e}")

        remote_removes = [change for change in plan if change.action == 'remove' and change.source == 'local']
        if remote_removes:
            removed_count = 0
            for change in remote_removes:
                try:
                    self.remove_items(remote_playlist_name, [change.item])
                    removed_count += 1
                except Exception as e:
                    logging.error(f"Error removing {change.item.to_string()} from remote playlist: {e}")
            
            if removed_count > 0:
                logging.info(f"Removed {removed_count} tracks from remote playlist")
        
        logging.info(f"Applying local changes to playlist {playlist_id}")
        
        # Apply local changes (from remote source)
        local_adds = [change for change in plan if change.action == 'add' and change.source == 'remote']
        if local_adds:
            for change in local_adds:
                try:
                    # Convert PlaylistItem to a format the local repo can handle
                    # This would typically involve calling something like repo.add_music_file or similar
                    if hasattr(repo, 'add_music_file'):
                        # Create a basic music file object from the playlist item
                        from response_models import MusicFile
                        music_file = MusicFile(
                            title=change.item.title,
                            artist=change.item.artist,
                            album=change.item.album,
                            spotify_uri=change.item.spotify_uri,
                            youtube_url=change.item.youtube_url,
                            plex_rating_key=change.item.plex_rating_key
                        )
                        repo.add_music_file(playlist_id, music_file)
                        logging.info(f"Added track {change.item.to_string()} to local playlist")
                except Exception as e:
                    logging.error(f"Error adding {change.item.to_string()} to local playlist: {e}")
        
        local_removes = [change for change in plan if change.action == 'remove' and change.source == 'remote']
        if local_removes:
            for change in local_removes:
                try:
                    if hasattr(repo, 'remove_music_file'):
                        repo.remove_music_file(playlist_id, change.item)
                        logging.info(f"Removed track {change.item.to_string()} from local playlist")
                except Exception as e:
                    logging.error(f"Error removing {change.item.to_string()} from local playlist: {e}")

    def _apply_local_removal_guardrails(
        self,
        plan: List[SyncChange],
        new_local_snapshot: PlaylistSnapshot,
        sync_target: SyncTarget,
        target_name: str,
    ) -> List[SyncChange]:
        """Prevent unexpectedly large remote-driven local deletions unless explicitly allowed."""
        if not plan:
            return plan

        config = sync_target.config or {}
        allow_bulk_receive_removals = bool(config.get("allow_bulk_receive_removals", False))

        if allow_bulk_receive_removals:
            return plan

        max_receive_removal_percent = float(config.get("max_receive_removal_percent", 0.30))
        max_receive_removal_count = int(config.get("max_receive_removal_count", 25))
        min_local_size_for_guard = int(config.get("min_local_size_for_removal_guard", 10))

        local_removes = [
            change for change in plan
            if change.action == 'remove' and change.source == 'remote'
        ]

        local_size = len(new_local_snapshot.items)
        remove_count = len(local_removes)

        if remove_count == 0 or local_size < min_local_size_for_guard:
            return plan

        removal_ratio = remove_count / local_size if local_size else 0
        exceeds_count = remove_count > max_receive_removal_count
        exceeds_ratio = removal_ratio > max_receive_removal_percent

        if not (exceeds_count or exceeds_ratio):
            return plan

        blocked = len(local_removes)
        filtered_plan = [
            change for change in plan
            if not (change.action == 'remove' and change.source == 'remote')
        ]

        logging.warning(
            "Guardrail blocked %d local deletions from target %s (%d/%d = %.1f%%). "
            "Set config allow_bulk_receive_removals=true to bypass, or tune "
            "max_receive_removal_percent/max_receive_removal_count.",
            blocked,
            target_name,
            remove_count,
            local_size,
            removal_ratio * 100,
        )

        return filtered_plan
    
    def sync_playlist(self, local_repo, playlist_id: int, sync_target: SyncTarget):
        """
        Sync a playlist with the remote service
        
        Args:
            local_repo: Local playlist repository
            playlist_id: ID of the playlist to sync
            sync_target: Sync target configuration
        """
        if not sync_target.enabled:
            logging.info(f"Sync target {sync_target.id} is disabled, skipping sync")
            return
        
        # Get the local playlist
        playlist = local_repo.get_by_id(playlist_id)
        if not playlist:
            raise ValueError(f"Playlist {playlist_id} not found")
        
        # Create local snapshot
        local_snapshot = create_snapshot(playlist)
        
        # Get target name from config
        target_name = sync_target.config.get('playlist_name') or playlist.name
        
        # Get current remote snapshot and stored snapshot
        current_remote_snapshot = self.get_playlist_snapshot(target_name)
        stored_remote_snapshot = self.get_current_snapshot(target_name)
        
        # If no remote playlist exists, create it
        if not current_remote_snapshot:
            logging.info(f"Creating remote playlist '{target_name}'")
            if sync_target.sendEntryAdds:
                # Create with current local items
                self.create_playlist(target_name, local_snapshot)
                # Update stored snapshot - create new snapshot with correct name
                new_snapshot = PlaylistSnapshot(
                    name=target_name[-49:],
                    last_updated=local_snapshot.last_updated,
                    items=local_snapshot.items
                )
            else:
                # Create empty playlist when sendEntryAdds is False
                empty_snapshot = PlaylistSnapshot(
                    name=target_name[-49:],
                    last_updated=local_snapshot.last_updated,
                    items=[]
                )
                self.create_playlist(target_name, empty_snapshot)
                new_snapshot = empty_snapshot

            refreshed_snapshot = self.get_playlist_snapshot(target_name)
            self.write_snapshot(refreshed_snapshot or new_snapshot)
            return
        
        # Create sync plan
        sync_plan = self.create_sync_plan(
            old_remote_snapshot=stored_remote_snapshot,
            new_remote_snapshot=current_remote_snapshot,
            new_local_snapshot=local_snapshot,
            sync_target=sync_target
        )

        sync_plan = self._apply_local_removal_guardrails(
            plan=sync_plan,
            new_local_snapshot=local_snapshot,
            sync_target=sync_target,
            target_name=target_name,
        )
        
        # Apply sync plan
        self.apply_sync_plan(local_repo, playlist_id, target_name, sync_plan)
        
        # Update stored snapshot with current remote state
        if current_remote_snapshot:
            if any(change.source == 'local' for change in sync_plan):
                refreshed_snapshot = self.get_playlist_snapshot(target_name)
                self.write_snapshot(refreshed_snapshot or current_remote_snapshot)
            else:
                self.write_snapshot(current_remote_snapshot)
