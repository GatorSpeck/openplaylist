import os
import json
import time
from datetime import datetime
import dotenv
from typing import Dict, Optional, List, Any
import logging
import spotipy
from spotipy.oauth2 import SpotifyOAuth, CacheFileHandler
from fastapi import HTTPException, Depends
from repositories.plex_repository import normalize_title

from repositories.remote_playlist_repository import RemotePlaylistRepository, PlaylistSnapshot, PlaylistItem, get_local_tz
from repositories.requests_cache_session import requests_cache_session

dotenv.load_dotenv(override=True)

# Environment variables for OAuth
CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID", None)
CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET", None)
REDIRECT_URI = os.getenv("SPOTIFY_REDIRECT_URI", None)

# Path for token cache files
CACHE_PATH = os.getenv("SPOTIFY_CACHE_PATH", "./.spotify_cache")
os.makedirs(CACHE_PATH, exist_ok=True)

class SpotifyTokenManager:
    """Manages Spotify OAuth tokens"""
    
    def __init__(self, client_id=None, client_secret=None, redirect_uri=None, cache_path=None, username=None):
        """Initialize with credentials and optional username for multi-user support"""
        self.client_id = client_id or CLIENT_ID
        self.client_secret = client_secret or CLIENT_SECRET
        self.redirect_uri = redirect_uri or REDIRECT_URI
        self.cache_path = cache_path or CACHE_PATH
        self.username = username
        
        if not self.client_id or not self.client_secret or not self.redirect_uri:
            raise ValueError("Spotify credentials incomplete. Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REDIRECT_URI")
        
        # Set up cache handler
        if username:
            cache_path = os.path.join(self.cache_path, f".spotify_cache_{username}")
        else:
            cache_path = os.path.join(self.cache_path, ".spotify_cache")
            
        self.cache_handler = CacheFileHandler(cache_path=cache_path)
        
        # Initialize OAuth manager with full permissions for playlist manipulation
        self.auth_manager = SpotifyOAuth(
            client_id=self.client_id,
            client_secret=self.client_secret,
            redirect_uri=self.redirect_uri,
            scope="playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private user-library-read",
            cache_handler=self.cache_handler,
            open_browser=False  # Don't automatically open browser
        )
    
    def get_auth_url(self):
        """Get the authorization URL to start the OAuth flow"""
        return self.auth_manager.get_authorize_url()
    
    def get_cached_token(self):
        """Get the cached token if available and valid"""
        try:
            token_info = self.cache_handler.get_cached_token()
            
            if token_info and self.auth_manager.is_token_expired(token_info):
                logging.info("Token expired, attempting to refresh...")
                try:
                    token_info = self.auth_manager.refresh_access_token(token_info['refresh_token'])
                    self.cache_handler.save_token_to_cache(token_info)
                except Exception as e:
                    logging.error(f"Failed to refresh token: {e}")
                    return None
                    
            return token_info
        except Exception as e:
            logging.error(f"Error getting cached token: {e}")
            return None
    
    def get_access_token(self, code=None):
        """
        Get access token either from cache or using the provided code
        
        Returns:
            The access token string if available, None otherwise
        """
        token_info = None
        
        # First try with the provided code if any
        if code:
            try:
                # If code is provided, fetch new token
                logging.info("Getting token from authorization code")
                token_info = self.auth_manager.get_access_token(code)
            except Exception as e:
                logging.error(f"Failed to get token from code: {e}")
        
        # If no token from code, try the cache
        if not token_info:
            token_info = self.get_cached_token()
                
        if not token_info:
            logging.warning("No valid token available")
            return None
            
        return token_info.get('access_token')
    
    def clear_token(self):
        """Clear the cached token"""
        if os.path.exists(self.cache_handler.cache_path):
            os.remove(self.cache_handler.cache_path)
            logging.info(f"Token cache cleared: {self.cache_handler.cache_path}")
            return True
        return False


class SpotifyRepository(RemotePlaylistRepository):
    """Repository for Spotify playlists that extends RemotePlaylistRepository"""
    
    def __init__(self, session=None, config: Dict[str, str] = None, 
                 username=None, access_token=None):
        """
        Initialize the repository
        
        Args:
            session: Database session
            config: Configuration dictionary with service-specific settings
            username: Optional username for multi-user support
            access_token: Direct access token if available
        """
        # Call parent constructor first
        super().__init__(session, config or {})
        
        # Extract playlist URI from config if available
        self.playlist_uri = self.config.get("playlist_uri")
        if self.playlist_uri and self.playlist_uri.startswith("spotify:playlist:"):
            self.playlist_id = self.playlist_uri.split(":")[-1]
        elif self.playlist_uri and "playlist/" in self.playlist_uri:
            # Handle URL format
            self.playlist_id = self.playlist_uri.split("playlist/")[-1].split("?")[0]
        else:
            self.playlist_id = self.playlist_uri
        
        self.client_id = self.config.get("client_id") or CLIENT_ID
        self.client_secret = self.config.get("client_secret") or CLIENT_SECRET
        self.redirect_uri = self.config.get("redirect_uri") or REDIRECT_URI
        
        self.sp = None

        self.playlist_snapshots = {}
        
        # Set up authentication
        if access_token:
            # Direct token provided
            logging.info("Initializing Spotify client with provided access token")
            self.sp = spotipy.Spotify(auth=access_token)
            self.token_manager = None
        else:
            # Set up OAuth
            self.token_manager = SpotifyTokenManager(
                client_id=self.client_id,
                client_secret=self.client_secret,
                redirect_uri=self.redirect_uri,
                username=username
            )
            
            # Try to get a token
            token = self.token_manager.get_access_token()
            
            if token:
                logging.info("Initializing Spotify client with cached token")
                self.sp = spotipy.Spotify(auth=token)
            else:
                logging.warning("No Spotify token available. Authentication required.")
                self.sp = None
    
    def is_authenticated(self):
        """
        Check if we have a valid Spotify client
        
        Returns:
            bool: True if authenticated, False otherwise
        """
        if not self.sp:
            return False
            
        # Test the token with a simple API call
        try:
            self.sp.current_user()
            return True
        except Exception as e:
            logging.error(f"Authentication test failed: {e}")
            # Token might be invalid, force re-auth
            self.sp = None
            return False
            
    def get_auth_url(self):
        """Get the URL to start OAuth flow"""
        if not self.token_manager:
            raise ValueError("Token manager not initialized. Use credentials instead of direct token.")
        return self.token_manager.get_auth_url()
    
    def handle_oauth_callback(self, code):
        """
        Process the OAuth callback and initialize the client
        
        Args:
            code: Authorization code from OAuth callback
            
        Returns:
            bool: True if successful, False otherwise
        """
        if not self.token_manager:
            raise ValueError("Token manager not initialized. Use credentials instead of direct token.")
            
        token = self.token_manager.get_access_token(code)
        if token:
            logging.info("Successfully obtained token from code")
            self.sp = spotipy.Spotify(auth=token)
            
            # Verify the connection
            try:
                user = self.sp.current_user()
                logging.info(f"Authenticated as: {user.get('display_name', 'Unknown')}")
                return True
            except Exception as e:
                logging.error(f"Authentication verification failed: {e}")
                self.sp = None
                return False
                
        logging.error("Failed to get token from code")
        return False
    
    def get_current_user(self):
        """Get the current authenticated user's info"""
        if not self.is_authenticated():
            raise HTTPException(status_code=401, detail="Not authenticated with Spotify")
            
        return self.sp.current_user()
    
    # Required methods from RemotePlaylistRepository
    
    def fetch_media_item(self, item: PlaylistItem) -> Any:
        """Search for a track on Spotify"""
        if not self.is_authenticated():
            raise HTTPException(status_code=401, detail="Not authenticated with Spotify")
            
        query = f"artist:{item.artist} track:{item.title}"
        if item.album:
            query += f" album:{item.album}"
        
        results = self.sp.search(q=query, limit=10, type="track")

        if results and results["tracks"]["items"]:
            for track in results["tracks"]["items"]:
                score = 0
                if normalize_title(track["name"]) == normalize_title(item.title):
                    score += 10
                if any(artist["name"].lower() == item.artist.lower() for artist in track["artists"]):
                    score += 5
                if item.album and normalize_title(track["album"]["name"]) == normalize_title(item.album):
                    score += 5
                
                track["score"] = score
            
            results["tracks"]["items"].sort(key=lambda x: x.get("score", 0), reverse=True)
            return results["tracks"]["items"][0]  # Return the best match
        
        return None
    
    def create_playlist(self, playlist_name: str, snapshot: PlaylistSnapshot) -> Any:
        """Create a new playlist on Spotify or update existing one"""
        if not self.is_authenticated():
            raise HTTPException(status_code=401, detail="Not authenticated with Spotify")
            
        # If we have a playlist ID in config, use that instead of creating a new one
        if self.playlist_id:
            # Just add tracks to the existing playlist
            return self._update_playlist_tracks(snapshot)
        
        # Create a new playlist
        user = self.sp.current_user()
        new_playlist = self.sp.user_playlist_create(
            user["id"], 
            name=playlist_name,
            public=False, 
            description=f"Created by Playlist App on {time.strftime('%Y-%m-%d')}"
        )
            
        # Add all tracks
        track_uris = []
        for item in snapshot.items:
            track = self.fetch_media_item(item)
            if track:
                track_uris.append(track["uri"])
        
        # Add tracks in batches (Spotify has a limit)
        if track_uris:
            for i in range(0, len(track_uris), 100):
                batch = track_uris[i:i+100]
                self.sp.playlist_add_items(new_playlist["id"], batch)
            
        return new_playlist
    
    def _update_playlist_tracks(self, snapshot: PlaylistSnapshot):
        """Replace all tracks in a playlist with the ones from the snapshot"""
        if not self.playlist_id:
            raise ValueError("No playlist ID configured")
            
        # Get all track URIs from the snapshot
        track_uris = []
        for item in snapshot.items:
            track = self.fetch_media_item(item)
            if track:
                track_uris.append(track["uri"])
                
        # Replace all tracks
        if track_uris:
            self.sp.playlist_replace_items(self.playlist_id, [])  # Clear first
            
            # Add in batches
            for i in range(0, len(track_uris), 100):
                batch = track_uris[i:i+100]
                self.sp.playlist_add_items(self.playlist_id, batch)
                
        return self.sp.playlist(self.playlist_id)
    
    def get_playlist_snapshot(self, playlist_name: str) -> Optional[PlaylistSnapshot]:
        """Get a snapshot of a Spotify playlist for sync"""
        try:
            if not self.is_authenticated():
                logging.error("Not authenticated with Spotify")
                return None
                
            # For Spotify, we ignore playlist_name and use the URI from config
            playlist_id = self.playlist_id
            if not playlist_id:
                raise ValueError("No playlist ID provided in config")
                
            playlist = self.sp.playlist(playlist_id)
            
            result = PlaylistSnapshot(
                name=playlist_name,  # Use the provided name for consistency
                last_updated=datetime.now(get_local_tz()),  # Spotify doesn't provide last updated time
                items=[]
            )
            
            # Get all tracks (handle pagination)
            tracks = []
            results_page = self.sp.playlist_tracks(playlist_id)
            
            while True:
                tracks.extend(results_page.get("items", []))
                if results_page.get("next"):
                    results_page = self.sp.next(results_page)
                else:
                    break
                
            for item in tracks:
                track = item.get("track")
                if not track:  # Skip local files or unavailable tracks
                    continue
                
                artist = track.get("artists", [{}])[0].get("name", "Unknown Artist") if track.get("artists") else "Unknown Artist"
                album = track.get("album", {}).get("name")
                
                playlist_item = PlaylistItem(
                    artist=artist,
                    album=album,
                    title=track.get("name", "Unknown Title"),
                    uri=track.get("uri", None)
                )

                result.add_item(playlist_item)
                
            
            self.playlist_snapshots[playlist_name] = result

            return result
        except Exception as e:
            logging.error(f"Error fetching Spotify playlist snapshot: {e}")
            return None
    
    def add_items(self, playlist_name: str, items: List[PlaylistItem]) -> None:
        """Add tracks to a Spotify playlist"""
        if not self.is_authenticated():
            raise HTTPException(status_code=401, detail="Not authenticated with Spotify")
            
        track_uris = []
        for item in items:
            track = self.fetch_media_item(item)
            if track:
                track_uris.append(track["uri"])
        
        if track_uris:
            # Add in batches of 100 (Spotify limit)
            for i in range(0, len(track_uris), 100):
                batch = track_uris[i:i+100]
                self.sp.playlist_add_items(self.playlist_id, batch)
    
    def remove_items(self, playlist_name: str, items: List[PlaylistItem]) -> None:
        """Remove tracks from a Spotify playlist"""
        if not self.is_authenticated():
            raise HTTPException(status_code=401, detail="Not authenticated with Spotify")
            
        for item in items:
            logging.info("Removing item from spotify playlist: %s", item.to_string())
            if item.uri:
                self.sp.playlist_remove_all_occurrences_of_items(self.playlist_id, [item.uri])
                logging.info("Removed item by URI: %s", item.uri)
            else:
                # try to find the track in the cached snapshot
                snapshot = self.playlist_snapshots.get(playlist_name)
                if snapshot:
                    track = snapshot.search_track(item)

                    if track and track.uri:
                        self.sp.playlist_remove_all_occurrences_of_items(self.playlist_id, [track.uri])
                        logging.info("Removed item by URI: %s", track.uri)
                    else:
                        logging.warning(f"Track not found in snapshot for item: {item.to_string(normalize=True)}")
                else:
                    logging.warning(f"Snapshot not found for playlist: {playlist_name}")


# Helper functions to get repository instances

def get_spotify_repo(session=None, username=None, config=None):
    """Get a Spotify repository instance"""
    if not CLIENT_ID or not CLIENT_SECRET or not REDIRECT_URI:
        logging.warning("Spotify credentials incomplete. Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REDIRECT_URI")
        return None
    
    return SpotifyRepository(
        session=session,
        username=username,
        config=config
    )

# For use with dependency injection
def get_spotify_repository(session=None):
    """Get a Spotify repository for dependency injection"""
    return get_spotify_repo(session=session)
