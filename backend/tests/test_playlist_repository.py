import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from repositories.playlist import PlaylistRepository, PlaylistFilter, PlaylistSortCriteria, PlaylistSortDirection
from models import *
from response_models import *
import datetime
from sqlalchemy.orm import joinedload, aliased, contains_eager, selectin_polymorphic, selectinload, with_polymorphic

# include line number with logging
import logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.StreamHandler()
    ]
)

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
    from models import LocalFileDB
    
    # Create LocalFileDB first
    local_file = LocalFileDB(
        path=f"/test/{title}.mp3",
        kind="audio/mp3",
        last_scanned=datetime.datetime.now(),
        file_title=title,
        file_artist="Test Artist",
        file_album="Test Album",
    )
    
    # Create MusicFileDB and associate it
    music_file = MusicFileDB(
        title=title,
        artist="Test Artist",
        album="Test Album",
        local_file=local_file
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
    
    playlist_repo.add_entries(sample_playlist.id, [entry])
    result = playlist_repo.get_with_entries(sample_playlist.id)
    
    assert len(result.entries) == 1
    assert result.entries[0].entry_type == "music_file"
    assert result.entries[0].music_file_id == sample_music_file.id

    first_entry = playlist_repo.get_playlist_entry_details(sample_playlist.id, [0])[0]
    assert first_entry.details.title == "Test Song"

    result = playlist_repo.get_without_details(sample_playlist.id)

    assert len(result.entries) == 1
    assert result.entries[0].entry_type == "music_file"
    assert result.entries[0].music_file_id == sample_music_file.id
    assert result.entries[0].details is None

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
    assert [e.details.title for e in result.entries] == ["Test Song"] * 3

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
    assert result.entries[0].details.title == "Test Song2"

def test_empty_entries_list(playlist_repo, sample_playlist):
    result = playlist_repo.add_entries(sample_playlist.id, [])
    assert len(result.entries) == 0

    result = playlist_repo.get_with_entries(sample_playlist.id)
    assert len(result.entries) == 0

    result = playlist_repo.get_with_entries(sample_playlist.id, limit=1, offset=0)
    assert len(result.entries) == 0

def test_replace_with_empty_list(playlist_repo, sample_playlist, sample_music_file):
    # Add initial entry
    initial_entry = MusicFileEntry(
        order=0,
        entry_type="music_file",
        music_file_id=sample_music_file.id,
        details=MusicFile.from_orm(sample_music_file)
    )
    playlist_repo.add_entries(sample_playlist.id, [initial_entry])
    
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
    
    requested_album_entry = RequestedAlbumEntry(
        entry_type="requested_album",
        details=Album(
            id=1,
            title="Test Album",
            artist="Test Artist",
        )
    )

    initial_entries.append(requested_album_entry)

    playlist_repo.add_entries(sample_playlist.id, initial_entries)

    result = playlist_repo.get_with_entries(sample_playlist.id)
    assert len(result.entries) == 11
    assert [e.details.title for e in result.entries] == [e.details.title for e in initial_entries]
    
    # Reorder entries
    logging.info("reorder 1")
    playlist_repo.reorder_entries(sample_playlist.id, [1, 3], 0)

    result = playlist_repo.get_with_entries(sample_playlist.id)
    logging.info(list([e.details.title for e in result.entries]))
    assert [e.details.title for e in result.entries[0:5]] == ["Test Song 1", "Test Song 3", "Test Song 0", "Test Song 2", "Test Song 4"]

    logging.info("undo")

    # undo
    playlist_repo.undo_reorder_entries(sample_playlist.id, [1, 3], 0)

    result = playlist_repo.get_with_entries(sample_playlist.id)
    logging.info(list([e.details.title for e in result.entries]))
    assert [e.details.title for e in result.entries] == [e.details.title for e in initial_entries]

    logging.info("reorder 2")

    playlist_repo.reorder_entries(sample_playlist.id, [4], 3)

    result = playlist_repo.get_with_entries(sample_playlist.id)
    logging.info(list([e.details.title for e in result.entries]))
    assert [e.details.title for e in result.entries[0:5]] == ["Test Song 0", "Test Song 1", "Test Song 2", "Test Song 4", "Test Song 3"]

    playlist_repo.reorder_entries(sample_playlist.id, [10], 3)
    result = playlist_repo.get_with_entries(sample_playlist.id)
    
    assert result.entries[3].entry_type == "requested_album"
    assert result.entries[3].details.title == "Test Album"
    assert result.entries[3].details.artist == "Test Artist"

def test_sparse_ordering(test_db, playlist_repo, sample_playlist, sample_music_file):
    initial_entries = []
    for i in range(3):
        f = add_music_file(test_db, f"Test Song {i}")
        entry = MusicFileEntry(
            entry_type="music_file",
            music_file_id=f.id,
            details=MusicFile.from_orm(f)
        )
        initial_entries.append(entry)
    
    playlist_repo.add_entries(sample_playlist.id, initial_entries)

    logging.info("1")

    playlist_repo.reorder_entries(sample_playlist.id, [2], 1)
    entries = playlist_repo.get_with_entries(sample_playlist.id).entries
    assert [e.details.title for e in entries] == ["Test Song 0", "Test Song 2", "Test Song 1"]

    logging.info("2")

    playlist_repo.reorder_entries(sample_playlist.id, [2], 1)
    entries = playlist_repo.get_with_entries(sample_playlist.id).entries
    assert [e.details.title for e in entries] == ["Test Song 0", "Test Song 1", "Test Song 2"]

    logging.info("3")

    playlist_repo.reorder_entries(sample_playlist.id, [2], 1)
    entries = playlist_repo.get_with_entries(sample_playlist.id).entries
    assert [e.details.title for e in entries] == ["Test Song 0", "Test Song 2", "Test Song 1"]

    logging.info("4")

    playlist_repo.reorder_entries(sample_playlist.id, [2], 1)
    entries = playlist_repo.get_with_entries(sample_playlist.id).entries
    assert [e.details.title for e in entries] == ["Test Song 0", "Test Song 1", "Test Song 2"]

    logging.info("5")

    playlist_repo.reorder_entries(sample_playlist.id, [2], 1)
    entries = playlist_repo.get_with_entries(sample_playlist.id).entries
    assert [e.details.title for e in entries] == ["Test Song 0", "Test Song 2", "Test Song 1"]

    logging.info("6")

    playlist_repo.reorder_entries(sample_playlist.id, [2], 1)
    entries = playlist_repo.get_with_entries(sample_playlist.id).entries
    assert [e.details.title for e in entries] == ["Test Song 0", "Test Song 1", "Test Song 2"]

    logging.info("7")

    playlist_repo.reorder_entries(sample_playlist.id, [2], 1)  # rebalancing would happen here
    entries = playlist_repo.get_with_entries(sample_playlist.id).entries
    assert [e.details.title for e in entries] == ["Test Song 0", "Test Song 2", "Test Song 1"]

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
    tracks = [{"title": f"Test Song {i}", "artist": "Artist"} for i in range(5)]

    album = Album(
        id=123,
        title="Test Album",
        artist="Test Artist",
        art_url="/test/album_art.jpg",
        tracks = [{"album_id": 123, "order": i, "linked_track": track} for i, track in enumerate(tracks)]
    )

    entry = RequestedAlbumEntry(
        order=0,
        entry_type="requested_album",
        details=album
    )
    
    playlist_repo.add_entries(sample_playlist.id, [entry])
    result = playlist_repo.get_with_entries(sample_playlist.id)
    
    assert len(result.entries) == 1
    assert result.entries[0].entry_type == "requested_album"
    assert result.entries[0].details is not None
    assert result.entries[0].details.title == "Test Album"
    assert result.entries[0].details.tracks[0].linked_track.title == "Test Song 0"

    first_entry = playlist_repo.get_playlist_entry_details(sample_playlist.id, [0])[0]
    assert first_entry.details.title == "Test Album"
    assert len(first_entry.details.tracks) == 5
    print(first_entry.details.tracks[0].__dict__)

    assert first_entry.details.tracks[0].linked_track.title == "Test Song 0"

def test_filter_playlist(test_db, playlist_repo, sample_playlist):
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

    filter = PlaylistFilter(
        filter="Song 5"
    )
    results = playlist_repo.filter_playlist(sample_playlist.id, filter).entries

    assert len(results) == 1
    assert results[0].details.title == "Test Song 5"

    filter = PlaylistFilter(
        filter="Song",
        offset=0,
        limit=5,
    )
    results = playlist_repo.filter_playlist(sample_playlist.id, filter).entries

    for i, entry in enumerate(results):
        print(entry.order)
        print(entry.details.title)

    assert len(results) == 5
    assert results[0].details.title == "Test Song 0"
    assert results[4].details.title == "Test Song 4"

    filter.offset = 5
    results = playlist_repo.filter_playlist(sample_playlist.id, filter).entries

    for i, entry in enumerate(results):
        print(entry.order)
        print(entry.details.title)

    assert len(results) == 5
    assert results[0].details.title == "Test Song 5"
    assert results[4].details.title == "Test Song 9"

    # now reverse it, keeping the same pagination settings
    filter.sortDirection = PlaylistSortDirection.DESC

    results = playlist_repo.filter_playlist(sample_playlist.id, filter).entries
    
    assert len(results) == 5
    assert results[0].details.title == "Test Song 4"
    assert results[4].details.title == "Test Song 0"

def test_remove_from_playlist(test_db, playlist_repo, sample_playlist):
    initial_entries = []
    for i in range(10):
        f = add_music_file(test_db, f"Test Song {i}")
        entry = MusicFileEntry(
            order=i, 
            entry_type="music_file",
            music_file_id=f.id,
            details=MusicFile.from_orm(f)
        )
        initial_entries.append(entry)

    playlist_repo.add_entries(sample_playlist.id, initial_entries)

    entry_to_remove = playlist_repo.filter_playlist(sample_playlist.id, PlaylistFilter(filter="Song 5")).entries[0]
    playlist_repo.remove_entries(sample_playlist.id, [entry_to_remove])

    result = playlist_repo.filter_playlist(sample_playlist.id, PlaylistFilter(filter="Song 5")).entries
    assert len(result) == 0

    result = playlist_repo.filter_playlist(sample_playlist.id, PlaylistFilter()).entries
    assert len(result) == 9
    assert "Test Song 5" not in [e.details.title for e in result]

def test_match_album_entry(test_db, playlist_repo, sample_playlist):
    # Create a simple requested album entry (like a user manually entered album)
    initial_album = Album(
        id=1,
        title="Initial Album",
        artist="Initial Artist",
        tracks=[AlbumTrack(album_id=1, order=0, linked_track={"title": "Initial Track", "artist": "Initial Artist"})]
    )

    initial_entry = RequestedAlbumEntry(
        order=0,
        entry_type="requested_album",
        details=initial_album
    )
    
    # Add the initial album entry to the playlist
    playlist_repo.add_entries(sample_playlist.id, [initial_entry])
    result = playlist_repo.get_with_entries(sample_playlist.id)
    
    # Verify initial state
    assert len(result.entries) == 1
    assert result.entries[0].entry_type == "requested_album"
    assert result.entries[0].details.title == "Initial Album"
    
    # Create a "matched" album from Last.fm with more complete metadata
    matched_album = Album(
        id=123,
        title="Matched Album Title",
        artist="Matched Artist",
        art_url="https://lastfm.com/album_art.jpg",
        last_fm_url="https://lastfm.com/album/123",
        tracks=[
            AlbumTrack(album_id=123, order=0, linked_track={"title": "Track 1", "artist": "Matched Artist"}),
            AlbumTrack(album_id=123, order=1, linked_track={"title": "Track 2", "artist": "Matched Artist"})
        ]
    )
    
    matched_entry = RequestedAlbumEntry(
        entry_type="requested_album",
        details=matched_album
    )
    
    # Get the ID of the entry we want to replace
    entry_to_replace = result.entries[0]
    
    # Replace the initial album with the matched one
    replaced_entry = playlist_repo.replace_track(sample_playlist.id, entry_to_replace.id, matched_entry)
    
    # Get the playlist with the updated entry
    updated_result = playlist_repo.get_with_entries(sample_playlist.id)
    
    # Verify replacement was successful
    assert len(updated_result.entries) == 1
    assert updated_result.entries[0].entry_type == "requested_album"
    assert updated_result.entries[0].details.title == "Matched Album Title"
    assert updated_result.entries[0].details.artist == "Matched Artist"
    assert updated_result.entries[0].details.art_url == "https://lastfm.com/album_art.jpg"
    assert len(updated_result.entries[0].details.tracks) == 2
    assert updated_result.entries[0].details.tracks[0].linked_track.title == "Track 1"
    assert updated_result.entries[0].details.tracks[1].linked_track.title == "Track 2"

def test_check_for_duplicates(test_db, playlist_repo, sample_playlist):
    # Create initial entries
    initial_entries = []
    for i in range(3):
        f = add_music_file(test_db, f"Test Song {i}")
        entry = MusicFileEntry(
            entry_type="music_file",
            music_file_id=f.id,
            details=MusicFile.from_orm(f)
        )
        initial_entries.append(entry)
    
    # Add initial entries to the playlist
    playlist_repo.add_entries(sample_playlist.id, initial_entries)
    
    # Try adding same songs (duplicates)
    duplicate_entries = []
    for i in range(2):  # Only check first 2 songs as duplicates
        f = test_db.query(MusicFileDB).filter(MusicFileDB.title == f"Test Song {i}").first()
        entry = MusicFileEntry(
            entry_type="music_file",
            music_file_id=f.id,
            details=MusicFile.from_orm(f)
        )
        duplicate_entries.append(entry)
    
    # Add a new non-duplicate song
    new_song = add_music_file(test_db, "New Test Song")
    new_entry = MusicFileEntry(
        entry_type="music_file",
        music_file_id=new_song.id,
        details=MusicFile.from_orm(new_song)
    )
    duplicate_entries.append(new_entry)
    
    # Check for duplicates
    duplicates = playlist_repo.check_for_duplicates(sample_playlist.id, duplicate_entries)
    
    # Should find 2 duplicates (the first two songs)
    assert len(duplicates) == 2
    assert duplicates[0].details.title == "Test Song 0"
    assert duplicates[1].details.title == "Test Song 1"
    
    # Test with a requested album
    album = Album(
        id=123,
        title="Test Album",
        artist="Test Artist",
        tracks=[
            AlbumTrack(album_id=123, order=0, linked_track={"title": "Album Track 1", "artist": "Test Artist"}),
            AlbumTrack(album_id=123, order=1, linked_track={"title": "Album Track 2", "artist": "Test Artist"})
        ]
    )
    
    album_entry = RequestedAlbumEntry(
        entry_type="requested_album",
        details=album
    )
    
    # Add album to playlist
    playlist_repo.add_entries(sample_playlist.id, [album_entry])
    
    # Create duplicate album with same title/artist
    dupe_album = Album(
        id=456,
        title="Test Album",  # Same title
        artist="Test Artist",  # Same artist
        tracks=[
            AlbumTrack(album_id=456, order=0, linked_track={"title": "Different Track", "artist": "Test Artist"})
        ]
    )
    
    dupe_album_entry = RequestedAlbumEntry(
        entry_type="requested_album",
        details=dupe_album
    )
    
    # Check if duplicate album is detected
    album_duplicates = playlist_repo.check_for_duplicates(sample_playlist.id, [dupe_album_entry])
    assert len(album_duplicates) == 1
    assert album_duplicates[0].details.title == "Test Album"
    
    # Test with a different album (should not be duplicate)
    unique_album = Album(
        id=789,
        title="Unique Album",
        artist="Different Artist",
        tracks=[
            AlbumTrack(album_id=789, order=0, linked_track={"title": "Unique Track", "artist": "Different Artist"})
        ]
    )
    
    unique_album_entry = RequestedAlbumEntry(
        entry_type="requested_album",
        details=unique_album
    )
    
    # Check if non-duplicate album is correctly not detected
    no_duplicates = playlist_repo.check_for_duplicates(sample_playlist.id, [unique_album_entry])
    assert len(no_duplicates) == 0
