import os
import logging
from typing import List, Optional, Dict, Any
import ytmusicapi  # You'll need to install this package

from repositories.remote_playlist_repository import RemotePlaylistRepository, PlaylistSnapshot, PlaylistItem, get_local_tz

class YouTubeRepository(RemotePlaylistRepository):
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
        # This will need to be customized based on your authentication method
        self.ytmusic = ytmusicapi.YTMusic()
    
    def fetch_media_item(self, item: PlaylistItem) -> Any:
        """Search for a track on YouTube Music"""
        query = f"{item.artist} - {item.title}"
        if item.album:
            query += f" {item.album}"
            
        search_results = self.ytmusic.search(query, filter="songs", limit=1)
        
        if search_results:
            return search_results[0]
        return None
    
    def create_playlist(self, playlist_name: str, snapshot: PlaylistSnapshot) -> Any:
        """Create a new playlist on YouTube Music"""
        # For SyncConfig, we're using an existing playlist identified by URI
        
        # Add tracks to the existing playlist
        for item in snapshot.items:
            track = self.fetch_media_item(item)
            if track:
                self.ytmusic.add_playlist_items(self.playlist_id, [track["videoId"]])
                
        return self.ytmusic.get_playlist(self.playlist_id)
    
    def get_playlist_snapshot(self, playlist_name: str) -> Optional[PlaylistSnapshot]:
        """Get a snapshot of a YouTube Music playlist"""
        try:
            # For YouTube Music, we ignore playlist_name and use the ID from config
            playlist = self.ytmusic.get_playlist(self.playlist_id, limit=None)
            
            result = PlaylistSnapshot(
                name=playlist_name,  # Use the provided name for consistency
                last_updated=get_local_tz(),  # YouTube doesn't provide last updated time
                items=[]
            )
            
            for track in playlist["tracks"]:
                artist = track["artists"][0]["name"] if track.get("artists") else "Unknown Artist"
                # YouTube doesn't always include album info
                album = track.get("album", {}).get("name") if track.get("album") else None
                
                playlist_item = PlaylistItem(
                    artist=artist,
                    album=album,
                    title=track["title"]
                )
                result.add_item(playlist_item)
                
            return result
        except Exception as e:
            logging.error(f"Error fetching YouTube Music playlist: {e}")
            return None
    
    def add_items(self, playlist_name: str, items: List[PlaylistItem]) -> None:
        """Add tracks to a YouTube Music playlist"""
        for item in items:
            track = self.fetch_media_item(item)
            if track:
                self.ytmusic.add_playlist_items(self.playlist_id, [track["videoId"]])
    
    def remove_items(self, playlist_name: str, items: List[PlaylistItem]) -> None:
        """Remove tracks from a YouTube Music playlist"""
        for item in items:
            # This is more complex for YouTube as we need to find the ID of the track in the playlist
            playlist = self.ytmusic.get_playlist(self.playlist_id)
            for track in playlist["tracks"]:
                if (track.get("artists", [{}])[0].get("name") == item.artist and
                    track.get("title") == item.title):
                    self.ytmusic.remove_playlist_items(self.playlist_id, [track["setVideoId"]])
                    break