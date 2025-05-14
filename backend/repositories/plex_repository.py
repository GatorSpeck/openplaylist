import os
import dotenv
dotenv.load_dotenv(override=True)
from fastapi.exceptions import HTTPException
import logging
from plexapi.server import PlexServer
from plexapi.playlist import Playlist as PlexPlaylist
from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional
from models import PlaylistSnapshot as PlaylistSnapshotModel, PlaylistDB
import difflib
from tqdm import tqdm

class PlaylistItem(BaseModel):
    artist: str
    album: Optional[str] = None
    title: str

    def to_string(self):
        return f"{self.artist} - {self.album} - {self.title}"

class PlaylistSnapshot(BaseModel):
    name: str
    last_updated: datetime
    items: List[PlaylistItem]
    item_set: set = set()

    def has(self, item: PlaylistItem):
        return item.to_string() in self.item_set

    def add_item(self, item: PlaylistItem):
        self.items.append(item)
        self.item_set.add(item.to_string())

    def diff(self, other):
        # use difflib to compare the two playlists and return the differences
        left_contents = [item.to_string() for item in self.items]
        right_contents = [item.to_string() for item in other.items]
        diff = difflib.ndiff(left_contents, right_contents)
        return list(diff)

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

class plex_repository:
    def __init__(self, session):
        self.session = session
        self.m3u_source = os.getenv("PLEX_M3U_DROP_SOURCE", None)
        self.m3u_target = os.getenv("PLEX_M3U_DROP_TARGET", None)
        self.map_source = os.getenv("PLEX_MAP_SOURCE", None)
        self.map_target = os.getenv("PLEX_MAP_TARGET", None)
        self.plex_endpoint = os.getenv("PLEX_ENDPOINT", None)
        self.plex_token = os.getenv("PLEX_TOKEN", None)
        self.plex_library = os.getenv("PLEX_LIBRARY", None)

        self.server = PlexServer(self.plex_endpoint, token=self.plex_token)
    
    def fetch_audio(self, entry: PlaylistItem):        
        # lookup the item in Plex
        try:
            item = self.server.library.search(
                libtype="track",
                title=entry.title,
                artist=entry.artist,
                album=entry.album,
                maxresults=1
            )

            if item:
                return item[0]
        except Exception as e:
            logging.error(f"Error fetching Plex object for {entry.to_string()}: {e}")
            return None
    
    def get_current_snapshot(self, name) -> PlaylistSnapshot:
        this_playlist = self.session.query(PlaylistSnapshotModel).filter_by(name=name).first()
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
                title=item.get("title")
            )

            result.add_item(i)

        return result
    
    def create_snapshot(self, playlist: PlaylistDB) -> PlaylistSnapshot:
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
                title=e.details.title
            )

            result.add_item(new_item)
        
        return result

    def write_snapshot(self, snapshot: PlaylistSnapshot):
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
                "title": item.title
            })
        
        self.session.add(result)
        self.session.commit()
    
    def get_playlist_snapshot(self, playlist_name) -> PlaylistSnapshot:
        try:
            logging.info(f"Fetching playlist {playlist_name} from Plex")
            playlist = self.server.playlist(playlist_name)

            # TODO: assume same as Plex server's TZ
            local_timezone = get_local_tz()

            result = PlaylistSnapshot(
                name=playlist.title,
                last_updated=playlist.updatedAt.astimezone(local_timezone),
                items=[]
            )

            for item in tqdm(playlist.items(), desc="Fetching Plex playlist entries"):
                album = item.album()
                i = PlaylistItem(
                    artist=item.artist().title,
                    album=album.title if album else None,
                    title=item.title
                )

                result.add_item(i)


            logging.info(f"Playlist {playlist_name} has {len(playlist.items())} items")

            return result
        except Exception as e:
            logging.error(f"Error fetching playlist {playlist_name}: {e}")
            raise HTTPException(status_code=500, detail=f"Error fetching playlist {playlist_name}")
    
    def sync_playlist_to_plex(self, repo, playlist_id):
        # lookup playlist by id
        playlist = repo.get_by_id(playlist_id)
        if not playlist:
            logging.error(f"Playlist with id {playlist_id} not found")
            raise HTTPException(status_code=404, detail="Playlist not found")
        
        logging.info(f"Syncing playlist {playlist.name} to Plex")

        # collect our three snapshots
        old_remote_snapshot = self.get_current_snapshot(playlist.name)
        if old_remote_snapshot:
            logging.info(f"Existing remote snapshot last updated at {old_remote_snapshot.last_updated}")

        new_remote_snapshot = self.get_playlist_snapshot(playlist.name)
        if new_remote_snapshot:
            logging.info(f"New remote snapshot last updated at {new_remote_snapshot.last_updated}")

        new_local_snapshot = self.create_snapshot(playlist)
        if new_local_snapshot:
            logging.info(f"New local snapshot last updated at {new_local_snapshot.last_updated}")
        
        remote_adds = set()
        remote_removes = set()

        local_adds = set()
        local_removes = set()

        # first apply any changes from the local snapshot to the remote
        if old_remote_snapshot and (new_local_snapshot.last_updated > old_remote_snapshot.last_updated):
            logging.info("Local changes detected")

            # if the local snapshot is newer, we need to update the remote
            adds = []
            for item in new_local_snapshot.items:
                if not old_remote_snapshot.has(item):
                    # send add to Plex playlist
                    logging.info(f"Adding {item.to_string()} to Plex playlist")
                    adds.append(self.fetch_audio(item))
                    remote_adds.add(item.to_string())
            
            self.server.playlist(playlist.name).addItems(adds)
            
            for item in old_remote_snapshot.items:
                if not new_local_snapshot.has(item):
                    # send remove to Plex playlist
                    logging.info(f"Removing {item.to_string()} from Plex playlist")
                    remote_removes.add(item.to_string())
                    try:
                        self.server.playlist(playlist.name).removeItems([self.fetch_audio(item)])
                    except Exception as e:
                        logging.error(f"Error removing {item.to_string()} from Plex playlist: {e}")
                        continue
        else:
            logging.info("No local changes detected")

        # now apply any changes from the remote snapshot to the local
        if new_remote_snapshot and old_remote_snapshot and (new_remote_snapshot.last_updated > old_remote_snapshot.last_updated):
            logging.info("Remote changes detected")
            # if the remote snapshot is newer, we need to update the local
            adds = []
            removes = []
            for item in new_remote_snapshot.items:
                if not old_remote_snapshot.has(item):
                    # send add to local playlist
                    adds.append(item)
                    local_adds.add(item.to_string())
            
            for item in old_remote_snapshot.items:
                if not new_remote_snapshot.has(item):
                    # send remove to local playlist
                    removes.append(item)
                    local_removes.add(item.to_string())

            for item in adds:
                if item.to_string() in remote_removes:
                    continue

                logging.info(f"Adding {item.to_string()} to local playlist")

                # add to local playlist using repo
                repo.add_music_file(playlist.id, item)
                
            for item in removes:
                if item.to_string() in remote_adds:
                    continue

                logging.info(f"Removing {item.to_string()} from local playlist")

                # remove from local playlist using repo
                repo.remove_music_file(playlist.id, item)
        else:
            logging.info("No remote changes detected")

        self.write_snapshot(new_remote_snapshot)
        logging.info(f"Wrote new Plex snapshot to DB")

        logging.info(f"Syncing playlist {playlist.name} to Plex")
    