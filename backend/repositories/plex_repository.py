import os
import dotenv
dotenv.load_dotenv(override=True)
from fastapi.exceptions import HTTPException
import logging
from plexapi.server import PlexServer
from plexapi.playlist import Playlist as PlexPlaylist
import plexapi
from typing import List, Optional, Dict, Any, Tuple
from tqdm import tqdm
from lib.normalize   import normalize_title
from lib.match import TrackStub, get_match_score
from lib.timing import timing

from repositories.remote_playlist_repository import RemotePlaylistRepository, PlaylistSnapshot, PlaylistItem, get_local_tz

class PlexRepository(RemotePlaylistRepository):
    """Repository for Plex playlists"""
    
    def __init__(self, session, config: Dict[str, str] = None, music_file_repo=None, redis_session=None):
        super().__init__(session, config)
        
        # Store the music file repository for updating rating keys
        self.music_file_repo = music_file_repo
        
        # Try config first, then environment variables
        self.plex_endpoint = self.config.get("endpoint") or os.getenv("PLEX_ENDPOINT")
        self.plex_token = self.config.get("token") or os.getenv("PLEX_TOKEN")
        self.plex_library = self.config.get("library") or os.getenv("PLEX_LIBRARY", "Music")
        self.playlist_name = self.config.get("playlist_name")
        self.redis_session = redis_session
        
        if not self.plex_endpoint or not self.plex_token:
            raise ValueError("Plex endpoint and token must be provided")
            
        self.server = PlexServer(self.plex_endpoint, token=self.plex_token)

        self.section = self.server.library.section(self.plex_library)

    def _normalize_playlist_name(self, playlist_name: str) -> str:
        if not playlist_name:
            return ""
        return " ".join(playlist_name.strip().split()).casefold()

    def _find_matching_playlists(self, playlist_name: str) -> List[PlexPlaylist]:
        """Find all Plex playlists matching a name using normalized comparison."""
        normalized_name = self._normalize_playlist_name(playlist_name)
        if not normalized_name:
            return []

        matches: List[PlexPlaylist] = []
        for playlist in self.server.playlists():
            if self._normalize_playlist_name(getattr(playlist, "title", "")) == normalized_name:
                matches.append(playlist)

        return matches

    def _find_playlist(self, playlist_name: str) -> Optional[PlexPlaylist]:
        """Find a Plex playlist by name with normalized duplicate detection."""
        if not playlist_name:
            return None

        try:
            matches = self._find_matching_playlists(playlist_name)
            if len(matches) > 1:
                logging.warning(
                    "Detected %d Plex playlists with duplicate name '%s'; using the first match",
                    len(matches),
                    playlist_name,
                )
            if matches:
                return matches[0]
        except Exception as e:
            logging.warning(f"Error listing Plex playlists while looking up '{playlist_name}': {e}")

        try:
            return self.server.playlist(playlist_name)
        except plexapi.exceptions.NotFound:
            return None
        except Exception as e:
            logging.warning(f"Error looking up Plex playlist '{playlist_name}' by direct query: {e}")

        return None

    def _ensure_playlist(self, playlist_name: str, seed_items: Optional[List[Any]] = None) -> Tuple[Optional[PlexPlaylist], bool]:
        """Ensure playlist exists in Plex; returns (playlist, created_with_seed)."""
        playlist = self._find_playlist(playlist_name)
        if playlist is not None:
            return playlist, False

        if not seed_items:
            logging.warning(
                "Cannot create missing Plex playlist '%s' without seed items; Plex requires items at creation time",
                playlist_name,
            )
            return None, False

        try:
            duplicate_matches = self._find_matching_playlists(playlist_name)
            if duplicate_matches:
                logging.info(
                    "Found existing Plex playlist '%s' during ensure; reusing existing playlist",
                    playlist_name,
                )
                return duplicate_matches[0], False
            return PlexPlaylist.create(self.server, title=playlist_name, items=seed_items), True
        except Exception as e:
            logging.error(f"Failed to create Plex playlist '{playlist_name}': {e}")
            return None, False

    @timing
    def fetch_media_item(self, item: PlaylistItem) -> Any:
        """Fetch a single media item from Plex."""
        try:
            return self.fetch_media_items([item]).get(id(item))
        except Exception as e:
            logging.error(f"Error fetching Plex object for {item.to_string()}: {e}")
            return None

    @timing
    def fetch_media_items(self, items: List[PlaylistItem]) -> Dict[int, Any]:
        """Fetch multiple media items from Plex, using bulk rating-key lookup where possible."""
        if not items:
            return {}

        results: Dict[int, Any] = {id(item): None for item in items}

        rating_key_to_items: Dict[int, List[PlaylistItem]] = {}
        unresolved: List[PlaylistItem] = []
        unresolved_ids = set()

        for item in items:
            if item.plex_rating_key:
                try:
                    rating_key = int(item.plex_rating_key)
                    rating_key_to_items.setdefault(rating_key, []).append(item)
                    continue
                except (TypeError, ValueError):
                    logging.warning(f"Invalid Plex rating key '{item.plex_rating_key}' for {item.to_string()}")

            unresolved.append(item)
            unresolved_ids.add(id(item))

        if rating_key_to_items:
            rating_keys = list(rating_key_to_items.keys())
            bulk_chunk_size = 100
            fetched_by_rating_key: Dict[str, Any] = {}

            for start in range(0, len(rating_keys), bulk_chunk_size):
                chunk = rating_keys[start:start + bulk_chunk_size]
                try:
                    fetched_items = self.server.fetchItems(chunk)
                    for plex_item in fetched_items:
                        rating_key_value = getattr(plex_item, "ratingKey", None)
                        if rating_key_value is not None:
                            fetched_by_rating_key[str(rating_key_value)] = plex_item
                except Exception as e:
                    logging.warning(
                        "Bulk Plex fetchItems() failed for chunk size %d; falling back for this chunk: %s",
                        len(chunk),
                        e,
                    )
                    for rating_key in chunk:
                        for unresolved_item in rating_key_to_items.get(rating_key, []):
                            if id(unresolved_item) not in unresolved_ids:
                                unresolved.append(unresolved_item)
                                unresolved_ids.add(id(unresolved_item))

            for rating_key, keyed_items in rating_key_to_items.items():
                plex_item = fetched_by_rating_key.get(str(rating_key))
                if plex_item:
                    for item in keyed_items:
                        results[id(item)] = plex_item
                else:
                    for unresolved_item in keyed_items:
                        if id(unresolved_item) not in unresolved_ids:
                            unresolved.append(unresolved_item)
                            unresolved_ids.add(id(unresolved_item))

        for item in unresolved:
            results[id(item)] = self._search_media_item(item)

        return results

    def _search_media_item(self, item: PlaylistItem) -> Any:
        """Search Plex for a single item when rating-key lookup is unavailable."""
        normalized_title = normalize_title(item.title)

        def score_plex_results(candidates):
            match_stub = TrackStub(artist=item.artist, title=item.title, album=item.album)
            for plex_item in candidates:
                artist = plex_item.grandparentTitle
                album = plex_item.parentTitle

                score = get_match_score(match_stub, TrackStub(
                    artist=artist,
                    title=plex_item.title,
                    album=album
                ))

                plex_item.score = score
                logging.info(f"Score for {plex_item.title}: {score}")

                if score >= 80:
                    logging.info(f"Exact match found for {item.to_string()}: {plex_item.title}")
                    return [plex_item]

            candidates.sort(key=lambda x: getattr(x, 'score', 0), reverse=True)
            return candidates

        filters = {"artist.title": item.artist}
        if item.album:
            filters["album.title"] = item.album

        plex_items = self.section.search(
            libtype="track",
            title=normalized_title,
            filters=filters,
            maxresults=10
        )

        plex_items = score_plex_results(plex_items)

        if plex_items and plex_items[0].score >= 30:
            self._update_music_file_plex_rating_key(item, str(plex_items[0].ratingKey))
            return plex_items[0]

        plex_items = self.section.search(
            libtype="track",
            title=normalized_title,
            maxresults=50
        )

        logging.info(f"Found {len(plex_items)} Plex items matching {item.to_string()}")
        plex_items = score_plex_results(plex_items)

        if not plex_items:
            return None

        logging.info(f"Best match for {item.to_string()}: {plex_items[0].title} with score {plex_items[0].score}")
        self._update_music_file_plex_rating_key(item, str(plex_items[0].ratingKey))
        return plex_items[0]

    def _update_music_file_plex_rating_key(self, item: PlaylistItem, plex_rating_key: str):
        """Update the music file with the Plex rating key if we have a music file repository"""
        if not self.music_file_repo:
            return
        
        try:
            music_file = self.music_file_repo.search_by_playlist_item(item)
            if not music_file:
                logging.warning(f"No music file found for {item.to_string()}")
            else:
                music_file_db = self.session.query(self.music_file_repo.model).filter(self.music_file_repo.model.id == music_file.id).first()
                if not music_file_db:
                    logging.warning(f"No music file DB entry found for ID {music_file.id}")
                else:
                    music_file_db.plex_rating_key = plex_rating_key
                    self.session.commit()
        except Exception as e:
            logging.error(f"Error updating music file with Plex rating key: {e}")

    def create_playlist(self, playlist_name: str, snapshot: PlaylistSnapshot) -> PlexPlaylist:
        """Create a new playlist in Plex"""
        audio_items = []

        if snapshot and snapshot.items:
            media_by_item = self.fetch_media_items(snapshot.items)
            for item in snapshot.items:
                audio = media_by_item.get(id(item))
                if audio:
                    audio_items.append(audio)

        existing_playlist = self._find_playlist(playlist_name)
        if existing_playlist is not None:
            try:
                existing_playlist.removeItems(existing_playlist.items())
            except Exception as e:
                logging.warning(f"Unable to clear existing Plex playlist '{playlist_name}': {e}")

            if audio_items:
                existing_playlist.addItems(audio_items)
            return existing_playlist

        if not audio_items:
            logging.warning(
                "Skipping create for Plex playlist '%s' because no tracks resolved and Plex requires items at creation",
                playlist_name,
            )
            return None

        playlist = PlexPlaylist.create(self.server, title=playlist_name, items=audio_items)
        return playlist
    
    @timing
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
                album = item.parentTitle
                i = PlaylistItem(
                    artist=item.grandparentTitle,
                    album=album,
                    title=item.title,
                    local_path=item.media[0].parts[0].file if item.media else None,
                    plex_rating_key=str(item.ratingKey),
                )

                result.add_item(i)

            logging.info(f"Playlist {playlist_name} has {len(playlist.items())} items")

            return result
        except Exception as e:
            logging.error(f"Error fetching playlist {playlist_name}: {e}")
            raise HTTPException(status_code=500, detail=f"Error fetching playlist {playlist_name}")
    
    def add_items(self, playlist_name: str, items: List[PlaylistItem]) -> None:
        """Add items to a Plex playlist"""
        media_by_item = self.fetch_media_items(items)
        plex_items = []
        for item in items:
            plex_item = media_by_item.get(id(item))
            if plex_item:
                item.plex_rating_key = str(plex_item.ratingKey)  # enrich the item with Plex rating key
                plex_items.append(plex_item)
        
        if plex_items:
            playlist = self._find_playlist(playlist_name)
            if playlist is None:
                playlist, created_with_seed = self._ensure_playlist(playlist_name, seed_items=plex_items)
                if created_with_seed:
                    return

            if playlist is None:
                logging.error(f"Unable to add items; Plex playlist '{playlist_name}' could not be created or found")
                return
            playlist.addItems(plex_items)
    
    def remove_items(self, playlist_name: str, items: List[PlaylistItem]) -> None:
        """Remove items from a Plex playlist"""
        playlist = self._find_playlist(playlist_name)
        if playlist is None:
            logging.info(f"Plex playlist '{playlist_name}' not found during remove; skipping")
            return

        media_by_item = self.fetch_media_items(items)
        for item in items:
            plex_item = media_by_item.get(id(item))
            if plex_item:
                try:
                    playlist.removeItems([plex_item])
                except Exception as e:
                    logging.error(f"Error removing {item.to_string()} from Plex playlist: {e}")
                    continue

    def is_authenticated(self) -> bool:
        """Check if the repository is authenticated"""
        try:
            self.server.account()
            return True
        except Exception as e:
            logging.error(f"Plex authentication failed: {e}")
            return False
        
        return False
    
    def clear_playlist(self) -> None:
        """Clear all items from the Plex playlist"""
        try:
            playlist = self._find_playlist(self.playlist_name)
            if playlist is not None:
                playlist.removeItems(playlist.items())
        except Exception as e:
            logging.error(f"Error clearing Plex playlist {self.playlist_name}: {e}")
    
    @timing
    def search_tracks(self, query: str, title: str = None, artist: str = None, album: str = None, max_results: int = 20):
        """Search for tracks in Plex library"""
        try:
            # Build search filters
            filters = {}
            if artist:
                filters["artist.title"] = artist
            if album:
                filters["album.title"] = album
            
            # Use title if provided, otherwise fall back to general query
            search_title = title if title else query
            
            # Search for tracks in Plex library
            plex_items = self.section.search(
                libtype="track",
                title=search_title,
                filters=filters,
                maxresults=max_results
            )
            
            results = []
            for item in plex_items:
                try:                    
                    result = {
                        "title": item.title,
                        "artist": item.grandparentTitle,
                        "album": item.parentTitle,
                        "service": "plex",
                        "plex_rating_key": str(item.ratingKey),
                        "score": 0
                    }
                    results.append(result)
                except Exception as e:
                    logging.warning(f"Error processing Plex item {item.title}: {e}")
                    continue
            
            return results
            
        except Exception as e:
            logging.error(f"Error searching Plex: {e}")
            raise e