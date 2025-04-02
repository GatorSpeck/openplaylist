from fastapi import Depends
from database import Database
from repositories.music_file import MusicFileRepository
from repositories.playlist import PlaylistRepository
from repositories.last_fm_repository import last_fm_repository
from repositories.plex_repository import plex_repository


def get_db():
    session = Database.get_session()
    try:
        yield session
    finally:
        session.close()


def get_music_file_repository(session=Depends(get_db)):
    return MusicFileRepository(session)


def get_playlist_repository(session=Depends(get_db)):
    return PlaylistRepository(session)

def get_plex_repository(session=Depends(get_db)):
    yield plex_repository(session)