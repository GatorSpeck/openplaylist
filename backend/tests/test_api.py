import pytest
from fastapi.testclient import TestClient
from dependencies import get_music_file_repository
from response_models import MusicFile

@pytest.fixture
def song_data(test_db):
    repo = get_music_file_repository(test_db)
    track1 = repo.add(MusicFile(
        id=1,
        path="test.mp3",
    ))

    track2 = repo.add(MusicFile(
        id=2,
        path="test2.mp3",
    ))

    yield

def test_create_playlist(client):
    response = client.post(
        "/api/playlists",
        json={"name": "Test Playlist", "entries": []}
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Test Playlist"

def test_create_playlist_with_entries(client, song_data):
    response = client.post(
        "/api/playlists",
        json={"name": "Test Playlist", "entries": [
            {"order": 0, "music_file_id": 1, "entry_type": "music_file"},
            {"order": 1, "music_file_id": 2, "entry_type": "music_file"},
            {"order": 2, "music_file_id": 1, "entry_type": "music_file"},
        ]}
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Test Playlist"
    assert response.json()["entries"][0]["details"]["path"] == "test.mp3"
    assert response.json()["entries"][1]["details"]["path"] == "test2.mp3"
    assert response.json()["entries"][2]["details"]["path"] == "test.mp3"

def test_get_playlists(client, song_data):
    # Create a playlist
    client.post("/api/playlists", json={"name": "Test Playlist"})
    
    # Get all playlists
    response = client.get("/api/playlists")
    assert response.status_code == 200
    playlists = response.json()
    assert len(playlists) == 1
    assert playlists[0]["name"] == "Test Playlist"

def test_add_song_to_playlist(client, test_db, song_data):
    # Create playlist
    playlist_response = client.post(
        "/api/playlists",
        json={"name": "Test Playlist", "entries": []}
    )
    playlist_id = playlist_response.json()["id"]

    entries = [{
        "order": 0,
        "music_file_id": 1,
        "entry_type": "music_file"
    }]
    
    # Add song to playlist
    response = client.put(
        f"/api/playlists/{playlist_id}",
        json={"name": "", "entries": entries}
    )

    assert response.status_code == 200
    assert response.json()["entries"][0]["details"]["path"] == "test.mp3"

    entries = [{
        "order": 0,
        "music_file_id": 1,
        "entry_type": "music_file"
    }, {
        "order": 1,
        "url": "https://www.last.fm/music/Cher/_/Believe",
        "entry_type": "lastfm",
        "details": {
            "url": "https://www.last.fm/music/Cher/_/Believe",
            "title": "Believe",
        }
    }, {
        "order": 2,
        "music_file_id": 1,
        "entry_type": "music_file"
    }]

    response = client.put(
        f"/api/playlists/{playlist_id}",
        json={"name": "", "entries": entries}
    )

    assert response.status_code == 200

    assert response.json()["entries"][0]["details"]["path"] == "test.mp3"
    assert response.json()["entries"][1]["details"]["title"] == "Believe"
    assert response.json()["entries"][2]["details"]["path"] == "test.mp3"

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