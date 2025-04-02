import os
import dotenv
dotenv.load_dotenv(override=True)
from fastapi.exceptions import HTTPException
import logging
import pathlib
from plexapi.server import PlexServer
from plexapi.playlist import Playlist as PlexPlaylist
from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional
from models import PlaylistSnapshot as PlaylistSnapshotModel
import difflib

class PlaylistItem(BaseModel):
    artist: str
    album: Optional[str] = None
    title: str

class PlaylistSnapshot(BaseModel):
    name: str
    last_updated: datetime
    items: List[PlaylistItem]

    def diff(self, other):
        # use difflib to compare the two playlists and return the differences
        left_contents = [f"{item.artist} - {item.album} - {item.title}" for item in self.items]
        right_contents = [f"{item.artist} - {item.album} - {item.title}" for item in other.items]
        diff = difflib.ndiff(left_contents, right_contents)
        return list(diff)

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
    
    def get_current_snapshot(self, name) -> PlaylistSnapshot:
        result = self.session.query(PlaylistSnapshotModel).filter_by(name=name).first()
        if not result:
            return None

        return PlaylistSnapshot(
            name=result.name,
            last_updated=result.last_updated,
            items=[
                PlaylistItem(
                    artist=item.get("artist"),
                    album=item.get("album"),
                    title=item.get("title")
                ) for item in result.contents
            ]
        )

    def write_snapshot(self, snapshot: PlaylistSnapshot):
        result = self.session.query(PlaylistSnapshotModel).filter_by(name=snapshot.name).first()
        if not result:
            result = PlaylistSnapshotModel(
                name=snapshot.name,
                last_updated=datetime.now(),
                contents=[]
            )

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
            playlist = self.server.playlist(playlist_name)
            logging.info(f"Playlist {playlist_name} last updated at {playlist.updatedAt}")

            result = PlaylistSnapshot(
                name=playlist.title,
                last_updated=playlist.updatedAt,
                items=[]
            )

            for item in playlist.items():
                i = PlaylistItem(
                    artist=item.artist().title,
                    album=item.album().title if item.album() else None,
                    title=item.title
                )

                result.items.append(i)


            logging.info(f"Playlist {playlist_name} has {len(playlist.items())} items")

            return result
        except Exception as e:
            logging.error(f"Error fetching playlist {playlist_name}: {e}")
            raise HTTPException(status_code=500, detail=f"Error fetching playlist {playlist_name}")
    
    def sync_playlist_to_plex_old(self, repo, playlist_id):
        if not self.m3u_source or not self.m3u_target:
            raise HTTPException(status_code=500, detail="Plex drop path not configured")

        if self.map_source and self.map_target:
            logging.info(f"Mapping track paths: source = {self.map_source}, target = {self.map_target}")

        m3u_content = repo.export_to_m3u(
            playlist_id, mapping_source=self.map_source, mapping_target=self.map_target
        )

        playlist = repo.get_by_id(playlist_id)

        m3u_path = pathlib.Path(self.m3u_source) / f"{playlist.name}.m3u"

        logging.info(f"Writing playlist to {m3u_path}")
        with open(m3u_path, "w") as f:
            while True:
                try:
                    chunk = next(m3u_content)
                except StopIteration:
                    break
                
                if not chunk:
                    break
                f.write(chunk)
        
        logging.info("Done updating M3U file")

        if self.m3u_source and self.m3u_target:
            logging.info(f"Mapping m3u path: source = {self.m3u_source}, target = {self.m3u_target}")
            endpoint = str(m3u_path).replace(self.m3u_source, self.m3u_target)
        
        logging.info(f"Syncing playlist to Plex: m3u path sent to Plex = {endpoint}")

        PlexPlaylist.create(self.server, playlist.name, section=self.server.library.section(self.plex_library), m3ufilepath=endpoint)
        logging.info(f"Playlist {playlist.name} synced to Plex")
    
    def sync_playlist_to_plex(self, repo, playlist_id):
        # lookup playlist by id
        playlist = repo.get_by_id(playlist_id)
        if not playlist:
            logging.error(f"Playlist with id {playlist_id} not found")
            raise HTTPException(status_code=404, detail="Playlist not found")
        
        logging.info(f"Syncing playlist {playlist.name} to Plex")
        db_snapshot = self.get_current_snapshot(playlist.name)

        current_snapshot = self.get_playlist_snapshot(playlist.name)

        if db_snapshot:
            # compare the two snapshots
            logging.info(f"Comparing snapshots for playlist {playlist.name}")
            logging.info(f"DB snapshot last updated at {db_snapshot.last_updated}")
            logging.info(f"Current snapshot last updated at {current_snapshot.last_updated}")

            if db_snapshot.last_updated > current_snapshot.last_updated:
                logging.info(f"DB snapshot is newer, need to update Plex")
            elif db_snapshot.last_updated < current_snapshot.last_updated:
                logging.info(f"Plex snapshot is newer, need to update DB")

            d = db_snapshot.diff(current_snapshot)
            for line in d:
                if line.startswith("+ "):
                    logging.info(f"Added: {line[2:]}")
                elif line.startswith("- "):
                    logging.info(f"Removed: {line[2:]}")
                elif line.startswith("? "):
                    logging.info(f"Changed: {line[2:]}")
        else:
            self.write_snapshot(current_snapshot)

        logging.info(f"Syncing playlist {playlist.name} to Plex")
    