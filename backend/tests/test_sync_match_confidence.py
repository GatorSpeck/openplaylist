"""Sync log entries carry the match confidence a remote repository records when it resolves
each pushed track (see RemotePlaylistRepository.record_match / lib.match)."""
from repositories.remote_playlist_repository import SyncChange
from response_models import PlaylistItem, SyncTarget
from routes.playlists import _flush_remote_operations, _local_match_confidence
from tests.mock_remote_playlist_repository import MockRemotePlaylistRepository


class ResolvingRemoteRepo(MockRemotePlaylistRepository):
    """Resolves each item to a canned remote track (or nothing), the way real services do."""

    def __init__(self, resolutions):
        super().__init__()
        self.resolutions = resolutions

    def add_items(self, playlist_name, items):
        for item in items:
            resolved = self.resolutions.get(item.title)
            if resolved is None:
                self.record_match(item, matched=False)
            else:
                self.record_match(item, title=resolved[1], artist=resolved[0], album=resolved[2])
        super().add_items(playlist_name, items)


def _flush(repo, items):
    target = SyncTarget(id=1, service="plex")
    plans = {1: {"repo_info": {"repo": repo, "target": target, "target_name": "Mix", "target_ref": "Mix"}}}
    ops = {1: {"add": [SyncChange(action="add", item=i, source="local", reason="New local track") for i in items], "remove": []}}
    return _flush_remote_operations(ops, plans)


def test_remote_adds_log_match_confidence_and_flag_failed_matches():
    repo = ResolvingRemoteRepo({
        "Hey Jude": ("The Beatles", "Hey Jude", "1"),
        "Hurt": ("Nine Inch Nails", "Hurt", "The Downward Spiral"),
        "Obscure B-Side": None,
    })
    items = [
        PlaylistItem(artist="The Beatles", title="Hey Jude", album="1"),
        PlaylistItem(artist="Johnny Cash", title="Hurt", album="American IV"),
        PlaylistItem(artist="Nobody", title="Obscure B-Side"),
    ]

    log_entries, failures = _flush(repo, items)

    assert failures == []
    by_track = {e.track: e for e in log_entries}

    good = by_track["The Beatles - Hey Jude"]
    assert good.action == "add" and good.success
    assert good.metadata["match"]["level"] == "high"

    cover = by_track["Johnny Cash - Hurt"]
    assert cover.action == "add" and cover.success
    assert cover.metadata["match"]["needs_review"] is True
    assert cover.metadata["match"]["fields"]["artist"]["matched"] == "Nine Inch Nails"

    missing = by_track["Nobody - Obscure B-Side"]
    assert missing.action == "failed_match" and not missing.success
    assert missing.eventKind == "failed_match"
    assert missing.metadata["match"]["matched"] is False


def test_stale_confidence_from_another_target_is_not_reused():
    item = PlaylistItem(artist="A", title="Song")
    item.sync_match = {"matched": True, "level": "high", "needs_review": False}

    log_entries, _ = _flush(MockRemotePlaylistRepository(), [item])  # mock records nothing

    assert log_entries[0].metadata is None


def test_sync_match_is_not_serialized():
    item = PlaylistItem(artist="A", title="Song")
    item.sync_match = {"matched": True}
    assert "sync_match" not in item.model_dump()


def test_local_match_confidence_compares_remote_item_with_linked_local_track():
    class Details:
        artist, title, album, album_artist = "Various Artists", "Hurt", "Covers", "Various Artists"

    class Entry:
        music_file_id = 5
        details = Details()

    result = _local_match_confidence(PlaylistItem(artist="Johnny Cash", title="Hurt"), [Entry()])

    assert result["needs_review"] is True
