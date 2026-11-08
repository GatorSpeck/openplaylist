"""Tracks that failed to match (or matched the wrong remote track) get fixed on later syncs once
they're corrected locally, and can be resynced manually. See repositories/sync_track_state_repository.py.

Uses a fake "catalog" remote: add_items resolves each local item to a catalog entry (by linked
plex_rating_key first, then by artist/title) the way the real services do, and records the match.
"""
import pytest

import routes.playlists as playlists_route
from models import MusicFileDB
from response_models import PlaylistItem
from tests.mock_remote_playlist_repository import MockRemotePlaylistRepository
from tests.test_remote_sync import add_local_track, add_sync_target, create_playlist, sync, isolate_config_dir  # noqa: F401 (autouse fixture)


def remote_track(key, artist, title):
    return PlaylistItem(artist=artist, title=title, plex_rating_key=str(key))


class CatalogRemoteRepo(MockRemotePlaylistRepository):
    def __init__(self, catalog, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.catalog = catalog  # list of remote PlaylistItems available on the "service"
        self.added = []
        self.removed = []

    def _resolve(self, item):
        if item.plex_rating_key:
            for track in self.catalog:
                if track.plex_rating_key == item.plex_rating_key:
                    return track
        for track in self.catalog:
            if track.title.lower() == item.title.lower():
                return track
        return None

    def add_items(self, playlist_name, items):
        self.add_items_called += 1
        playlist = self.remote_playlists.setdefault(playlist_name, [])
        for item in items:
            track = self._resolve(item)
            if track is None:
                self.record_match(item, matched=False)
                continue
            self.record_match(item, title=track.title, artist=track.artist, remote_id=track.plex_rating_key)
            playlist.append(track)
            self.added.append(track.plex_rating_key)

    def remove_items(self, playlist_name, items):
        self.remove_items_called += 1
        keys = {i.plex_rating_key for i in items}
        self.removed.extend(keys)
        self.remote_playlists[playlist_name] = [t for t in self.remote_playlists.get(playlist_name, []) if t.plex_rating_key not in keys]


@pytest.fixture
def remote(monkeypatch):
    state = {"catalog": [], "playlists": {"Plex List": []}, "updates": {}, "flags": {}, "repos": []}

    def factory(service, session, config=None, music_file_repo=None):
        repo = CatalogRemoteRepo(state["catalog"], session, config, music_file_repo=music_file_repo)
        repo.remote_playlists = state["playlists"]
        repo.remote_snapshot_updates = state["updates"]
        repo._flags = state["flags"]
        state["repos"].append(repo)
        return repo

    monkeypatch.setattr(playlists_route, "create_remote_repository", factory)
    return state


def remote_keys(remote):
    return [t.plex_rating_key for t in remote["playlists"]["Plex List"]]


def setup_playlist(client, test_db, title, artist="Johnny Cash", **target_overrides):
    track = add_local_track(test_db, f"/music/{title}.mp3", artist, title)
    playlist = create_playlist(client, "Mix", entries=[{"entry_type": "music_file", "music_file_id": track.id}])
    add_sync_target(client, playlist["id"], "plex", "Plex List", **target_overrides)
    return playlist, track


def update_track(test_db, track_id, **fields):
    row = test_db.query(MusicFileDB).filter(MusicFileDB.id == track_id).first()
    for name, value in fields.items():
        setattr(row, name, value)
    test_db.commit()


def last_repo(remote):
    return remote["repos"][-1]


def test_unmatched_track_is_retried_after_it_is_fixed_locally(client, test_db, remote):
    remote["catalog"].append(remote_track(200, "Johnny Cash", "Hurt"))
    playlist, track = setup_playlist(client, test_db, "Hurrt")  # typo: no match on the service

    assert sync(client, playlist["id"]).status_code == 200
    assert remote_keys(remote) == []
    events = client.get(f"/api/playlists/{playlist['id']}/sync-log").json()
    assert any(e["action"] == "failed_match" and e["target"] == "plex" for e in events)

    # Nothing changed: no pointless retry
    assert sync(client, playlist["id"]).status_code == 200
    assert last_repo(remote).add_items_called == 0

    # Fixing the title (which doesn't touch the playlist's own updated_at) triggers a retry
    update_track(test_db, track.id, title="Hurt")
    assert sync(client, playlist["id"]).status_code == 200
    assert remote_keys(remote) == ["200"]


def test_relinked_track_replaces_wrong_remote_match(client, test_db, remote):
    remote["catalog"].extend([remote_track(100, "Nine Inch Nails", "Hurt"), remote_track(200, "Johnny Cash", "Hurt")])
    playlist, track = setup_playlist(client, test_db, "Hurt")

    sync(client, playlist["id"])
    assert remote_keys(remote) == ["100"]  # wrong match (first catalog hit)

    update_track(test_db, track.id, plex_rating_key="200")  # user links the right Plex track
    assert sync(client, playlist["id"]).status_code == 200

    assert remote_keys(remote) == ["200"]
    assert last_repo(remote).removed == ["100"]

    # Stable afterwards
    sync(client, playlist["id"])
    assert remote_keys(remote) == ["200"]
    assert last_repo(remote).add_items_called == 0 and last_repo(remote).remove_items_called == 0


def test_relink_without_send_removals_does_not_duplicate(client, test_db, remote):
    remote["catalog"].extend([remote_track(100, "Nine Inch Nails", "Hurt"), remote_track(200, "Johnny Cash", "Hurt")])
    playlist, track = setup_playlist(client, test_db, "Hurt", sendEntryRemovals=False)
    sync(client, playlist["id"])

    update_track(test_db, track.id, plex_rating_key="200")
    sync(client, playlist["id"])

    assert remote_keys(remote) == ["100"]
    events = client.get(f"/api/playlists/{playlist['id']}/sync-log").json()
    assert any(e["action"] == "skip" and "send removals" in e["reason"] for e in events)


def test_track_removed_on_remote_is_not_re_added(client, test_db, remote):
    remote["catalog"].append(remote_track(200, "Johnny Cash", "Hurt"))
    playlist, _ = setup_playlist(client, test_db, "Hurt", receiveEntryRemovals=False)
    sync(client, playlist["id"])
    assert remote_keys(remote) == ["200"]

    # Removed directly on the remote; receive-removals is off so it stays local
    remote["playlists"]["Plex List"] = []
    import datetime
    remote["updates"]["Plex List"] = datetime.datetime.now().astimezone()

    sync(client, playlist["id"])
    sync(client, playlist["id"])

    assert remote_keys(remote) == []


def test_manual_resync_rematches_track(client, test_db, remote):
    remote["catalog"].append(remote_track(100, "Nine Inch Nails", "Hurt"))
    playlist, track = setup_playlist(client, test_db, "Hurt")
    sync(client, playlist["id"])
    assert remote_keys(remote) == ["100"]

    # The right version shows up on the service later; nothing changed locally
    remote["catalog"].insert(0, remote_track(200, "Johnny Cash", "Hurt"))

    response = client.post(f"/api/playlists/{playlist['id']}/sync/resync-track", json={"music_file_id": track.id})
    assert response.status_code == 200
    assert response.json()["targets"] == 1
    assert response.json()["job_id"]

    # TestClient runs the background sync job before returning
    assert remote_keys(remote) == ["200"]


def test_manual_resync_rejects_track_not_in_playlist(client, test_db, remote):
    playlist, _ = setup_playlist(client, test_db, "Hurt")
    other = add_local_track(test_db, "/music/other.mp3", "Someone", "Else")

    response = client.post(f"/api/playlists/{playlist['id']}/sync/resync-track", json={"music_file_id": other.id})

    assert response.status_code == 404
