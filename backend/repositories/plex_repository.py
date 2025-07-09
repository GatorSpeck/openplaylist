import os
import dotenv
dotenv.load_dotenv(override=True)
from fastapi.exceptions import HTTPException
import logging
from plexapi.server import PlexServer
from plexapi.playlist import Playlist as PlexPlaylist
import plexapi
from typing import List, Optional, Dict, Any
from tqdm import tqdm
from lib.normalize   import normalize_title

from repositories.remote_playlist_repository import RemotePlaylistRepository, PlaylistSnapshot, PlaylistItem, get_local_tz

class PlexRepository(RemotePlaylistRepository):
    """Repository for Plex playlists"""
    
    def __init__(self, session, config: Dict[str, str] = None):
        super().__init__(session, config)
        
        # Try config first, then environment variables
        self.plex_endpoint = self.config.get("endpoint") or os.getenv("PLEX_ENDPOINT")
        self.plex_token = self.config.get("token") or os.getenv("PLEX_TOKEN")
        self.plex_library = self.config.get("library") or os.getenv("PLEX_LIBRARY", "Music")
        
        if not self.plex_endpoint or not self.plex_token:
            raise ValueError("Plex endpoint and token must be provided")
            
        self.server = PlexServer(self.plex_endpoint, token=self.plex_token)
    
    def fetch_media_item(self, item: PlaylistItem) -> Any:
        """Fetch a media item from Plex"""
        try:
            logging.debug(f"Fetching Plex object for {item.to_string()}")

            normalized_title = normalize_title(item.title)
            normalized_album = normalize_title(item.album) if item.album else None

            def score_plex_results(items):
                for plex_item in items:
                    score = 0
                    if plex_item.title.lower() == item.title.lower():
                        score += 20
                    elif normalized_title == normalize_title(plex_item.title):
                        score += 10

                    if plex_item.artist().title.lower() == item.artist.lower():
                        score += 5

                    if item.album and normalized_album == normalize_title(plex_item.album().title):
                        score += 5
                        
                    plex_item.score = score
                    logging.info(f"Score for {plex_item.title}: {score}")

                    if score == 30:
                        logging.info(f"Exact match found for {item.to_string()}: {plex_item.title}")
                        return [plex_item]
                
                items.sort(key=lambda x: getattr(x, 'score', 0), reverse=True)
                return items

            filters = {"artist.title": item.artist}
            if item.album:
                filters["album.title"] = item.album
            
            plex_items = self.server.library.section(self.plex_library).search(
                libtype="track",
                title=normalized_title,
                filters=filters,
                maxresults=10
            )

            plex_items = score_plex_results(plex_items)

            if plex_items and plex_items[0].score == 30:
                return plex_items[0]

            # no exact match - try a wider search
            plex_items = self.server.library.section(self.plex_library).search(
                libtype="track",
                title=normalized_title,
                maxresults=50
            )

            logging.info(f"Found {len(plex_items)} Plex items matching {item.to_string()}")
            
            plex_items = score_plex_results(plex_items)
            
            if not plex_items:
                return None

            logging.info(f"Best match for {item.to_string()}: {plex_items[0].title} with score {plex_items[0].score}")

            return plex_items[0]
        except Exception as e:
            logging.error(f"Error fetching Plex object for {item.to_string()}: {e}")
            return None
    
    def create_playlist(self, playlist_name: str, snapshot: PlaylistSnapshot) -> PlexPlaylist:
        """Create a new playlist in Plex"""
        audio_items = []

        if snapshot:
            for item in snapshot.items:
                audio = self.fetch_media_item(item)
                if audio:
                    audio_items.append(audio)

        playlist = PlexPlaylist.create(self.server, title=playlist_name, items=audio_items)
        return playlist
    
    def get_playlist_snapshot(self, playlist_name: str) -> Optional[PlaylistSnapshot]:
        """Get a snapshot of a Plex playlist"""
        try:
            logging.info(f"Fetching playlist {playlist_name} from Plex")
            playlist = None
            try:
                playlist = self.server.playlist(playlist_name)
            except plexapi.exceptions.NotFound:
                return None

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
                    title=item.title,
                    local_path=item.media[0].parts[0].file if item.media else None,
                )

                result.add_item(i)

            logging.info(f"Playlist {playlist_name} has {len(playlist.items())} items")

            return result
        except Exception as e:
            logging.error(f"Error fetching playlist {playlist_name}: {e}")
            raise HTTPException(status_code=500, detail=f"Error fetching playlist {playlist_name}")
    
    def add_items(self, playlist_name: str, items: List[PlaylistItem]) -> None:
        """Add items to a Plex playlist"""
        plex_items = []
        for item in items:
            plex_item = self.fetch_media_item(item)
            if plex_item:
                plex_items.append(plex_item)
        
        if plex_items:
            self.server.playlist(playlist_name).addItems(plex_items)
    
    def remove_items(self, playlist_name: str, items: List[PlaylistItem]) -> None:
        """Remove items from a Plex playlist"""
        for item in items:
            plex_item = self.fetch_media_item(item)
            if plex_item:
                try:
                    self.server.playlist(playlist_name).removeItems([plex_item])
                except Exception as e:
                    logging.error(f"Error removing {item.to_string()} from Plex playlist: {e}")
                    continue
