from datetime import datetime, timedelta

from models import LocalFileDB, MusicFileDB, PlaylistDB, PlaylistEntryDB, MusicFileEntryDB


def _create_music_file(test_db, title, artist, album):
    local_file = LocalFileDB(
        path=f"/test/{title}.mp3",
        kind="audio/mp3",
        last_scanned=datetime.now(),
        file_title=title,
        file_artist=artist,
        file_album=album,
    )

    music_file = MusicFileDB(
        title=title,
        artist=artist,
        album=album,
        local_file=local_file,
    )

    test_db.add(music_file)
    test_db.commit()
    return music_file


def test_landing_activity_returns_independent_recent_windows(client, test_db, monkeypatch):
    playlist = PlaylistDB(name="Landing Feed Playlist")
    test_db.add(playlist)
    test_db.commit()

    open_playlist_track = _create_music_file(test_db, "Open Song", "Open Artist", "Open Album")

    older_time = datetime.now() - timedelta(days=2)
    newer_time = datetime.now() - timedelta(hours=1)

    monkeypatch.setenv("LASTFM_API_KEY", "test-lastfm-key")
    monkeypatch.setenv("LASTFM_USERNAME", "test-user")

    class FakeLastFmRepo:
        def get_recent_tracks(self, username, limit=10, page=1):
            assert username == "test-user"
            return [
                {
                    "title": "LastFM Song",
                    "artist": "LastFM Artist",
                    "album": "LastFM Album",
                    "last_fm_url": "https://www.last.fm/music/Test/_/Song",
                    "date_added": older_time,
                }
            ]

    monkeypatch.setattr("main.last_fm_repository", lambda *args, **kwargs: FakeLastFmRepo())

    open_entry = MusicFileEntryDB(
        entry_type="music_file",
        playlist_id=playlist.id,
        order=1,
        date_added=newer_time,
        music_file_id=open_playlist_track.id,
        details=open_playlist_track,
    )

    test_db.add(open_entry)
    test_db.commit()

    response = client.get("/api/landing/activity?limit=1")

    assert response.status_code == 200
    data = response.json()

    assert len(data["lastfmEntries"]) == 1
    assert data["lastfmEntries"][0]["entry_type"] == "lastfm"
    assert data["lastfmEntries"][0]["playlist_name"] == "Last.fm: test-user"
    assert data["lastfmEntries"][0]["title"] == "LastFM Song"
    assert data["lastfmEntries"][0]["details"]["last_fm_url"] == "https://www.last.fm/music/Test/_/Song"

    assert len(data["openPlaylistEntries"]) == 1
    assert data["openPlaylistEntries"][0]["entry_type"] == "music_file"
    assert data["openPlaylistEntries"][0]["title"] == "Open Song"
    assert data["openPlaylistEntries"][0]["playlist_name"] == "Landing Feed Playlist"