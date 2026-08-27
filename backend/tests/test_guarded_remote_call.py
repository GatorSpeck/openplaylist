"""Direct unit tests for RemotePlaylistRepository._guarded_remote_call and each concrete repo's
own not-found predicate. These need no network, database, or FastAPI TestClient - the whole
point of consolidating this pattern into the base class was to make it testable in isolation
instead of only reachable through a full sync via test_remote_sync.py.
"""
import plexapi.exceptions
import pytest
import spotipy

from repositories.remote_playlist_repository import RemoteUnavailableError
from repositories.spotify_repository import SpotifyRepository
from tests.mock_remote_playlist_repository import MockRemotePlaylistRepository


@pytest.fixture
def repo():
    # Any RemotePlaylistRepository subclass works here - _guarded_remote_call is defined on the
    # base class and doesn't touch anything service-specific.
    return MockRemotePlaylistRepository(session=None)


def test_guarded_remote_call_returns_value_on_success(repo):
    assert repo._guarded_remote_call(lambda: "ok", context="doesn't matter") == "ok"


def test_guarded_remote_call_returns_none_on_confirmed_not_found(repo):
    def boom():
        raise ValueError("not found")

    result = repo._guarded_remote_call(
        boom, is_not_found=lambda e: isinstance(e, ValueError), context="looking up thing"
    )
    assert result is None


def test_guarded_remote_call_raises_unavailable_when_predicate_does_not_match(repo):
    def boom():
        raise ConnectionError("network is down")

    with pytest.raises(RemoteUnavailableError, match="network is down"):
        repo._guarded_remote_call(
            boom, is_not_found=lambda e: isinstance(e, ValueError), context="looking up thing"
        )


def test_guarded_remote_call_raises_unavailable_when_no_predicate_given(repo):
    def boom():
        raise ValueError("no signal for this service")

    with pytest.raises(RemoteUnavailableError):
        repo._guarded_remote_call(boom, context="looking up thing")


def test_guarded_remote_call_wraps_original_exception_as_cause(repo):
    original = ConnectionError("network is down")

    def boom():
        raise original

    with pytest.raises(RemoteUnavailableError) as exc_info:
        repo._guarded_remote_call(boom, context="looking up thing")
    assert exc_info.value.__cause__ is original


# --- Spotify's not-found predicate ---

@pytest.fixture
def spotify_repo():
    # access_token bypasses the OAuth/token-manager path entirely, so this constructs without
    # any real credentials or network access.
    return SpotifyRepository(session=None, config={}, access_token="fake-token")


def test_spotify_is_not_found_true_for_404(spotify_repo):
    exc = spotipy.SpotifyException(404, -1, "not found")
    assert spotify_repo._is_not_found(exc) is True


def test_spotify_is_not_found_false_for_other_http_status(spotify_repo):
    exc = spotipy.SpotifyException(500, -1, "server error")
    assert spotify_repo._is_not_found(exc) is False


def test_spotify_is_not_found_false_for_non_spotify_exception(spotify_repo):
    assert spotify_repo._is_not_found(ConnectionError("network is down")) is False


# --- Plex's lookup chain: confirmed-not-found vs. unavailable ---

class _FakeAccount:
    pass


class _FakePlexServerBase:
    def account(self):
        return _FakeAccount()

    class library:
        @staticmethod
        def section(name):
            return object()


def _make_plex_repo(monkeypatch, fake_server):
    import repositories.plex_repository as plex_repo_module

    monkeypatch.setattr(plex_repo_module, "PlexServer", lambda endpoint, token=None: fake_server)
    return plex_repo_module.PlexRepository(
        session=None,
        config={"endpoint": "http://plex.local:32400", "token": "token", "library": "Music"},
    )


def test_plex_find_playlist_by_id_returns_none_on_confirmed_not_found(monkeypatch):
    class FakeServer(_FakePlexServerBase):
        def fetchItem(self, key):
            raise plexapi.exceptions.NotFound("no such playlist")

    repo = _make_plex_repo(monkeypatch, FakeServer())
    assert repo._find_playlist_by_id("12345") is None


def test_plex_find_playlist_by_id_raises_unavailable_on_connection_error(monkeypatch):
    class FakeServer(_FakePlexServerBase):
        def fetchItem(self, key):
            raise ConnectionError("connection refused")

    repo = _make_plex_repo(monkeypatch, FakeServer())
    with pytest.raises(RemoteUnavailableError):
        repo._find_playlist_by_id("12345")


def test_plex_find_matching_playlists_raises_unavailable_when_listing_fails(monkeypatch):
    class FakeServer(_FakePlexServerBase):
        def playlists(self, **kwargs):
            raise ConnectionError("connection refused")

    repo = _make_plex_repo(monkeypatch, FakeServer())
    with pytest.raises(RemoteUnavailableError):
        repo._find_matching_playlists("My Playlist")


def test_plex_find_playlist_returns_none_when_confirmed_absent_everywhere(monkeypatch):
    class FakeServer(_FakePlexServerBase):
        def fetchItem(self, key):
            raise plexapi.exceptions.NotFound("no such playlist")

        def playlists(self, **kwargs):
            return []

        def playlist(self, title):
            raise plexapi.exceptions.NotFound("no such playlist")

    repo = _make_plex_repo(monkeypatch, FakeServer())
    assert repo._find_playlist("Some Playlist") is None
