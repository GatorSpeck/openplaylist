import datetime
from typing import Any, Dict, List, Optional

from models import PlaylistDB
from repositories.remote_playlist_repository import RemotePlaylistRepository, RemoteUnavailableError
from response_models import PlaylistItem, PlaylistSnapshot


class MockRemotePlaylistRepository(RemotePlaylistRepository):
    """Reusable in-memory remote repository for sync tests."""

    def __init__(self, session=None, config: Dict[str, str] = None, music_file_repo=None):
        super().__init__(session, config)
        self.music_file_repo = music_file_repo
        self.remote_playlists: Dict[str, List[PlaylistItem]] = {}
        self.remote_snapshot_updates: Dict[str, datetime.datetime] = {}
        self.playlist_id: Optional[str] = None
        # Simulates the remote being unreachable this sync (network error, service down, etc.)
        # rather than confirmed-empty/missing - see RemoteUnavailableError. Backed by a dict
        # (like remote_playlists above) rather than a plain bool so a test harness that swaps in
        # a shared dict here can toggle it and have every repo instance created against the same
        # service - including ones created for a *later* sync call - see the change.
        self._flags: Dict[str, bool] = {}

        self.get_playlist_snapshot_called = 0
        self.create_playlist_called = 0
        self.add_items_called = 0
        self.remove_items_called = 0
        self.fetch_media_item_called = 0
        self.clear_playlist_called = 0

    def reset_counters(self) -> None:
        self.get_playlist_snapshot_called = 0
        self.create_playlist_called = 0
        self.add_items_called = 0
        self.remove_items_called = 0
        self.fetch_media_item_called = 0
        self.clear_playlist_called = 0

    def _reset_counters(self) -> None:
        self.reset_counters()

    @property
    def unavailable(self) -> bool:
        return self._flags.get("unavailable", False)

    @unavailable.setter
    def unavailable(self, value: bool) -> None:
        self._flags["unavailable"] = value

    def set_remote_playlist(
        self,
        playlist_name: str,
        items: List[PlaylistItem],
        updated_at: Optional[datetime.datetime] = None,
    ) -> None:
        self.remote_playlists[playlist_name] = list(items)
        self.remote_snapshot_updates[playlist_name] = updated_at or datetime.datetime.now().astimezone()

    def get_playlist_snapshot(self, playlist_name: str) -> Optional[PlaylistSnapshot]:
        self.get_playlist_snapshot_called += 1
        if self.unavailable:
            raise RemoteUnavailableError(f"Simulated outage fetching '{playlist_name}'")
        if playlist_name not in self.remote_playlists:
            return None

        # Mirrors PlexRepository/SpotifyRepository, which both resolve and remember the
        # concrete remote playlist id/ref as a side effect of fetching its snapshot, not only
        # when creating one - clear_playlist() and others rely on this being set either way.
        self.playlist_id = playlist_name

        snapshot = PlaylistSnapshot(
            name=playlist_name,
            last_updated=self.remote_snapshot_updates.get(playlist_name, datetime.datetime.now().astimezone()),
            items=[],
        )
        # PlaylistSnapshot.has()/build_key_index() key off item_set/music_file_ids/etc., which
        # are only populated by add_item() - passing items= directly to the constructor leaves
        # those empty and silently breaks every membership check against this snapshot.
        for item in self.remote_playlists[playlist_name]:
            snapshot.add_item(item)

        return snapshot

    def create_playlist(self, playlist_name: str, snapshot: PlaylistSnapshot) -> Any:
        self.create_playlist_called += 1
        self.playlist_id = playlist_name
        self.set_remote_playlist(playlist_name, snapshot.items, snapshot.last_updated)
        return {"id": playlist_name}

    def add_items(self, playlist_name: str, items: List[PlaylistItem]) -> None:
        self.add_items_called += 1
        if playlist_name not in self.remote_playlists:
            self.remote_playlists[playlist_name] = []
            self.remote_snapshot_updates[playlist_name] = datetime.datetime.now().astimezone()

        existing_items = self.remote_playlists[playlist_name]
        for item in items:
            if not any(current.to_string() == item.to_string() for current in existing_items):
                existing_items.append(item)

        self.remote_snapshot_updates[playlist_name] = datetime.datetime.now().astimezone()

    def remove_items(self, playlist_name: str, items: List[PlaylistItem]) -> None:
        self.remove_items_called += 1
        if playlist_name not in self.remote_playlists:
            return

        self.remote_playlists[playlist_name] = [
            current
            for current in self.remote_playlists[playlist_name]
            if all(current.to_string() != item.to_string() for item in items)
        ]
        self.remote_snapshot_updates[playlist_name] = datetime.datetime.now().astimezone()

    def fetch_media_item(self, item: PlaylistItem) -> Any:
        self.fetch_media_item_called += 1
        return item

    def is_authenticated(self):
        return True

    def clear_playlist(self):
        self.clear_playlist_called += 1
        if self.playlist_id and self.playlist_id in self.remote_playlists:
            self.remote_playlists[self.playlist_id] = []
            self.remote_snapshot_updates[self.playlist_id] = datetime.datetime.now().astimezone()
