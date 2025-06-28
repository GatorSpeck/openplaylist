import os
import logging
import json
from datetime import datetime
from typing import List, Optional, Dict, Any, Set
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
        send_adds = sync_target.sendEntryAdds
        send_removes = sync_target.sendEntryRemovals
        receive_adds = sync_target.receiveEntryAdds
        receive_removes = sync_target.receiveEntryRemovals
        enabled = sync_target.enabled
        
        # Skip syncing if disabled
        if not enabled:
            logging.info(f"Sync is disabled for playlist {playlist.name}, skipping")
            return
        
        # Use the provided target name or fall back to the playlist name
        remote_playlist_name = target_name or playlist.name
        
        logging.info(f"Syncing playlist {playlist.name} to remote as {remote_playlist_name}")
        logging.info(f"Sync options: send_adds={send_adds}, send_removes={send_removes}, receive_adds={receive_adds}, receive_removes={receive_removes}")

        # collect our three snapshots
        old_remote_snapshot = self.get_current_snapshot(remote_playlist_name)
        if old_remote_snapshot:
            logging.info(f"Existing remote snapshot last updated at {old_remote_snapshot.last_updated}")

        new_remote_snapshot = self.get_playlist_snapshot(remote_playlist_name)
        if new_remote_snapshot:
            logging.info(f"New remote snapshot last updated at {new_remote_snapshot.last_updated}")

        new_local_snapshot = self.create_snapshot(playlist)
        if new_local_snapshot:
            logging.info(f"New local snapshot last updated at {new_local_snapshot.last_updated}")
        
        remote_adds = set()
        remote_removes = set()

        local_adds = set()
        local_removes = set()

        # If remote playlist doesn't exist, create it
        if not new_remote_snapshot:                
            logging.info(f"Remote snapshot for playlist {remote_playlist_name} not found, creating new one")
            # create a new remote playlist
            self.create_playlist(remote_playlist_name, new_local_snapshot)
            new_remote_snapshot = self.get_playlist_snapshot(remote_playlist_name)
            if new_remote_snapshot:
                self.write_snapshot(new_remote_snapshot)
                logging.info(f"Created new remote playlist {new_remote_snapshot.name}")
            return

        # first apply any changes from the local snapshot to the remote
        if old_remote_snapshot and (new_local_snapshot.last_updated > old_remote_snapshot.last_updated):
            logging.info("Processing local changes to send to remote")

            # if the local snapshot is newer, we need to update the remote
            adds = []
            
            if send_adds:
                for item in new_local_snapshot.items:
                    if not old_remote_snapshot.has(item):
                        # send add to remote playlist
                        logging.info(f"Adding {item.to_string()} to remote playlist")
                        adds.append(item)
                        remote_adds.add(item.to_string())
                
                if adds:
                    try:
                        self.add_items(remote_playlist_name, adds)
                        logging.info(f"Added {len(adds)} tracks to remote playlist")
                    except Exception as e:
                        logging.error(f"Error adding tracks to remote playlist: {e}")
            else:
                logging.info("Skipping sending additions to remote (send_adds=False)")
        
            removes_count = 0
            for item in old_remote_snapshot.items:
                if not new_local_snapshot.has(item):
                    # send remove to remote playlist
                    logging.info(f"Removing {item.to_string()} from remote playlist")
                    remote_removes.add(item.to_string())  # save off so that we don't re-add these later accidentally

                    if send_removes:
                        try:
                            self.remove_items(remote_playlist_name, [item])
                            removes_count += 1
                        except Exception as e:
                            logging.error(f"Error removing {item.to_string()} from remote playlist: {e}")
                            continue

            if removes_count > 0:
                logging.info(f"Removed {removes_count} tracks from remote playlist")

        # now apply any changes from the remote snapshot to the local
        if new_remote_snapshot and old_remote_snapshot and (new_remote_snapshot.last_updated > old_remote_snapshot.last_updated):
            logging.info("Processing remote changes to apply to local")
            # if the remote snapshot is newer, we need to update the local
            adds = []
            removes = []
            
            for item in new_remote_snapshot.items:
                if not old_remote_snapshot.has(item):
                    # Add to the list of items to add locally
                    adds.append(item)
                    local_adds.add(item.to_string())
                    
            logging.info(f"Found {len(adds)} tracks to add to local playlist")
            
            for item in old_remote_snapshot.items:
                if not new_remote_snapshot.has(item):
                    # Add to the list of items to remove locally
                    removes.append(item)
                    local_removes.add(item.to_string())
                    
            logging.info(f"Found {len(removes)} tracks to remove from local playlist")

            # Apply the changes to the local playlist
            for item in adds:
                # Skip if this was something we just removed
                if item.to_string() in remote_removes:
                    logging.info(f"Skipping addition of {item.to_string()} as it was just removed locally")
                    continue

                # Try to add as music file first, fall back to requested track
                if receive_adds:
                    logging.info(f"Adding {item.to_string()} to local playlist")
                    result = repo.add_music_file(playlist.id, item, normalize=True)
                    if not result:
                        logging.info(f"Could not find music file for {item.to_string()}, adding as requested track")
                        repo.add_requested_track(playlist.id, item)
                
            for item in removes:
                # Skip if this was something we just added
                if item.to_string() in remote_adds:
                    logging.info(f"Skipping removal of {item.to_string()} as it was just added locally")
                    continue

                if receive_removes:
                    logging.info(f"Removing {item.to_string()} from local playlist")

                    # remove from local playlist using repo
                    repo.remove_music_file(playlist.id, item)

        # Always write the new remote snapshot to track the state
        if new_remote_snapshot:
            self.write_snapshot(new_remote_snapshot)
            logging.info(f"Wrote new remote snapshot to DB for future comparison")