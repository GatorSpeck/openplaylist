import pytest
from fastapi.testclient import TestClient

def test_create_playlist(client):
    response = client.post(
        "/api/playlists",
        json={"name": "Test Playlist"}
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Test Playlist"

def test_get_playlists(client):
    # Create a playlist
    client.post("/api/playlists", json={"name": "Test Playlist"})
    
    # Get all playlists
    response = client.get("/api/playlists")
    assert response.status_code == 200
    playlists = response.json()
    assert len(playlists) == 1
    assert playlists[0]["name"] == "Test Playlist"

def test_add_song_to_playlist(client, test_db):
    # Create playlist
    playlist_response = client.post(
        "/api/playlists",
        json={"name": "Test Playlist"}
    )
    playlist_id = playlist_response.json()["id"]

    playlist_response.json()["songs"] = [{
        "order": 0,
        "music_file_id": 4
    }]
    
    # Add song to playlist
    response = client.put(
        f"/api/playlists/{playlist_id}",
        json=playlist_response.json()
    )
    assert response.status_code == 200

def test_delete_playlist(client):
    # Create playlist
    response = client.post(
        "/api/playlists",
        json={"name": "Test Playlist"}
    )
    playlist_id = response.json()["id"]
    
    # Delete playlist
    response = client.delete(f"/api/playlists/{playlist_id}")
    assert response.status_code == 200
    
    # Verify deletion
    response = client.get("/api/playlists")
    assert len(response.json()) == 0