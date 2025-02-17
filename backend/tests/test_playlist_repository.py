import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from repositories.playlist import PlaylistRepository
from models import *
from response_models import *
import datetime

@pytest.fixture
def playlist_repo(test_db):
    return PlaylistRepository(test_db)

@pytest.fixture
def sample_playlist(test_db):
    playlist = PlaylistDB(name="Test Playlist")
    test_db.add(playlist)
    test_db.commit()
    return playlist

@pytest.fixture
def sample_music_file(test_db):
    return add_music_file(test_db, "Test Song")

@pytest.fixture
def sample_music_file2(test_db):
    return add_music_file(test_db, "Test Song2")

def add_music_file(test_db, title):
    music_file = MusicFileDB(
        path=f"/test/{title}.mp3",
        title=title,
        artist="Test Artist",
        album="Test Album",
        kind="audio/mp3",
        last_scanned=datetime.datetime.now()
    )
    test_db.add(music_file)
    test_db.commit()
    return music_file

def test_add_music_file_entry(playlist_repo, sample_playlist, sample_music_file):
    entry = MusicFileEntry(
        order=0,
        entry_type="music_file",
        music_file_id=sample_music_file.id,
        details=MusicFile.from_orm(sample_music_file)
    )
    
    playlist_repo.add_entry(sample_playlist.id, entry)
    result = playlist_repo.get_with_entries(sample_playlist.id)
    
    assert len(result.entries) == 1
    assert result.entries[0].entry_type == "music_file"
    assert result.entries[0].music_file_id == sample_music_file.id

    first_entry = playlist_repo.get_playlist_entry_details(sample_playlist.id, [0])[0]
    assert first_entry.details.title == "Test Song"

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
    
    playlist_repo.add_entries(sample_playlist.id, entries)
    result = playlist_repo.get_with_entries(sample_playlist.id)
    
    assert len(result.entries) == 3
    assert all(e.entry_type == "music_file" for e in result.entries)
    assert [e.order for e in result.entries] == [0, 1, 2]

    playlist_repo.undo_add_entries(sample_playlist.id, entries)

    result = playlist_repo.get_with_entries(sample_playlist.id)
    assert len(result.entries) == 0

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
    
    playlist_repo.replace_entries(sample_playlist.id, new_entries)
    result = playlist_repo.get_with_entries(sample_playlist.id)
    
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

def test_reorder(test_db, playlist_repo, sample_playlist, sample_music_file):
    initial_entries = []
    for i in range(10):
        f = add_music_file(test_db, f"Test Song {i}")
        entry = MusicFileEntry(
            entry_type="music_file",
            music_file_id=f.id,
            details=MusicFile.from_orm(f)
        )
        initial_entries.append(entry)

    playlist_repo.add_entries(sample_playlist.id, initial_entries)

    result = playlist_repo.get_with_entries(sample_playlist.id)
    assert len(result.entries) == 10
    assert [e.details.title for e in result.entries] == [e.details.title for e in initial_entries]
    
    # Reorder entries
    playlist_repo.reorder_entries(sample_playlist.id, [1, 3], 0)

    result = playlist_repo.get_with_entries(sample_playlist.id)
    assert [e.details.title for e in result.entries[0:5]] == ["Test Song 1", "Test Song 3", "Test Song 0", "Test Song 2", "Test Song 4"]

    playlist_repo.undo_reorder_entries(sample_playlist.id, [1, 3], 0)

    result = playlist_repo.get_with_entries(sample_playlist.id)
    assert [e.details.title for e in result.entries] == [e.details.title for e in initial_entries]

@pytest.mark.skip
def test_playlist_pagination(playlist_repo, test_db):
    # Create a playlist with multiple entries
    playlist = PlaylistDB(name="Test Playlist")
    test_db.add(playlist)
    test_db.commit()
    
    # Add 5 entries
    for i in range(5):
        f = add_music_file(test_db, f"Test Song {i}")
        entry = MusicFileEntryDB(
            playlist_id=playlist.id,
            order=i,
            entry_type="music_file",
            music_file_id=f.id,
            details=f
        )
        test_db.add(entry)
    test_db.commit()

    # Test without pagination
    result = playlist_repo.get_with_entries(playlist.id)
    assert len(result.entries) == 5
    
    # Test with pagination
    result = playlist_repo.get_with_entries(playlist.id, limit=2, offset=0)
    assert len(result.entries) == 2
    
    result = playlist_repo.get_with_entries(playlist.id, limit=2, offset=2)
    assert len(result.entries) == 2

def test_add_album_entry(test_db, playlist_repo, sample_playlist):
    tracks = [add_music_file(test_db, f"Test Song {i}") for i in range(5)]

    album = AlbumDB(
        title="Test Album",
        artist="Test Artist",
        art_url="/test/album_art.jpg",
    )
    test_db.add(album)
    test_db.commit()

    for i, t in enumerate(tracks):
        album_track = AlbumTrackDB(linked_track_id=t.id, order=i, album_id=album.id)
        album.tracks.append(album_track)
        test_db.add(album_track)

    test_db.commit()

    entry = AlbumEntry(
        order=0,
        entry_type="album",
        album_id=album.id,
        details=Album.from_orm(album)
    )
    
    playlist_repo.add_entry(sample_playlist.id, entry)
    result = playlist_repo.get_with_entries(sample_playlist.id)
    
    assert len(result.entries) == 1
    assert result.entries[0].entry_type == "album"
    assert result.entries[0].album_id == album.id

    first_entry = playlist_repo.get_playlist_entry_details(sample_playlist.id, [0])[0]
    assert first_entry.details.title == "Test Album"
    assert len(first_entry.details.tracks) == 5
    assert first_entry.details.tracks[0].linked_track.title == "Test Song 0"