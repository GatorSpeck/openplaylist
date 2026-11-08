import pytest
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from repositories.music_file import MusicFileRepository
from repositories.playlist_repository import PlaylistRepository
from models import Base, MusicFileDB, TrackGenreDB
from response_models import MusicFile, Playlist, MusicFileEntry

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


def _add_track(repo, path, title, artist, album="Album"):
    return repo.add_music_file(MusicFile(
        path=path, title=title, artist=artist, album=album, kind="audio/mp3",
        last_scanned=datetime.now(), genres=[],
    ))


@pytest.mark.parametrize("query, expected_title", [
    ("Queen Don't Stop Me Now", "Don’t Stop Me Now"),           # straight vs curly apostrophe
    ("Queen Don’t Stop Me Now", "Don’t Stop Me Now"),
    ("Oasis Dont Look Back", "Don't Look Back in Anger"),        # apostrophe omitted entirely
    ("Beatles Hey Jude (Remastered 2015)", "Hey Jude (Remastered 2015)"),
    ("Beatles Hey Jude (2015 Remaster)", "Hey Jude (Remastered 2015)"),  # extra tokens not in tags
    ("Pink Floyd - Wish You Were Here [Live]", "Wish You Were Here"),
])
def test_search_handles_punctuation_and_extra_tokens(repo, query, expected_title):
    _add_track(repo, "/x/1.mp3", "Don’t Stop Me Now", "Queen")
    _add_track(repo, "/x/2.mp3", "Don't Look Back in Anger", "Oasis")
    _add_track(repo, "/x/3.mp3", "Hey Jude (Remastered 2015)", "The Beatles")
    _add_track(repo, "/x/4.mp3", "Wish You Were Here", "Pink Floyd")

    results = repo.search(query=query)

    assert results
    assert results[0].title == expected_title


def test_search_prefers_all_token_matches_over_partial(repo):
    _add_track(repo, "/x/1.mp3", "Yellow", "Coldplay")
    _add_track(repo, "/x/2.mp3", "Yellow Submarine", "The Beatles")

    results = repo.search(query="Beatles Yellow")

    assert [r.title for r in results] == ["Yellow Submarine"]


def test_search_can_exclude_missing_files(repo, session):
    from models import LocalFileDB
    _add_track(repo, "/x/present.mp3", "Same Song", "Artist")
    _add_track(repo, "/x/gone.mp3", "Same Song", "Artist")
    session.query(LocalFileDB).filter(LocalFileDB.path == "/x/gone.mp3").update({"missing": True})
    session.commit()

    assert len(repo.search(query="Same Song")) == 2
    assert [r.path for r in repo.search(query="Same Song", include_missing=False)] == ["/x/present.mp3"]
