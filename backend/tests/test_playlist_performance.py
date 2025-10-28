import pytest
from repositories.music_file import MusicFileRepository
from repositories.playlist_repository import PlaylistRepository, PlaylistFilter
from response_models import MusicFileEntry, MusicFile
from models import Base, MusicFileDB, TrackGenreDB, PlaylistDB, MusicFileEntryDB
import datetime
import time
import logging

@pytest.fixture
def playlist_repo(test_db):
    return PlaylistRepository(test_db)

def add_music_file(test_db, title, commit=True):
    music_file = MusicFileDB(
        path=f"/test/{title}.mp3",
        title=title,
        artist="Test Artist",
        album="Test Album",
        kind="audio/mp3",
        last_scanned=datetime.datetime.now()
    )
    test_db.add(music_file)
    if commit:
        test_db.commit()
    return music_file

@pytest.fixture
def sample_playlist(test_db):
    playlist = PlaylistDB(name="Test Playlist")
    test_db.add(playlist)
    test_db.commit()
    return playlist

@pytest.fixture
def sample_music_file(test_db):
    return add_music_file(test_db, "Test Song")

@pytest.mark.slow
def test_large_playlist_performance(test_db, sample_playlist, playlist_repo):
    ITERS = 10000

    logging.info("Creating music files")

    music_files = []
    for i in range(ITERS):
        music_files.append(add_music_file(test_db, f"Test Song{i}", commit=False))
    
    test_db.commit()

    logging.info("Adding to playlist")
    
    start_time = time.time()
    playlist_repo.add_entries(sample_playlist.id, [
        MusicFileEntry(
            entry_type="music_file",
            order=i,
            music_file_id=music_files[i].id,
        )
        for i in range(ITERS)
    ])

    add_duration = time.time() - start_time
    print(add_duration)

    start_time = time.time()
    entries = playlist_repo.get_without_details(sample_playlist.id)
    without_details_duration = time.time() - start_time
    print(without_details_duration)

    start_time = time.time()
    entries = playlist_repo.get_with_entries(sample_playlist.id)
    with_details_duration = time.time() - start_time
    print(with_details_duration)

    start_time = time.time()
    filter = PlaylistFilter()
    entries = playlist_repo.filter_playlist(sample_playlist.id, filter)
    filter_duration = time.time() - start_time
    print(filter_duration)

    assert add_duration < 10.0
    assert without_details_duration < 1.0
    assert with_details_duration < 2.0
    assert filter_duration < 1.0
    