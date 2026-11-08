"""Plex keeps the album artist in grandparentTitle and the track artist (only when different)
in originalTitle. Searches and sync matching should prefer the track artist."""
from types import SimpleNamespace

from repositories.plex_repository import PlexRepository, plex_track_artist
from response_models import PlaylistItem


def plex_track(key, title, album_artist, album, track_artist=None):
    return SimpleNamespace(ratingKey=key, title=title, grandparentTitle=album_artist,
                           originalTitle=track_artist, parentTitle=album)


class FakeSection:
    def __init__(self, tracks):
        self.tracks = tracks
        self.calls = []

    def search(self, libtype, title, filters=None, maxresults=None):
        self.calls.append(filters)
        matches = [t for t in self.tracks if title.lower() in t.title.lower()]
        if filters and "artist.title" in filters:  # Plex filters on album artist only
            matches = [t for t in matches if t.grandparentTitle == filters["artist.title"]]
        return matches[:maxresults]


def make_repo(tracks):
    repo = PlexRepository.__new__(PlexRepository)  # skip the server connection
    repo.section = FakeSection(tracks)
    return repo


def test_plex_track_artist_falls_back_to_album_artist():
    assert plex_track_artist(plex_track(1, "T", "Album Artist", "A", "Track Artist")) == "Track Artist"
    assert plex_track_artist(plex_track(1, "T", "Album Artist", "A")) == "Album Artist"


def test_search_tracks_finds_and_ranks_by_track_artist():
    repo = make_repo([
        plex_track(1, "Hurt", "Nine Inch Nails", "The Downward Spiral"),
        plex_track(2, "Hurt", "Various Artists", "Covers", track_artist="Johnny Cash"),
    ])

    results = repo.search_tracks("Johnny Cash Hurt", title="Hurt", artist="Johnny Cash")

    assert results[0]["plex_rating_key"] == "2"
    assert results[0]["artist"] == "Johnny Cash"
    assert results[0]["album_artist"] == "Various Artists"


def test_search_tracks_still_matches_album_artist():
    repo = make_repo([plex_track(1, "Hurt", "Nine Inch Nails", "The Downward Spiral")])

    results = repo.search_tracks("Hurt", title="Hurt", artist="Nine Inch Nails")

    assert [r["plex_rating_key"] for r in results] == ["1"]
    assert results[0]["artist"] == "Nine Inch Nails"


def test_add_items_records_confidence_using_track_artist():
    repo = make_repo([])
    track = plex_track(2, "Hurt", "Various Artists", "Covers", track_artist="Johnny Cash")
    item = PlaylistItem(artist="Johnny Cash", title="Hurt", album="Covers")

    repo._record_plex_match(item, track)

    assert item.sync_match["level"] == "high"
    assert item.sync_match["fields"]["artist"]["matched"] == "Johnny Cash"
