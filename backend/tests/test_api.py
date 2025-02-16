import pytest
from fastapi.testclient import TestClient
from dependencies import get_music_file_repository
from response_models import MusicFile
from database import Base
from sqlalchemy import create_engine

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
                    "entry_type": "lastfm",
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
    assert response.json()["entries"][0]["details"]["title"] == "Test Song"

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
