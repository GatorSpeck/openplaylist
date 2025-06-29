import os
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime
import ytmusicapi
from ytmusicapi import YTMusic, OAuthCredentials

from repositories.remote_playlist_repository import RemotePlaylistRepository, get_local_tz
from response_models import PlaylistSnapshot, PlaylistItem
from lib.normalize_title import normalize_title

class YouTubeMusicRepository(RemotePlaylistRepository):
    """Repository for YouTube Music playlists"""
    
    def __init__(self, session, config: Dict[str, str] = None):
        super().__init__(session, config)
        
        # Get the playlist ID from the config
        self.playlist_uri = self.config.get("playlist_uri")
        if not self.playlist_uri:
            raise ValueError("YouTube playlist URI must be provided in config")
            
        # Extract playlist ID from URL if needed
        if "list=" in self.playlist_uri:
            self.playlist_id = self.playlist_uri.split("list=")[1].split("&")[0]
        else:
            self.playlist_id = self.playlist_uri
            
        # Set up authentication
        # You may need to customize this based on your authentication method
        # For now, using default authentication
        try:
            self.ytmusic = YTMusic("oauth.json", oauth_credentials=OAuthCredentials(client_id=os.getenv("YTMUSIC_CLIENT_ID"), client_secret=os.getenv("YTMUSIC_CLIENT_SECRET")))
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
            self.ytmusic.get_library_playlists(limit=1)
            return True
        except Exception as e:
            logging.error(f"YouTube Music authentication test failed: {e}")
            return False
    
    def fetch_media_item(self, item: PlaylistItem) -> Any:
        """Search for a track on YouTube Music"""
        if not self.is_authenticated():
            logging.error("Not authenticated with YouTube Music")
            return None
            
        try:
            # Build search query
            query = f"{item.artist} - {item.title}"
            if item.album:
                query += f" {item.album}"
                
            search_results = self.ytmusic.search(query, filter="songs", limit=10)
            
            if not search_results:
                return None
            
            # Score the results similar to Spotify implementation
            for track in search_results:
                score = 0
                track_title = track.get("title", "")
                track_artists = track.get("artists", [])
                track_album = track.get("album", {})
                
                # Title matching
                if normalize_title(track_title) == normalize_title(item.title):
                    score += 10
                elif track_title.lower() == item.title.lower():
                    score += 8
                
                # Artist matching
                if track_artists:
                    artist_names = [artist.get("name", "") for artist in track_artists]
                    if any(name.lower() == item.artist.lower() for name in artist_names):
                        score += 5
                
                # Album matching
                if item.album and track_album:
                    album_name = track_album.get("name", "")
                    if normalize_title(album_name) == normalize_title(item.album):
                        score += 5
                
                track["score"] = score
            
            # Sort by score and return the best match
            search_results.sort(key=lambda x: x.get("score", 0), reverse=True)
            
            if search_results[0].get("score", 0) > 0:
                return search_results[0]
                
            return search_results[0] if search_results else None
            
        except Exception as e:
            logging.error(f"Error searching for YouTube Music track {item.to_string()}: {e}")
            return None
    
    def create_playlist(self, playlist_name: str, snapshot: PlaylistSnapshot) -> Any:
        """Create a new playlist on YouTube Music or update existing one"""
        if not self.is_authenticated():
            logging.error("Not authenticated with YouTube Music")
            return None
            
        try:
            # If we have a playlist ID in config, use that instead of creating a new one
            if self.playlist_id:
                # Just add tracks to the existing playlist
                return self._update_playlist_tracks(snapshot)
            
            # Create a new playlist
            playlist_id = self.ytmusic.create_playlist(
                title=playlist_name,
                description=f"Created by OpenPlaylist App on {datetime.now().strftime('%Y-%m-%d')}"
            )
            
            self.playlist_id = playlist_id
            
            # Add all tracks
            track_ids = []
            for item in snapshot.items:
                track = self.fetch_media_item(item)
                if track and track.get("videoId"):
                    track_ids.append(track["videoId"])
            
            # Add tracks in batches if needed
            if track_ids:
                self.ytmusic.add_playlist_items(playlist_id, track_ids)
                
            return self.ytmusic.get_playlist(playlist_id)
            
        except Exception as e:
            logging.error(f"Error creating YouTube Music playlist: {e}")
            return None
    
    def _update_playlist_tracks(self, snapshot: PlaylistSnapshot):
        """Replace all tracks in a playlist with the ones from the snapshot"""
        if not self.playlist_id:
            raise ValueError("No playlist ID configured")
            
        try:
            # Get current playlist to clear it
            current_playlist = self.ytmusic.get_playlist(self.playlist_id, limit=None)
            
            # Remove all existing tracks
            if current_playlist.get("tracks"):
                track_ids_to_remove = [track["setVideoId"] for track in current_playlist["tracks"] if track.get("setVideoId")]
                if track_ids_to_remove:
                    self.ytmusic.remove_playlist_items(self.playlist_id, track_ids_to_remove)
            
            # Add new tracks
            track_ids = []
            for item in snapshot.items:
                track = self.fetch_media_item(item)
                if track and track.get("videoId"):
                    track_ids.append(track["videoId"])
            
            if track_ids:
                self.ytmusic.add_playlist_items(self.playlist_id, track_ids)
                
            return self.ytmusic.get_playlist(self.playlist_id)
            
        except Exception as e:
            logging.error(f"Error updating YouTube Music playlist tracks: {e}")
            return None
    
    def get_playlist_snapshot(self, playlist_name: str) -> Optional[PlaylistSnapshot]:
        """Get a snapshot of a YouTube Music playlist"""
        if not self.is_authenticated():
            logging.error("Not authenticated with YouTube Music")
            return None
            
        try:
            # For YouTube Music, we ignore playlist_name and use the ID from config
            playlist = self.ytmusic.get_playlist(self.playlist_id, limit=None)
            
            if not playlist:
                return None
            
            result = PlaylistSnapshot(
                name=playlist_name,  # Use the provided name for consistency
                last_updated=datetime.now(get_local_tz()),  # YouTube doesn't provide last updated time
                items=[]
            )
            
            for track in playlist.get("tracks", []):
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
                    title=track.get("title", "Unknown Title")
                )
                result.add_item(playlist_item)
                
            logging.info(f"YouTube Music playlist snapshot contains {len(result.items)} items")
            return result
            
        except Exception as e:
            logging.error(f"Error fetching YouTube Music playlist: {e}")
            return None
    
    def add_items(self, playlist_name: str, items: List[PlaylistItem]) -> None:
        """Add tracks to a YouTube Music playlist"""
        if not self.is_authenticated():
            logging.error("Not authenticated with YouTube Music")
            return
            
        track_ids = []
        for item in items:
            track = self.fetch_media_item(item)
            if track and track.get("videoId"):
                track_ids.append(track["videoId"])
            else:
                logging.warning(f"Track not found for item: {item.to_string()}")
        
        if track_ids:
            try:
                self.ytmusic.add_playlist_items(self.playlist_id, track_ids)
                logging.info(f"Added {len(track_ids)} tracks to YouTube Music playlist")
            except Exception as e:
                logging.error(f"Error adding tracks to YouTube Music playlist: {e}")
    
    def remove_items(self, playlist_name: str, items: List[PlaylistItem]) -> None:
        """Remove tracks from a YouTube Music playlist"""
        if not self.is_authenticated():
            logging.error("Not authenticated with YouTube Music")
            return
            
        try:
            # Get current playlist to find the tracks to remove
            playlist = self.ytmusic.get_playlist(self.playlist_id, limit=None)
            
            for item in items:
                # Find matching track in the playlist
                for track in playlist.get("tracks", []):
                    if not track:
                        continue
                        
                    track_title = track.get("title", "")
                    track_artists = track.get("artists", [])

                    score = 0
                    
                    # Check if this track matches the item we want to remove
                    if track_title.lower() == item.title.lower():
                        score += 10
                    elif normalize_title(track_title) == normalize_title(item.title):
                        score += 5
                    
                    artist_match = False
                    if track_artists:
                        artist_names = [artist.get("name", "") for artist in track_artists]
                        artist_match = any(name.lower() == item.artist.lower() for name in artist_names)
                        if artist_match:
                            score += 5
                    
                    if score < 10:
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