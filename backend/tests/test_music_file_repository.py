import pytest
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from repositories.music_file import MusicFileRepository
from repositories.playlist import PlaylistRepository
from models import Base, MusicFileDB, TrackGenreDB
from response_models import MusicFile, LastFMTrack, RequestedTrack, RequestedTrackEntry, Playlist, MusicFileEntry

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
def repo(session):
    return MusicFileRepository(session)

@pytest.fixture
def playlists(session):
    return PlaylistRepository(session)

@pytest.fixture
def sample_music_file():
    return MusicFile(
        path="/test/song.mp3",
        title="Test Song",
        artist="Test Artist",
        album="Test Album",
        album_artist="Test Artist",
        year="2024",
        length=180,
        publisher="Test Label",
        kind="audio/mp3",
        last_scanned=datetime.now(),
        genres=["Rock", "Alternative"]
    )

def test_add_music_file(repo, sample_music_file):
    result = repo.add_music_file(sample_music_file)
    assert result.path == sample_music_file.path
    assert result.title == sample_music_file.title
    assert result.artist == sample_music_file.artist
    assert result.album == sample_music_file.album
    assert result.album_artist == sample_music_file.album_artist
    assert result.year == sample_music_file.year
    assert result.length == sample_music_file.length
    assert result.publisher == sample_music_file.publisher
    assert result.kind == sample_music_file.kind
    assert result.last_scanned == sample_music_file.last_scanned
    assert result.genres == sample_music_file.genres

def test_search_and_filter(repo, sample_music_file):
    repo.add_music_file(sample_music_file)
    result = repo.search(query=sample_music_file.title)
    assert len(result) == 1
    assert result[0].path == sample_music_file.path
    assert result[0].title == sample_music_file.title
    assert result[0].artist == sample_music_file.artist
    assert result[0].album == sample_music_file.album
    assert result[0].album_artist == sample_music_file.album_artist
    assert result[0].year == sample_music_file.year
    assert result[0].length == sample_music_file.length
    assert result[0].publisher == sample_music_file.publisher
    assert result[0].kind == sample_music_file.kind
    assert result[0].last_scanned == sample_music_file.last_scanned
    assert result[0].genres == sample_music_file.genres

    result = repo.filter(title=sample_music_file.title)
    assert len(result) == 1
    assert result[0].path == sample_music_file.path
    assert result[0].title == sample_music_file.title
    assert result[0].artist == sample_music_file.artist
    assert result[0].album == sample_music_file.album
    assert result[0].album_artist == sample_music_file.album_artist
    assert result[0].year == sample_music_file.year
    assert result[0].length == sample_music_file.length
    assert result[0].publisher == sample_music_file.publisher
    assert result[0].kind == sample_music_file.kind
    assert result[0].last_scanned == sample_music_file.last_scanned
    assert result[0].genres == sample_music_file.genres
