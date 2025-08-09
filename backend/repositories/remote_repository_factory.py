from typing import Dict, Optional
from sqlalchemy.orm import Session

from repositories.remote_playlist_repository import RemotePlaylistRepository
from repositories.plex_repository import PlexRepository
from repositories.spotify_repository import SpotifyRepository
from repositories.youtube_repository import YouTubeMusicRepository

def create_remote_repository(
    service: str,
    session: Session,
    config: Optional[Dict[str, str]] = None,
    music_file_repo=None
) -> RemotePlaylistRepository:
    """
    Factory function to create a remote repository based on service type
    
    Args:
        service: The service type ('plex', 'spotify', 'youtube')
        session: Database session
        config: Service-specific configuration
        
    Returns:
        A RemotePlaylistRepository instance
    """
    config = config or {}
    
    if service == 'plex':
        return PlexRepository(session, config, music_file_repo=music_file_repo)
    elif service == 'spotify':
        return SpotifyRepository(session, config, music_file_repo=music_file_repo)
    elif service == 'youtube':
        return YouTubeMusicRepository(session, config, music_file_repo=music_file_repo)
    else:
        raise ValueError(f"Unsupported service type: {service}")