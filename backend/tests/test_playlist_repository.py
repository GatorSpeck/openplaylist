import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from repositories.playlist import PlaylistRepository
from models import *
from response_models import *
import datetime

@pytest.fixture
def engine():
    return create_engine('sqlite:///:memory:')

@pytest.fixture
def session(engine):
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()

@pytest.fixture
def playlist_repo(session):
    return PlaylistRepository(session)

@pytest.fixture
def sample_playlist(session):
    playlist = PlaylistDB(name="Test Playlist")
    session.add(playlist)
    session.commit()
    return playlist

@pytest.fixture
def sample_music_file(session):
    music_file = MusicFileDB(
        path="/test/path.mp3",
        title="Test Song",
        artist="Test Artist",
        album="Test Album",
        kind="audio/mp3",
        last_scanned=datetime.datetime.now()
    )
    session.add(music_file)
    session.commit()
    return music_file

@pytest.fixture
def sample_music_file2(session):
    music_file = MusicFileDB(
        path="/test/path2.flac",
        title="Test Song2",
        artist="Test Artist2",
        album="Test Album2",
        kind="audio/flac",
        last_scanned=datetime.datetime.now()
    )
    session.add(music_file)
    session.commit()
    return music_file

def test_add_music_file_entry(playlist_repo, sample_playlist, sample_music_file):
    entry = MusicFileEntry(
        order=0,
        entry_type="music_file",
        music_file_id=sample_music_file.id,
        details=MusicFile.from_orm(sample_music_file)
    )
    
    result = playlist_repo.add_entry(sample_playlist.id, entry)
    
    assert len(result.entries) == 1
    assert result.entries[0].entry_type == "music_file"
    assert result.entries[0].music_file_id == sample_music_file.id

def test_add_multiple_entries(playlist_repo, sample_playlist, sample_music_file):
    entries = [
        MusicFileEntry(
            order=i,
            entry_type="music_file",
            music_file_id=sample_music_file.id,
            details=MusicFile.from_orm(sample_music_file)
        )
        for i in range(3)
    ]
    
    result = playlist_repo.add_entries(sample_playlist.id, entries)
    
    assert len(result.entries) == 3
    assert all(e.entry_type == "music_file" for e in result.entries)
    assert [e.order for e in result.entries] == [0, 1, 2]

def test_replace_entries(playlist_repo, sample_playlist, sample_music_file, sample_music_file2):
    # Add initial entries
    initial_entries = [
        MusicFileEntry(
            order=0,
            entry_type="music_file",
            music_file_id=sample_music_file.id,
            details=MusicFile.from_orm(sample_music_file)
        )
    ]
    playlist_repo.add_entries(sample_playlist.id, initial_entries)
    
    # Replace with new entries
    new_entries = [
        MusicFileEntry(
            order=0,
            entry_type="music_file",
            music_file_id=sample_music_file2.id,
            details=MusicFile.from_orm(sample_music_file2)
        )
    ]
    
    result = playlist_repo.replace_entries(sample_playlist.id, new_entries)
    
    assert len(result.entries) == 1
    assert result.entries[0].order == 0

def test_empty_entries_list(playlist_repo, sample_playlist):
    result = playlist_repo.add_entries(sample_playlist.id, [])
    assert len(result.entries) == 0

def test_replace_with_empty_list(playlist_repo, sample_playlist, sample_music_file):
    # Add initial entry
    initial_entry = MusicFileEntry(
        order=0,
        entry_type="music_file",
        music_file_id=sample_music_file.id,
        details=MusicFile.from_orm(sample_music_file)
    )
    playlist_repo.add_entry(sample_playlist.id, initial_entry)
    
    # Replace with empty list
    result = playlist_repo.replace_entries(sample_playlist.id, [])
    assert len(result.entries) == 0
