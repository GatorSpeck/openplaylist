import pytest
from fastapi.testclient import TestClient
from dependencies import get_music_file_repository
from response_models import MusicFile
from database import Base
from sqlalchemy import create_engine
from datetime import datetime

from repositories.remote_playlist_repository import RemotePlaylistRepository, PlaylistSnapshot

@pytest.fixture()
def engine():
    return create_engine('sqlite:///:memory:')

@pytest.fixture(autouse=True)
def setup_db(engine):
    """Reset database before each test"""
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)

@pytest.fixture
def test_tracks(test_db):
    """Create test tracks for each test that needs them"""
    repo = get_music_file_repository(test_db)
    tracks = []
    
    track1 = repo.add_music_file(
        MusicFile(
            path="test1.mp3",
            title="Test Song 1",
            artist="Test Artist",
            album="Test Album"
        )
    )
    tracks.append(track1)

    track2 = repo.add_music_file(
        MusicFile(
            path="test2.mp3",
            title="Test Song 2",
            artist="Test Artist",
            album="Test Album"
        )
    )
    tracks.append(track2)
    
    return tracks

def test_create_empty_playlist(client):
    response = client.post(
        "/api/playlists", 
        json={"name": "Test Playlist", "entries": []}
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Test Playlist"
    assert len(response.json()["entries"]) == 0

def test_create_playlist_with_entries(client, test_tracks):
    response = client.post(
        "/api/playlists",
        json={
            "name": "Test Playlist",
            "entries": [
                {"order": 0, "music_file_id": test_tracks[0].id, "entry_type": "music_file"},
                {"order": 1, "music_file_id": test_tracks[1].id, "entry_type": "music_file"}
            ],
        },
    )
    assert response.status_code == 200
    result = response.json()
    assert result["name"] == "Test Playlist"
    assert len(result["entries"]) == 2
    assert result["entries"][0]["details"]["path"] == "test1.mp3"
    assert result["entries"][1]["details"]["path"] == "test2.mp3"

def test_create_playlist_applies_global_sync_defaults(client, monkeypatch, tmp_path):
    monkeypatch.setenv("CONFIG_DIR", str(tmp_path))

    settings_response = client.post(
        "/api/settings",
        json={
            "playlistSyncDefaults": {
                "enabled": True,
                "services": {
                    "plex": True,
                    "spotify": True,
                    "youtube": False
                }
            }
        }
    )
    assert settings_response.status_code == 200

    create_response = client.post(
        "/api/playlists",
        json={"name": "Auto Sync Playlist", "entries": []}
    )
    assert create_response.status_code == 200
    playlist_id = create_response.json()["id"]
    assert create_response.json()["auto_sync_enabled"] is True

    auto_sync_response = client.get(f"/api/playlists/{playlist_id}/auto-sync")
    assert auto_sync_response.status_code == 200
    assert auto_sync_response.json()["auto_sync_enabled"] is True

    sync_targets_response = client.get(f"/api/playlists/{playlist_id}/syncconfig")
    assert sync_targets_response.status_code == 200
    sync_targets = sync_targets_response.json()

    assert len(sync_targets) == 2
    assert {target["service"] for target in sync_targets} == {"plex", "spotify"}
    assert all(target["config"]["playlist_name"] == "Auto Sync Playlist" for target in sync_targets)


def test_save_settings_persists_lastfm_username(client, monkeypatch, tmp_path):
    monkeypatch.setenv("CONFIG_DIR", str(tmp_path))

    response = client.post(
        "/api/settings",
        json={"lastFmUsername": "  test-user  "},
    )

    assert response.status_code == 200
    assert response.json()["lastFmUsername"] == "test-user"

    settings_response = client.get("/api/settings")
    assert settings_response.status_code == 200
    assert settings_response.json()["lastFmUsername"] == "test-user"


def test_playlist_sync_backfills_remote_playlist_id(client, monkeypatch):
    monkeypatch.setenv("CONFIG_DIR", "/tmp/playlist-test-config")

    settings_response = client.post(
        "/api/settings",
        json={
            "playlistSyncDefaults": {
                "enabled": True,
                "services": {
                    "plex": True,
                    "spotify": True,
                    "youtube": False,
                }
            }
        }
    )
    assert settings_response.status_code == 200

    class MockResolvingRemoteRepository(RemotePlaylistRepository):
        def __init__(self, session, config=None, music_file_repo=None):
            super().__init__(session, config or {})
            self.playlist_id = None

        def is_authenticated(self):
            return True

        def get_current_snapshot(self, playlist_name: str):
            return PlaylistSnapshot(
                name=playlist_name,
                last_updated=datetime.now().astimezone(),
                items=[],
            )

        def get_playlist_snapshot(self, playlist_name: str):
            self.playlist_id = "remote-playlist-123"
            return PlaylistSnapshot(
                name=playlist_name,
                last_updated=datetime.now().astimezone(),
                items=[],
            )

        def create_playlist(self, playlist_name: str, snapshot: PlaylistSnapshot):
            self.playlist_id = "remote-playlist-123"
            return {"id": self.playlist_id}

        def add_items(self, playlist_name: str, items):
            return None

        def remove_items(self, playlist_name: str, items):
            return None

        def fetch_media_item(self, item):
            return None

        def clear_playlist(self):
            return None

    def fake_create_remote_repository(service, session, config=None, music_file_repo=None):
        return MockResolvingRemoteRepository(session, config, music_file_repo=music_file_repo)

    monkeypatch.setattr("routes.playlists.create_remote_repository", fake_create_remote_repository)

    create_response = client.post(
        "/api/playlists",
        json={"name": "Sync ID Playlist", "entries": []},
    )
    assert create_response.status_code == 200
    playlist_id = create_response.json()["id"]

    sync_response = client.get(f"/api/playlists/{playlist_id}/sync")
    assert sync_response.status_code == 200

    sync_targets_response = client.get(f"/api/playlists/{playlist_id}/syncconfig")
    assert sync_targets_response.status_code == 200
    sync_targets = sync_targets_response.json()
    assert all(target["config"].get("playlist_id") == "remote-playlist-123" for target in sync_targets if target["service"] in {"plex", "spotify"})


def test_plex_sync_uses_rating_key_for_renamed_playlist(monkeypatch):
    from repositories.plex_repository import PlexRepository

    class FakePlaylist:
        def __init__(self, rating_key: int, title: str):
            self.ratingKey = rating_key
            self.title = title
            self.updatedAt = datetime.now().astimezone()

        def items(self):
            return []

        def removeItems(self, items):
            return None

        def addItems(self, items):
            return None

    class FakeServer:
        def __init__(self):
            self.fetch_item_calls = []
            self.playlist_calls = []
            self.playlists_calls = []
            self.playlist_obj = FakePlaylist(1234, "Renamed Plex Playlist")

        def library(self):
            raise AssertionError("library() should not be called in this test")

        def fetchItem(self, key):
            self.fetch_item_calls.append(key)
            if key == "/playlists/1234":
                return self.playlist_obj
            raise Exception("not found")

        def playlist(self, title):
            self.playlist_calls.append(title)
            raise AssertionError("name-based lookup should not be used when playlist_id is available")

        def playlists(self, **kwargs):
            self.playlists_calls.append(kwargs)
            return [self.playlist_obj]

        def account(self):
            return object()

        class library:
            @staticmethod
            def section(name):
                return object()

    fake_server = FakeServer()

    class FakePlexServerFactory:
        def __call__(self, endpoint, token=None):
            return fake_server

    monkeypatch.setattr("repositories.plex_repository.PlexServer", FakePlexServerFactory())

    repo = PlexRepository(
        session=object(),
        config={
            "endpoint": "http://plex.local:32400",
            "token": "token",
            "library": "Music",
            "playlist_id": "1234",
        },
    )

    snapshot = repo.get_playlist_snapshot("1234")

    assert snapshot is not None
    assert snapshot.name == "Renamed Plex Playlist"
    assert fake_server.fetch_item_calls == ["/playlists/1234"]
    assert fake_server.playlist_calls == []
    assert repo.playlist_id == "1234"


def test_plex_add_items_refuses_to_create_playlist_when_target_missing(monkeypatch):
    """Regression test: add_items() used to fall back to creating a brand-new Plex playlist
    (titled with whatever ref string it was given) whenever it couldn't find the target
    playlist. Combined with a bug elsewhere that could hand it the wrong ref, this silently
    spawned stray playlists seeded with whatever tracks were being pushed. It should now fail
    loudly instead of ever creating anything here - playlist creation is handled explicitly,
    earlier in the sync, by create_playlist().
    """
    import repositories.plex_repository as plex_repo_module
    from response_models import PlaylistItem

    class FakeServer:
        def fetchItem(self, key):
            raise Exception("not found")

        def playlist(self, title):
            raise Exception("not found")

        def playlists(self, **kwargs):
            return []

        def account(self):
            return object()

        class library:
            @staticmethod
            def section(name):
                return object()

    class ExplodingPlexPlaylist:
        @staticmethod
        def create(*args, **kwargs):
            raise AssertionError("PlexPlaylist.create should not be called from add_items()")

    monkeypatch.setattr("repositories.plex_repository.PlexServer", lambda endpoint, token=None: FakeServer())
    monkeypatch.setattr(plex_repo_module, "PlexPlaylist", ExplodingPlexPlaylist)

    repo = plex_repo_module.PlexRepository(
        session=object(),
        config={"endpoint": "http://plex.local:32400", "token": "token", "library": "Music"},
    )
    monkeypatch.setattr(repo, "fetch_media_items", lambda items: {id(item): object() for item in items})

    with pytest.raises(ValueError):
        repo.add_items("some-stale-ref-that-does-not-exist", [PlaylistItem(artist="Artist", title="Title")])


def test_get_playlists_empty(client):
    response = client.get("/api/playlists")
    assert response.status_code == 200
    assert len(response.json()) == 0

def test_get_playlists_with_data(client):
    # Create a playlist
    client.post("/api/playlists", json={"name": "Test Playlist", "entries": []})
    
    response = client.get("/api/playlists")
    assert response.status_code == 200
    playlists = response.json()
    assert len(playlists) == 1
    assert playlists[0]["name"] == "Test Playlist"

def test_add_music_file_to_playlist(client, test_tracks):
    # Create playlist
    playlist_response = client.post(
        "/api/playlists", 
        json={"name": "Test Playlist", "entries": []}
    )
    playlist_id = playlist_response.json()["id"]

    # Add track to playlist
    response = client.put(
        f"/api/playlists/{playlist_id}", 
        json={
            "name": "Test Playlist", 
            "entries": [
                {"order": 0, "music_file_id": test_tracks[0].id, "entry_type": "music_file"}
            ]
        }
    )

    assert response.status_code == 200

    response = client.get(f"/api/playlists/{playlist_id}")
    assert response.status_code == 200
    assert response.json()["entries"][0]["details"]["path"] == "test1.mp3"

def test_add_lastfm_to_playlist(client, test_tracks):
    # Create playlist
    playlist_response = client.post(
        "/api/playlists", 
        json={"name": "Test Playlist", "entries": []}
    )
    playlist_id = playlist_response.json()["id"]

    # Add LastFM track
    response = client.put(
        f"/api/playlists/{playlist_id}",
        json={
            "name": "Test Playlist",
            "entries": [
                {
                    "order": 0,
                    "url": "https://www.last.fm/music/Test/_/Song",
                    "details": {
                        "url": "https://www.last.fm/music/Test/_/Song",
                        "title": "Test Song",
                        "artist": "Test Artist"
                    }
                }
            ]
        }
    )

    assert response.status_code == 200

    response = client.get(f"/api/playlists/{playlist_id}")
    assert response.status_code == 200

    assert response.json()["entries"] is not None    
    assert response.json()["entries"][0]["details"]["title"] == "Test Song"

def test_reserved_playlist_entry_preserves_notes_on_add(client, test_tracks):
    playlist_response = client.post(
        "/api/playlists",
        json={"name": "Reserved Entry Playlist", "entries": []}
    )
    playlist_id = playlist_response.json()["id"]

    reserve_response = client.post(
        f"/api/playlists/{playlist_id}/reserve-entry",
        json={"entry_type": "music_file"}
    )
    assert reserve_response.status_code == 200
    reserved_id = reserve_response.json()["id"]

    update_response = client.put(
        f"/api/playlists/{playlist_id}/update-entry",
        json={
            "track_id": reserved_id,
            "updates": {
                "notes": "pending note"
            }
        }
    )
    assert update_response.status_code == 200

    add_response = client.post(
        f"/api/playlists/{playlist_id}/add",
        json=[
            {
                "id": reserved_id,
                "order": 0,
                "entry_type": "music_file",
                "music_file_id": test_tracks[0].id,
            }
        ]
    )
    assert add_response.status_code == 200

    playlist_details = client.get(f"/api/playlists/{playlist_id}")
    assert playlist_details.status_code == 200
    assert len(playlist_details.json()["entries"]) == 1
    assert playlist_details.json()["entries"][0]["id"] == reserved_id
    assert playlist_details.json()["entries"][0]["notes"] == "pending note"
    assert playlist_details.json()["entries"][0]["details"]["path"] == "test1.mp3"

def test_add_entry_with_foreign_explicit_id_ignores_id(client, test_tracks):
    source_playlist = client.post(
        "/api/playlists",
        json={"name": "Source Playlist", "entries": []}
    )
    source_playlist_id = source_playlist.json()["id"]

    target_playlist = client.post(
        "/api/playlists",
        json={"name": "Target Playlist", "entries": []}
    )
    target_playlist_id = target_playlist.json()["id"]

    reserve_response = client.post(
        f"/api/playlists/{source_playlist_id}/reserve-entry",
        json={"entry_type": "music_file"}
    )
    assert reserve_response.status_code == 200
    foreign_entry_id = reserve_response.json()["id"]

    add_response = client.post(
        f"/api/playlists/{target_playlist_id}/add",
        json=[
            {
                "id": foreign_entry_id,
                "order": 0,
                "entry_type": "music_file",
                "music_file_id": test_tracks[0].id,
            }
        ]
    )
    assert add_response.status_code == 200

    details_response = client.get(f"/api/playlists/{target_playlist_id}")
    assert details_response.status_code == 200

    target_entries = details_response.json()["entries"]
    assert len(target_entries) == 1
    assert target_entries[0]["id"] != foreign_entry_id

def test_delete_playlist(client):
    # Create playlist
    response = client.post(
        "/api/playlists", 
        json={"name": "Test Playlist", "entries": []}
    )
    playlist_id = response.json()["id"]

    # Delete playlist
    response = client.delete(f"/api/playlists/{playlist_id}")
    assert response.status_code == 200

    # Verify deletion
    response = client.get("/api/playlists")
    assert len(response.json()) == 0
