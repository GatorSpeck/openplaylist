from fastapi import Depends
from database import Database
from repositories.music_file import MusicFileRepository
from repositories.playlist import PlaylistRepository
from repositories.last_fm_repository import last_fm_repository
from repositories.plex_repository import PlexRepository
from repositories.spotify_repository import SpotifyRepository
from redis import Redis
import os


def get_db():
    session = Database.get_session()
    try:
        yield session
    finally:
        session.close()


def get_redis():
    """Get Redis connection if configured, otherwise return None"""
    redis_host = os.getenv("REDIS_HOST")
    redis_port = int(os.getenv("REDIS_PORT", "6379"))
    
    if redis_host and redis_port:
        try:
            redis_client = Redis(host=redis_host, port=redis_port, db=0, decode_responses=True)
            # Test the connection
            redis_client.ping()
            return redis_client
        except Exception as e:
            print(f"Failed to connect to Redis: {e}")
            return None
    return None


def get_music_file_repository(session=Depends(get_db)):
    return MusicFileRepository(session)


def get_playlist_repository(session=Depends(get_db)):
    return PlaylistRepository(session)

def get_plex_repository(session=Depends(get_db), music_file_repo=Depends(get_music_file_repository)):
    return PlexRepository(session, music_file_repo=music_file_repo)

def get_spotify_repository(session=Depends(get_db), redis_session=Depends(get_redis), music_file_repo=Depends(get_music_file_repository)):
    yield SpotifyRepository(session, redis_session=redis_session, music_file_repo=music_file_repo)
