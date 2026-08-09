"""Route-level tests for playlist remote sync (`GET /api/playlists/{id}/sync`).

These exercise the real orchestration in routes/playlists.py:sync_playlist. An older,
parallel implementation used to live directly on RemotePlaylistRepository as
sync_playlist()/apply_sync_plan(), but it was never called from that route or reachable from
any live code path, so it was deleted rather than kept in sync with this one.

Remote services are faked via MockRemotePlaylistRepository, injected by monkeypatching
routes.playlists.create_remote_repository. Snapshot persistence (get_current_snapshot /
write_snapshot) still goes through the real base class against the real test database, so
"did we correctly detect a change since last sync" is exercised for real, not mocked.
"""
import time

import pytest

import routes.playlists as playlists_route
from dependencies import get_music_file_repository
from response_models import MusicFile, PlaylistItem
from tests.mock_remote_playlist_repository import MockRemotePlaylistRepository


def install_mock_remote_repos(monkeypatch, seed=None):
    """Patch routes.playlists.create_remote_repository with a fake factory.

    Each service gets one persistent in-memory store, shared across the fresh repository
    instance constructed on every sync call (mirroring how the real route re-creates a
    repository per call while the underlying external service state persists). `seed`, if
    given, is called once per service the first time that service is requested, with the new
    repo instance, so a test can pre-populate "remote" content before the first sync.
    """
    remote_state = {}
    repos_by_service = {}
    seeded_services = set()

    def fake_create_remote_repository(service, session, config=None, music_file_repo=None):
        repo = MockRemotePlaylistRepository(session, config, music_file_repo=music_file_repo)
        state = remote_state.setdefault(service, {"playlists": {}, "updates": {}, "flags": {}})
        repo.remote_playlists = state["playlists"]
        repo.remote_snapshot_updates = state["updates"]
        repo._flags = state["flags"]
        repos_by_service[service] = repo
        if seed and service not in seeded_services:
            seeded_services.add(service)
            seed(service, repo)
        return repo

    monkeypatch.setattr(playlists_route, "create_remote_repository", fake_create_remote_repository)
    return repos_by_service


@pytest.fixture(autouse=True)
def isolate_config_dir(tmp_path, monkeypatch):
    # Playlist creation auto-applies any persisted "playlistSyncDefaults" settings by creating
    # extra sync targets. Without an isolated CONFIG_DIR, these tests would pick up whatever
    # global settings happen to be on disk (including real ones from actual app usage) and get
    # unpredictable extra sync targets.
    monkeypatch.setenv("CONFIG_DIR", str(tmp_path))


@pytest.fixture
def mock_remote_repos(monkeypatch):
    return install_mock_remote_repos(monkeypatch)


def add_local_track(test_db, path, artist, title, album="Album"):
    repo = get_music_file_repository(test_db)
    return repo.add_music_file(MusicFile(path=path, title=title, artist=artist, album=album))


def create_playlist(client, name, entries=None):
    response = client.post(
        "/api/playlists",
        json={"name": name, "entries": entries or []},
    )
    assert response.status_code == 200
    return response.json()


def add_sync_target(client, playlist_id, service, playlist_name, **overrides):
    payload = {
        "service": service,
        "config": {"playlist_name": playlist_name},
        "enabled": True,
        "sendEntryAdds": True,
        "sendEntryRemovals": True,
        "receiveEntryAdds": True,
        "receiveEntryRemovals": True,
    }
    payload.update(overrides)
    response = client.post(f"/api/playlists/{playlist_id}/syncconfig", json=payload)
    assert response.status_code == 200
    return response.json()


def sync(client, playlist_id, force_push=False):
    return client.get(f"/api/playlists/{playlist_id}/sync", params={"force_push": force_push})


def test_initial_sync_creates_and_seeds_remote_playlist(client, test_db, mock_remote_repos):
    track = add_local_track(test_db, "a.mp3", "Artist A", "Title A")
    playlist = create_playlist(
        client, "Local Playlist",
        entries=[{"order": 0, "music_file_id": track.id, "entry_type": "music_file"}],
    )
    add_sync_target(client, playlist["id"], "plex", "Plex List")

    response = sync(client, playlist["id"])
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "success"
    assert body["summary"] == {"total_targets": 1, "successful": 1, "failed": 0}

    plex_repo = mock_remote_repos["plex"]
    assert plex_repo.create_playlist_called == 1
    assert [item.title for item in plex_repo.remote_playlists["Plex List"]] == ["Title A"]

    log_response = client.get(f"/api/playlists/{playlist['id']}/sync-log")
    assert log_response.status_code == 200
    events = log_response.json()
    assert any(e["action"] == "create" and e["eventKind"] == "system" for e in events)


def test_new_remote_playlist_is_seeded_with_full_local_content_even_when_send_adds_disabled(client, test_db, mock_remote_repos):
    # Non-obvious current behavior worth locking in: creation always uses the full local
    # snapshot (routes/playlists.py's "remote playlist doesn't exist" branch), regardless of
    # sendEntryAdds. The flag only governs adds computed by the sync *plan*, which never runs
    # for a target that just got created (its remote already mirrors local at that point).
    track = add_local_track(test_db, "a.mp3", "Artist A", "Title A")
    playlist = create_playlist(
        client, "Local Playlist",
        entries=[{"order": 0, "music_file_id": track.id, "entry_type": "music_file"}],
    )
    add_sync_target(client, playlist["id"], "plex", "Plex List", sendEntryAdds=False)

    response = sync(client, playlist["id"])
    assert response.status_code == 200

    plex_repo = mock_remote_repos["plex"]
    assert [item.title for item in plex_repo.remote_playlists["Plex List"]] == ["Title A"]


def test_unmatched_remote_add_becomes_requested_local_track(client, test_db, monkeypatch):
    # Current behavior: add_music_file()'s "no local match" branch (playlist_repository.py's
    # create_entry_dependencies) creates a brand-new placeholder MusicFileDB row and backfills
    # its id onto the entry before add_music_file returns. Because of that, routes/playlists.py's
    # own "unmatched_entries" check (which looks for a still-missing music_file_id on the
    # returned entries) never finds anything, and the "failed_match" sync-log event it would emit
    # is currently unreachable - the local entry still ends up bound to a freshly-created,
    # not-actually-scanned MusicFileDB row rather than staying unmatched.
    def seed(service, repo):
        repo.set_remote_playlist("Plex List", [PlaylistItem(artist="Remote Artist", title="Remote Title")])

    repos_by_service = install_mock_remote_repos(monkeypatch, seed=seed)

    playlist = create_playlist(client, "Local Playlist")
    add_sync_target(client, playlist["id"], "plex", "Plex List")

    response = sync(client, playlist["id"])
    assert response.status_code == 200
    assert repos_by_service["plex"].create_playlist_called == 0  # remote already existed

    entries = client.get(f"/api/playlists/{playlist['id']}").json()["entries"]
    assert len(entries) == 1
    assert entries[0]["details"]["artist"] == "Remote Artist"
    assert entries[0]["music_file_id"] is not None

    events = client.get(f"/api/playlists/{playlist['id']}/sync-log").json()
    assert any(e["action"] == "add" and e["target"] == "local" for e in events)


def test_force_push_requires_both_send_flags(client, test_db, monkeypatch):
    def seed(service, repo):
        repo.set_remote_playlist("Plex List", [PlaylistItem(artist="X", title="Y")])

    repos_by_service = install_mock_remote_repos(monkeypatch, seed=seed)

    playlist = create_playlist(client, "Local Playlist")
    add_sync_target(client, playlist["id"], "plex", "Plex List", sendEntryRemovals=False)

    response = sync(client, playlist["id"], force_push=True)
    assert response.status_code == 500
    assert repos_by_service["plex"].clear_playlist_called == 0


def test_force_push_replaces_remote_content_with_local(client, test_db, monkeypatch):
    def seed(service, repo):
        repo.set_remote_playlist("Plex List", [PlaylistItem(artist="Stale Artist", title="Stale Title")])

    repos_by_service = install_mock_remote_repos(monkeypatch, seed=seed)

    track = add_local_track(test_db, "a.mp3", "Artist A", "Title A")
    playlist = create_playlist(
        client, "Local Playlist",
        entries=[{"order": 0, "music_file_id": track.id, "entry_type": "music_file"}],
    )
    add_sync_target(client, playlist["id"], "plex", "Plex List")

    response = sync(client, playlist["id"], force_push=True)
    assert response.status_code == 200

    plex_repo = repos_by_service["plex"]
    assert plex_repo.clear_playlist_called == 1
    assert [item.title for item in plex_repo.remote_playlists["Plex List"]] == ["Title A"]


def test_receive_removal_guardrail_blocks_bulk_local_deletes(client, test_db, mock_remote_repos):
    tracks = [add_local_track(test_db, f"t{i}.mp3", f"Artist {i}", f"Title {i}") for i in range(10)]
    playlist = create_playlist(
        client, "Local Playlist",
        entries=[{"order": i, "music_file_id": t.id, "entry_type": "music_file"} for i, t in enumerate(tracks)],
    )
    add_sync_target(client, playlist["id"], "plex", "Plex List")

    # First sync: creates remote seeded with all 10 tracks, stores baseline snapshot.
    assert sync(client, playlist["id"]).status_code == 200
    time.sleep(0.05)

    # Simulate the remote dropping 9 of 10 tracks behind our backs.
    plex_repo = mock_remote_repos["plex"]
    plex_repo.set_remote_playlist("Plex List", [PlaylistItem(artist="Artist 0", title="Title 0")])

    response = sync(client, playlist["id"])
    assert response.status_code == 200

    entries = client.get(f"/api/playlists/{playlist['id']}").json()["entries"]
    assert len(entries) == 10


def test_receive_removal_guardrail_can_be_overridden(client, test_db, mock_remote_repos):
    tracks = [add_local_track(test_db, f"t{i}.mp3", f"Artist {i}", f"Title {i}") for i in range(10)]
    playlist = create_playlist(
        client, "Local Playlist",
        entries=[{"order": i, "music_file_id": t.id, "entry_type": "music_file"} for i, t in enumerate(tracks)],
    )
    add_sync_target(
        client, playlist["id"], "plex", "Plex List",
        config={"playlist_name": "Plex List", "allow_bulk_receive_removals": True},
    )

    assert sync(client, playlist["id"]).status_code == 200
    time.sleep(0.05)

    plex_repo = mock_remote_repos["plex"]
    plex_repo.set_remote_playlist("Plex List", [PlaylistItem(artist="Artist 0", title="Title 0")])

    response = sync(client, playlist["id"])
    assert response.status_code == 200

    entries = client.get(f"/api/playlists/{playlist['id']}").json()["entries"]
    assert len(entries) == 1


def test_multi_target_sync_applies_changes_to_each_targets_own_remote_playlist(client, test_db, mock_remote_repos):
    """Regression test for a target_ref mixup across multiple sync targets.

    routes/playlists.py's batched-apply loop (the "Flush batched remote operations" section) used
    to read `target_ref` from a variable last assigned while walking per-change/per-target pairs
    earlier in the function, rather than from that target's own repo_info. With more than one
    sync target, every target except whichever was processed last in that earlier loop got its
    remote add/remove calls issued against the WRONG playlist reference (fixed).

    This test sets up two targets (plex, spotify) on the same playlist, removes a track locally
    after the initial sync, and asserts the removal reaches both remotes.
    """
    track_a = add_local_track(test_db, "a.mp3", "Artist A", "Title A")
    track_b = add_local_track(test_db, "b.mp3", "Artist B", "Title B")
    playlist = create_playlist(
        client, "Local Playlist",
        entries=[
            {"order": 0, "music_file_id": track_a.id, "entry_type": "music_file"},
            {"order": 1, "music_file_id": track_b.id, "entry_type": "music_file"},
        ],
    )
    add_sync_target(client, playlist["id"], "plex", "Plex List")
    add_sync_target(client, playlist["id"], "spotify", "Spotify List")

    # First sync creates and seeds both remotes with both tracks.
    first = sync(client, playlist["id"])
    assert first.status_code == 200
    assert {i.title for i in mock_remote_repos["plex"].remote_playlists["Plex List"]} == {"Title A", "Title B"}
    assert {i.title for i in mock_remote_repos["spotify"].remote_playlists["Spotify List"]} == {"Title A", "Title B"}

    time.sleep(0.05)

    # Remove Title B locally; this should propagate as a removal to both remotes on next sync.
    entries = client.get(f"/api/playlists/{playlist['id']}").json()["entries"]
    entry_b = next(e for e in entries if e["details"]["title"] == "Title B")
    remove_response = client.post(f"/api/playlists/{playlist['id']}/remove", json=[{"id": entry_b["id"]}])
    assert remove_response.status_code == 200

    time.sleep(0.05)

    second = sync(client, playlist["id"])
    assert second.status_code == 200

    plex_titles = {i.title for i in mock_remote_repos["plex"].remote_playlists["Plex List"]}
    spotify_titles = {i.title for i in mock_remote_repos["spotify"].remote_playlists["Spotify List"]}

    assert spotify_titles == {"Title A"}
    assert plex_titles == {"Title A"}


def test_remote_add_on_one_target_is_not_logged_against_sibling_targets(client, test_db, mock_remote_repos):
    """Regression test: a track added directly on one remote used to show up in the sync log as
    an "add" against every target that has receiveEntryAdds enabled, not just the one it was
    actually observed on, because SyncChange didn't track which target's remote snapshot a
    'remote' sourced change came from - only that it was 'remote'. Once merged into the unified
    plan, that single change got fanned out to every sibling target's apply step, which had no way
    to tell it apart from a genuine receive on that target (fixed via SyncChange.origin_target_ids).
    """
    track_a = add_local_track(test_db, "a.mp3", "Artist A", "Title A")
    playlist = create_playlist(
        client, "Local Playlist",
        entries=[{"order": 0, "music_file_id": track_a.id, "entry_type": "music_file"}],
    )
    add_sync_target(client, playlist["id"], "plex", "Plex List")
    add_sync_target(client, playlist["id"], "youtube", "YouTube List")

    assert sync(client, playlist["id"]).status_code == 200
    time.sleep(0.05)

    # Simulate the track being added directly on YouTube only, behind our backs.
    youtube_repo = mock_remote_repos["youtube"]
    youtube_repo.add_items("YouTube List", [PlaylistItem(artist="Bob Dylan", title="She Belongs to Me")])

    response = sync(client, playlist["id"])
    assert response.status_code == 200

    add_log_targets = {
        entry["target"] for entry in response.json()["log"]
        if entry["action"] == "add" and "She Belongs to Me" in entry["track"]
    }
    assert add_log_targets == {"local", "youtube"}

    # And it must not have actually been pushed to Plex either.
    plex_titles = {i.title for i in mock_remote_repos["plex"].remote_playlists["Plex List"]}
    assert "She Belongs to Me" not in plex_titles


def test_unreachable_target_is_skipped_instead_of_recreated(client, test_db, mock_remote_repos):
    """Regression test: get_playlist_snapshot() returning None used to mean either "confirmed no
    such remote playlist" or "couldn't check right now" - the sync route couldn't tell them apart
    and treated both as "remote playlist doesn't exist, create/reset it". For Plex specifically,
    since create_playlist() clears-then-reseeds an existing playlist it finds on a second look, a
    transient outage could resolve between the two lookups and wipe the real playlist. Remote
    repos now raise RemoteUnavailableError instead of returning None for that case, and the sync
    route must skip the target entirely rather than touching it.
    """
    track_a = add_local_track(test_db, "a.mp3", "Artist A", "Title A")
    playlist = create_playlist(
        client, "Local Playlist",
        entries=[{"order": 0, "music_file_id": track_a.id, "entry_type": "music_file"}],
    )
    add_sync_target(client, playlist["id"], "plex", "Plex List")
    add_sync_target(client, playlist["id"], "spotify", "Spotify List")

    # First sync succeeds normally and seeds both remotes.
    first = sync(client, playlist["id"])
    assert first.status_code == 200
    plex_repo = mock_remote_repos["plex"]
    assert plex_repo.create_playlist_called == 1
    assert [i.title for i in plex_repo.remote_playlists["Plex List"]] == ["Title A"]

    time.sleep(0.05)

    # Add a second local track, then simulate Plex being unreachable for this sync (Spotify stays
    # healthy, so the sync as a whole still succeeds - just partially, same as any other
    # per-target init failure).
    track_b = add_local_track(test_db, "b.mp3", "Artist B", "Title B")
    add_track_response = client.post(
        f"/api/playlists/{playlist['id']}/add",
        json=[{"order": 1, "music_file_id": track_b.id, "entry_type": "music_file"}],
    )
    assert add_track_response.status_code == 200

    plex_repo.unavailable = True
    response = sync(client, playlist["id"])
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "partial"

    # Must not have attempted to (re)create or otherwise touch the remote playlist.
    assert plex_repo.create_playlist_called == 1
    assert plex_repo.add_items_called == 0
    assert [i.title for i in plex_repo.remote_playlists["Plex List"]] == ["Title A"]

    # Spotify, unaffected, still got the new track normally.
    assert {i.title for i in mock_remote_repos["spotify"].remote_playlists["Spotify List"]} == {"Title A", "Title B"}

    assert body["summary"]["failed"] == 1
    assert any(
        entry["action"] == "skip" and entry["target"] == "plex"
        for entry in body["log"]
    )


def test_receive_adds_disabled_skips_remote_only_track_on_ongoing_sync(client, test_db, mock_remote_repos):
    track_a = add_local_track(test_db, "a.mp3", "Artist A", "Title A")
    playlist = create_playlist(
        client, "Local Playlist",
        entries=[{"order": 0, "music_file_id": track_a.id, "entry_type": "music_file"}],
    )
    add_sync_target(client, playlist["id"], "plex", "Plex List", receiveEntryAdds=False)

    assert sync(client, playlist["id"]).status_code == 200
    time.sleep(0.05)

    # Simulate the remote picking up a new track on its own, behind our backs.
    plex_repo = mock_remote_repos["plex"]
    plex_repo.add_items("Plex List", [PlaylistItem(artist="Artist B", title="Title B")])

    response = sync(client, playlist["id"])
    assert response.status_code == 200

    entries = client.get(f"/api/playlists/{playlist['id']}").json()["entries"]
    assert {e["details"]["title"] for e in entries} == {"Title A"}


def test_receive_removals_disabled_keeps_track_locally_when_remote_removes_it(client, test_db, mock_remote_repos):
    track_a = add_local_track(test_db, "a.mp3", "Artist A", "Title A")
    track_b = add_local_track(test_db, "b.mp3", "Artist B", "Title B")
    playlist = create_playlist(
        client, "Local Playlist",
        entries=[
            {"order": 0, "music_file_id": track_a.id, "entry_type": "music_file"},
            {"order": 1, "music_file_id": track_b.id, "entry_type": "music_file"},
        ],
    )
    add_sync_target(client, playlist["id"], "plex", "Plex List", receiveEntryRemovals=False)

    assert sync(client, playlist["id"]).status_code == 200
    time.sleep(0.05)

    # Simulate the remote dropping a track on its own, below any guardrail threshold.
    plex_repo = mock_remote_repos["plex"]
    plex_repo.remove_items("Plex List", [PlaylistItem(artist="Artist B", title="Title B")])

    response = sync(client, playlist["id"])
    assert response.status_code == 200

    entries = client.get(f"/api/playlists/{playlist['id']}").json()["entries"]
    assert {e["details"]["title"] for e in entries} == {"Title A", "Title B"}


def test_send_adds_disabled_keeps_new_local_track_off_remote_on_ongoing_sync(client, test_db, mock_remote_repos):
    track_a = add_local_track(test_db, "a.mp3", "Artist A", "Title A")
    track_b = add_local_track(test_db, "b.mp3", "Artist B", "Title B")
    playlist = create_playlist(
        client, "Local Playlist",
        entries=[{"order": 0, "music_file_id": track_a.id, "entry_type": "music_file"}],
    )
    add_sync_target(client, playlist["id"], "plex", "Plex List", sendEntryAdds=False)

    assert sync(client, playlist["id"]).status_code == 200
    time.sleep(0.05)

    add_response = client.post(
        f"/api/playlists/{playlist['id']}/add",
        json=[{"order": 1, "music_file_id": track_b.id, "entry_type": "music_file"}],
    )
    assert add_response.status_code == 200
    time.sleep(0.05)

    response = sync(client, playlist["id"])
    assert response.status_code == 200

    plex_repo = mock_remote_repos["plex"]
    assert {i.title for i in plex_repo.remote_playlists["Plex List"]} == {"Title A"}


def test_send_removals_disabled_keeps_stale_track_on_remote_when_removed_locally(client, test_db, mock_remote_repos):
    track_a = add_local_track(test_db, "a.mp3", "Artist A", "Title A")
    track_b = add_local_track(test_db, "b.mp3", "Artist B", "Title B")
    playlist = create_playlist(
        client, "Local Playlist",
        entries=[
            {"order": 0, "music_file_id": track_a.id, "entry_type": "music_file"},
            {"order": 1, "music_file_id": track_b.id, "entry_type": "music_file"},
        ],
    )
    add_sync_target(client, playlist["id"], "plex", "Plex List", sendEntryRemovals=False)

    assert sync(client, playlist["id"]).status_code == 200
    time.sleep(0.05)

    entries = client.get(f"/api/playlists/{playlist['id']}").json()["entries"]
    entry_b = next(e for e in entries if e["details"]["title"] == "Title B")
    remove_response = client.post(f"/api/playlists/{playlist['id']}/remove", json=[{"id": entry_b["id"]}])
    assert remove_response.status_code == 200
    time.sleep(0.05)

    response = sync(client, playlist["id"])
    assert response.status_code == 200

    plex_repo = mock_remote_repos["plex"]
    assert {i.title for i in plex_repo.remote_playlists["Plex List"]} == {"Title A", "Title B"}

    local_entries = client.get(f"/api/playlists/{playlist['id']}").json()["entries"]
    assert {e["details"]["title"] for e in local_entries} == {"Title A"}


def test_target_init_failure_does_not_block_other_targets(client, test_db, monkeypatch):
    def seed(service, repo):
        if service == "spotify":
            def boom():
                raise Exception("Spotify auth failed")
            repo.is_authenticated = boom

    repos_by_service = install_mock_remote_repos(monkeypatch, seed=seed)

    track = add_local_track(test_db, "a.mp3", "Artist A", "Title A")
    playlist = create_playlist(
        client, "Local Playlist",
        entries=[{"order": 0, "music_file_id": track.id, "entry_type": "music_file"}],
    )
    add_sync_target(client, playlist["id"], "plex", "Plex List")
    add_sync_target(client, playlist["id"], "spotify", "Spotify List")

    response = sync(client, playlist["id"])
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "partial"
    assert body["summary"] == {"total_targets": 2, "successful": 1, "failed": 1}
    assert [f["service"] for f in body["failed"]] == ["spotify"]

    assert [item.title for item in repos_by_service["plex"].remote_playlists["Plex List"]] == ["Title A"]


def test_disabled_sync_target_is_skipped(client, test_db, mock_remote_repos):
    track = add_local_track(test_db, "a.mp3", "Artist A", "Title A")
    playlist = create_playlist(
        client, "Local Playlist",
        entries=[{"order": 0, "music_file_id": track.id, "entry_type": "music_file"}],
    )
    add_sync_target(client, playlist["id"], "plex", "Plex List")
    add_sync_target(client, playlist["id"], "spotify", "Spotify List", enabled=False)

    response = sync(client, playlist["id"])
    assert response.status_code == 200
    body = response.json()
    assert body["summary"] == {"total_targets": 1, "successful": 1, "failed": 0}

    # The disabled target is filtered out before any remote repository is even constructed.
    assert "spotify" not in mock_remote_repos
    assert [item.title for item in mock_remote_repos["plex"].remote_playlists["Plex List"]] == ["Title A"]


def test_sync_without_any_targets_returns_404(client, test_db, mock_remote_repos):
    playlist = create_playlist(client, "Local Playlist")
    response = sync(client, playlist["id"])
    assert response.status_code == 404


def test_sync_with_only_disabled_targets_returns_404(client, test_db, mock_remote_repos):
    playlist = create_playlist(client, "Local Playlist")
    add_sync_target(client, playlist["id"], "plex", "Plex List", enabled=False)
    response = sync(client, playlist["id"])
    assert response.status_code == 404
