import os
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime
import ytmusicapi
from ytmusicapi import YTMusic, OAuthCredentials

from repositories.remote_playlist_repository import RemotePlaylistRepository, get_local_tz
from response_models import PlaylistSnapshot, PlaylistItem
from lib.normalize import normalize_title
from lib.match import TrackStub, get_match_score

import dotenv
dotenv.load_dotenv(override=True)

def get_video_id_from_track(track: Dict[str, Any]) -> Optional[str]:
    """Extract video ID from a YouTube Music track dictionary"""
    if not track:
        return None
    
    # Check common fields for video ID
    if "videoId" in track:
        return track["videoId"]
    
    if "videoDetails" in track and "videoId" in track["videoDetails"]:
        return track["videoDetails"]["videoId"]
    
    return None

class YouTubeMusicRepository(RemotePlaylistRepository):
    """Repository for YouTube Music playlists"""
    
    def __init__(self, session, config: Dict[str, str] = None, music_file_repo=None):
        super().__init__(session, config)
        self.playlist_id = None
        
        # Get the playlist ID from the config
        self.playlist_uri = self.config.get("playlist_uri")
        if self.playlist_uri:
            self.playlist_id = self.extract_playlist_id(self.playlist_uri)
            logging.info(f"Editing YouTube Music playlist with ID: {self.playlist_id}")
        
        self.music_file_repo = music_file_repo
            
        # Set up authentication
        try:
            oauth_path = os.getenv("YTMUSIC_OAUTH_PATH", "oauth.json")
            logging.info(f"Using YouTube Music OAuth path: {os.path.abspath(oauth_path)}")
            if not os.path.exists(oauth_path):
                raise FileNotFoundError(f"OAuth file not found at {oauth_path}")
            
            # if not os.getenv("YOUTUBE_CLIENT_ID") or not os.getenv("YOUTUBE_CLIENT_SECRET"):
            #     raise ValueError("YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET must be set in environment variables")

            # self.ytmusic = YTMusic(oauth_path, oauth_credentials=OAuthCredentials(
            #     client_id=os.getenv("YOUTUBE_CLIENT_ID"),
            #     client_secret=os.getenv("YOUTUBE_CLIENT_SECRET"))
            # )

            self.ytmusic = YTMusic(oauth_path)

            logging.info("YouTube Music client initialized successfully")
        except Exception as e:
            logging.error(f"Failed to initialize YouTube Music client: {e}")
            self.ytmusic = None
    
    def is_authenticated(self) -> bool:
        """Check if we have a valid YouTube Music client"""
        if not self.ytmusic:
            return False
            
        try:
            # Test the connection with a simple API call
            playlists = self.ytmusic.get_library_playlists(limit=None)
            return True
        except Exception as e:
            logging.error(f"YouTube Music authentication test failed: {e}")
            return False
    
    def validate_playlist_edit_permissions(self) -> bool:
        """Validate that we can edit YouTube Music playlists - fail fast if not properly authenticated"""
        if not self.ytmusic:
            raise ValueError("YouTube Music client not initialized - check authentication credentials")
        
        if not self.playlist_id:
            # If no specific playlist ID is configured, just check if we can access our library
            try:
                playlists = self.ytmusic.get_library_playlists(limit=1)
                logging.info("YouTube Music authentication validated - can access playlist library")
                return True
            except Exception as e:
                raise ValueError(f"YouTube Music authentication failed - cannot access playlist library: {e}")
        
        # If we have a specific playlist ID, validate we can access and edit it
        try:
            playlist, resolved_id = self._fetch_playlist_with_fallback_ids(self.playlist_id, limit=1)
            if not playlist:
                raise ValueError(f"Cannot access YouTube Music playlist with ID: {self.playlist_id}")

            if resolved_id:
                self.playlist_id = resolved_id
            
            # Check if we can edit this playlist (it should be editable if we own it)
            if playlist.get("privacy") == "PRIVATE" or playlist.get("owned"):
                logging.info(f"YouTube Music authentication validated - can edit playlist '{playlist.get('title', self.playlist_id)}'")
                return True
            else:
                raise ValueError(f"Cannot edit YouTube Music playlist '{playlist.get('title', self.playlist_id)}' - insufficient permissions or not owned by authenticated user")
                
        except Exception as e:
            if "Cannot access" in str(e) or "Cannot edit" in str(e):
                raise  # Re-raise our custom errors
            raise ValueError(f"YouTube Music authentication validation failed: {e}")
    
    def extract_playlist_id(self, id_string: str) -> str:
        id_string = (id_string or "").strip()
        if "list=" in id_string:
            return id_string.split("list=")[1].split("&")[0]
        
        return id_string

    def _candidate_playlist_ids(self, playlist_id_or_uri: str) -> List[str]:
        extracted = self.extract_playlist_id(playlist_id_or_uri)
        candidates: List[str] = []

        if extracted:
            candidates.append(extracted)
            if extracted.startswith("VL") and len(extracted) > 2:
                candidates.append(extracted[2:])

        deduped: List[str] = []
        for candidate in candidates:
            if candidate and candidate not in deduped:
                deduped.append(candidate)

        return deduped

    def _fetch_playlist_with_fallback_ids(self, playlist_id_or_uri: str, limit=None):
        candidates = self._candidate_playlist_ids(playlist_id_or_uri)
        last_error = None

        for candidate_id in candidates:
            try:
                playlist = self.ytmusic.get_playlist(candidate_id, limit=limit)
                if playlist:
                    return playlist, candidate_id
            except Exception as e:
                last_error = e

        if last_error:
            raise last_error

        return None, None
    
    def lookup_playlist_id_by_name(self, playlist_name: str) -> Optional[str]:
        """Lookup a YouTube Music playlist ID by name"""
        if not self.ytmusic:
            logging.error("Not authenticated with YouTube Music")
            return None
            
        try:
            playlists = self.ytmusic.get_library_playlists(limit=None)
            for playlist in playlists:
                if playlist.get("title", "") == playlist_name:
                    return playlist.get("playlistId")
            return None
        except Exception as e:
            logging.error(f"Error looking up YouTube Music playlist by name {playlist_name}: {e}")
            return None
    
    def fetch_media_item(self, item: PlaylistItem) -> Any:
        """Search for a track on YouTube Music"""
        if not self.ytmusic:
            logging.error("Not authenticated with YouTube Music")
            return None
        
        if item.youtube_url:
            # If we already have a YouTube URL, just return it
            try:
                track = self.ytmusic.get_song(item.youtube_url)
                if track:
                    logging.info(f"Found track by URL: {item.youtube_url}")
                    return track
            except Exception as e:
                logging.error(f"Error fetching track by URL {item.youtube_url}: {e}")
                return None
            
        try:
            # Build search query
            query = f"{item.artist} - {item.title}"
            if item.album:
                query += f" - {item.album}"
            
            query = query[:100]
                
            search_results = self.ytmusic.search(query, filter="songs", limit=10)
            
            if not search_results:
                return None
            
            match_stub = TrackStub(artist=item.artist, title=item.title, album=item.album)
            
            # Score the results similar to Spotify implementation
            for track in search_results:
                artist = track["artists"][0]["name"] if track.get("artists") else ""
                title = track["title"] if track.get("title") else ""
                album = track["album"]["name"] if track.get("album") else ""
                score = get_match_score(match_stub, TrackStub(
                    artist=artist,
                    title=title,
                    album=album,
                ))
                
                track["score"] = score
            
            # Sort by score and return the best match
            search_results.sort(key=lambda x: x.get("score", 0), reverse=True)

            result = None
            
            if search_results[0].get("score", 0) > 0:
                result = search_results[0]
                
            if not result:
                result = search_results[0] if search_results else None
            
            if result:
                music_file = self.music_file_repo.search_by_playlist_item(item)
                if not music_file:
                    logging.warning(f"No music file found for {item.to_string()}")
                else:
                    music_file_db = self.session.query(self.music_file_repo.model).filter(self.music_file_repo.model.id == music_file.id).first()
                    if not music_file_db:
                        logging.warning(f"No music file DB entry found for ID {music_file.id}")
                    else:
                        music_file_db.youtube_url = get_video_id_from_track(result)
                        self.session.commit()

            return result
            
        except Exception as e:
            logging.error(f"Error searching for YouTube Music track {item.to_string()}: {e}")
            return None
    
    def create_playlist(self, playlist_name: str, snapshot: PlaylistSnapshot) -> Any:
        """Create a new playlist on YouTube Music or update existing one"""
        # Validate authentication and permissions before starting sync
        self.validate_playlist_edit_permissions()
        
        if not self.ytmusic:
            logging.error("Not authenticated with YouTube Music")
            return None
            
        try:
            # If we have a playlist ID in config, use that instead of creating a new one
            if self.playlist_id:
                # Just add tracks to the existing playlist
                logging.info(f"Using existing YouTube Music playlist ID: {self.playlist_id}")
                return self._update_playlist_tracks(snapshot)

            logging.info(f"Creating new YouTube Music playlist: {playlist_name}")

            # Create a new playlist
            playlist_id = self.ytmusic.create_playlist(
                title=playlist_name,
                description=f"Created by OpenPlaylist App on {datetime.now().strftime('%Y-%m-%d')}"
            )
            
            self.playlist_id = playlist_id
            logging.info(f"Created YouTube Music playlist with ID: {playlist_id}")
            
            # Add all tracks
            track_ids = []
            for item in snapshot.items:
                track = self.fetch_media_item(item)
                if track and get_video_id_from_track(track):
                    track_ids.append(get_video_id_from_track(track))

            # Add tracks in batches if needed
            if track_ids:
                self.ytmusic.add_playlist_items(playlist_id, track_ids)
                
            return self.ytmusic.get_playlist(playlist_id)
            
        except Exception as e:
            logging.error(f"Error creating YouTube Music playlist: {e}")
            return None
    
    def _update_playlist_tracks(self, snapshot: PlaylistSnapshot):
        """Replace all tracks in a playlist with the ones from the snapshot"""
        # Validate authentication and permissions before making changes
        self.validate_playlist_edit_permissions()
        
        if not self.playlist_id:
            raise ValueError("No playlist ID configured")
            
        try:
            # Get current playlist to clear it
            current_playlist = self.ytmusic.get_playlist(self.playlist_id, limit=None)
            
            # Remove all existing tracks
            if current_playlist.get("tracks"):
                track_ids_to_remove = [track for track in current_playlist["tracks"] if track.get("setVideoId")]
                if track_ids_to_remove:
                    self.ytmusic.remove_playlist_items(self.playlist_id, track_ids_to_remove)
            
            # Add new tracks
            track_ids = []
            for item in snapshot.items:
                track = self.fetch_media_item(item)
                if track and get_video_id_from_track(track):
                    track_ids.append(get_video_id_from_track(track))
            
            if track_ids:
                self.ytmusic.add_playlist_items(self.playlist_id, track_ids)
                
            return self.ytmusic.get_playlist(self.playlist_id)
            
        except Exception as e:
            logging.error(f"Error updating YouTube Music playlist tracks: {e}")
            return None
    
    def get_playlist_snapshot(self, playlist_name: str) -> Optional[PlaylistSnapshot]:
        """Get a snapshot of a YouTube Music playlist"""
        if not self.ytmusic:
            logging.error("Not authenticated with YouTube Music")
            return None
        
        if not self.playlist_id:
            logging.error("No playlist ID configured for YouTube Music")
            return None
            
        try:
            # For YouTube Music, we ignore playlist_name and use the ID from config
            playlist, resolved_id = self._fetch_playlist_with_fallback_ids(self.playlist_id, limit=None)
            if resolved_id:
                self.playlist_id = resolved_id
            
            if not playlist:
                return None

            tracks = playlist.get("tracks") or []

            if not tracks and self.playlist_id:
                try:
                    retry_playlist, retry_id = self._fetch_playlist_with_fallback_ids(self.playlist_id, limit=2000)
                    if retry_playlist:
                        playlist = retry_playlist
                        tracks = retry_playlist.get("tracks") or []
                        if retry_id:
                            self.playlist_id = retry_id
                except Exception as retry_error:
                    logging.warning(f"YouTube playlist retry failed for {self.playlist_id}: {retry_error}")
            
            result = PlaylistSnapshot(
                name=playlist_name,  # Use the provided name for consistency
                last_updated=datetime.now(get_local_tz()),  # YouTube doesn't provide last updated time
                items=[]
            )
            
            for track in tracks:
                if not track:  # Skip invalid tracks
                    continue
                    
                artist = "Unknown Artist"
                if track.get("artists") and len(track["artists"]) > 0:
                    artist = track["artists"][0].get("name", "Unknown Artist")
                
                # YouTube doesn't always include album info
                album = None
                if track.get("album"):
                    album = track["album"].get("name")
                
                playlist_item = PlaylistItem(
                    artist=artist,
                    album=album,
                    title=track.get("title", "Unknown Title"),
                    youtube_url=get_video_id_from_track(track)
                )
                result.add_item(playlist_item)
                
            logging.info(
                "YouTube Music playlist snapshot for %s (%s) contains %d items",
                playlist.get("title", playlist_name),
                self.playlist_id,
                len(result.items),
            )
            return result
            
        except Exception as e:
            logging.error(f"Error fetching YouTube Music playlist: {e}")
            return None
    
    def add_items(self, playlist_name: str, items: List[PlaylistItem]) -> None:
        """Add tracks to a YouTube Music playlist"""
        # Validate authentication and permissions before making changes
        self.validate_playlist_edit_permissions()
        
        if not self.ytmusic:
            logging.error("Not authenticated with YouTube Music")
            return
            
        if not self.playlist_id:
            logging.error("No playlist ID configured for YouTube Music")
            return

        track_ids = []
        for item in items:
            track = self.fetch_media_item(item)
            if not track:
                logging.warning(f"No track found for item: {item.to_string()}")
                continue

            video_id = get_video_id_from_track(track)
            if not video_id:
                logging.warning(f"No videoId found for item: {item.to_string()}")
                continue

            track_ids.append(video_id)
        
        if track_ids:
            try:
                self.ytmusic.add_playlist_items(self.playlist_id, track_ids)
                logging.info(f"Added {len(track_ids)} tracks to YouTube Music playlist")
            except Exception as e:
                logging.error(f"Error adding tracks to YouTube Music playlist: {e}")
    
    def remove_items(self, playlist_name: str, items: List[PlaylistItem]) -> None:
        """Remove tracks from a YouTube Music playlist"""
        # Validate authentication and permissions before making changes
        self.validate_playlist_edit_permissions()
        
        if not self.ytmusic:
            logging.error("Not authenticated with YouTube Music")
            return
        
        if not self.playlist_id:
            logging.error("No playlist ID configured for YouTube Music")
            return
            
        try:
            # Get current playlist to find the tracks to remove
            playlist = self.ytmusic.get_playlist(self.playlist_id, limit=None)
            
            for item in items:
                match_stub = TrackStub(artist=item.artist, title=item.title, album=item.album)

                # Find matching track in the playlist
                for track in playlist.get("tracks", []):
                    if not track:
                        continue

                    score = get_match_score(match_stub, TrackStub(
                        artist=track["artists"][0]["name"] if track.get("artists") else "",
                        title=track.get("title", ""),
                        album=track["album"]["name"] if track.get("album") else ""
                    ))
                    
                    if score < 20:
                        continue
                    
                    if track.get("setVideoId"):
                        try:
                            self.ytmusic.remove_playlist_items(self.playlist_id, [track])
                            logging.info(f"Removed {item.to_string()} from YouTube Music playlist")
                            break  # Only remove the first match
                        except Exception as e:
                            logging.error(f"Error removing {item.to_string()} from YouTube Music playlist: {e}")
                            continue
                            
        except Exception as e:
            logging.error(f"Error removing tracks from YouTube Music playlist: {e}")
    
    def clear_playlist(self) -> None:
        """Clear all items from the YouTube Music playlist"""
        # Validate authentication and permissions before making changes
        self.validate_playlist_edit_permissions()
        
        if not self.ytmusic:
            logging.error("Not authenticated with YouTube Music")
            return
        
        if not self.playlist_id:
            logging.error("No playlist ID configured for YouTube Music")
            return
            
        try:
            # Get current playlist to find the tracks to remove
            playlist = self.ytmusic.get_playlist(self.playlist_id, limit=None)

            tracks = playlist.get("tracks", [])

            track_ids_to_remove = [track for track in tracks if track.get("setVideoId")]
            if track_ids_to_remove:
                self.ytmusic.remove_playlist_items(self.playlist_id, track_ids_to_remove)
                logging.info(f"Cleared all items from YouTube Music playlist ID: {self.playlist_id}")
            else:
                logging.info("YouTube Music playlist is already empty")
                
        except Exception as e:
            logging.error(f"Error clearing YouTube Music playlist: {e}")
