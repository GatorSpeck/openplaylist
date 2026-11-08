from collections import namedtuple
from difflib import SequenceMatcher
from typing import Any, Dict, Iterable, Optional

from lib.normalize import normalize_artist, normalize_title

TrackStub = namedtuple("TrackStub", ["artist", "title", "album"])
AlbumStub = namedtuple("AlbumStub", ["artist", "title"])

def get_match_score(track1: TrackStub, track2: TrackStub):
    score = 0

    if track1.title.lower() == track2.title.lower():
        score += 50
    elif normalize_title(track1.title) == normalize_title(track2.title):
        score += 40
    elif track1.title.lower().startswith(track2.title.lower()) or track2.title.lower().startswith(track1.title.lower()):
        score += 30
    elif track1.title.lower() in track2.title.lower() or track2.title.lower() in track1.title.lower():
        score += 20
    
    if track1.artist.lower() == track2.artist.lower():
        score += 30
    elif normalize_artist(track1.artist) == normalize_artist(track2.artist):
        score += 20
    elif track1.artist.lower().startswith(track2.artist.lower()) or track2.artist.lower().startswith(track1.artist.lower()):
        score += 15
    elif track1.artist.lower() in track2.artist.lower() or track2.artist.lower() in track1.artist.lower():
        score += 10
    
    return score

def get_album_match_score(album1: AlbumStub, album2: AlbumStub):
    score = 0
    
    if album1.title.lower() == album2.title.lower():
        score += 50
    elif normalize_title(album1.title) == normalize_title(album2.title):
        score += 40
    elif album1.title.lower().startswith(album2.title.lower()) or album2.title.lower().startswith(album1.title.lower()):
        score += 30
    elif album1.title.lower() in album2.title.lower() or album2.title.lower() in album1.title.lower():
        score += 20
    
    if album1.artist.lower() == album2.artist.lower():
        score += 20
    elif normalize_artist(album1.artist) == normalize_artist(album2.artist):
        score += 15
    elif album1.artist.lower().startswith(album2.artist.lower()) or album2.artist.lower().startswith(album1.artist.lower()):
        score += 10
    elif album1.artist.lower() in album2.artist.lower() or album2.artist.lower() in album1.artist.lower():
        score += 5

    return score

def get_artist_match_score(artist1: str, artist2: str):
    score = 0

    if artist1.lower() == artist2.lower():
        score += 50
    elif normalize_artist(artist1) == normalize_artist(artist2):
        score += 40
    elif artist1.lower().startswith(artist2.lower()) or artist2.lower().startswith(artist1.lower()):
        score += 30
    elif artist1.lower() in artist2.lower() or artist2.lower() in artist1.lower():
        score += 20

    return score

# --- Sync match confidence -------------------------------------------------------------
#
# Unlike get_match_score (used to rank search candidates), this compares the track we asked
# for ("target") with the track a service actually resolved ("matched"), field by field, and
# produces a 0-100 confidence plus a level so the UI can flag questionable matches.

CONFIDENCE_HIGH_THRESHOLD = 85
CONFIDENCE_MEDIUM_THRESHOLD = 65
# A title or artist below this is treated as a different track (e.g. a cover by another artist)
CONFIDENCE_FIELD_FLOOR = 60

_CONFIDENCE_WEIGHTS = {"title": 0.55, "artist": 0.35, "album": 0.10}


def _field_similarity(target: Optional[str], matched: Optional[str], normalizer) -> Optional[int]:
    """0-100 similarity between two field values, or None when either side is blank."""
    if not target or not matched:
        return None

    target_lower = target.strip().lower()
    matched_lower = matched.strip().lower()
    if target_lower == matched_lower:
        return 100

    target_norm = normalizer(target).strip().lower()
    matched_norm = normalizer(matched).strip().lower()
    if target_norm == matched_norm:
        return 95

    ratio = int(round(SequenceMatcher(None, target_norm, matched_norm).ratio() * 100))
    if target_norm in matched_norm or matched_norm in target_norm:
        ratio = max(ratio, 75)

    return min(ratio, 90)


def get_match_confidence(
    target: TrackStub,
    matched: TrackStub,
    matched_alt_artists: Optional[Iterable[str]] = None,
) -> Dict[str, Any]:
    """
    Compare a requested track against the track a service matched it to.

    matched_alt_artists: other artist names credited on the matched track (album artist,
    featured artists); the best-scoring artist name is used.
    """
    title_score = _field_similarity(target.title, matched.title, normalize_title)

    matched_artist = matched.artist
    artist_score = _field_similarity(target.artist, matched.artist, normalize_artist)
    for alt_artist in matched_alt_artists or []:
        alt_score = _field_similarity(target.artist, alt_artist, normalize_artist)
        if alt_score is not None and (artist_score is None or alt_score > artist_score):
            matched_artist, artist_score = alt_artist, alt_score

    album_score = _field_similarity(target.album, matched.album, normalize_title)

    field_scores = {"title": title_score, "artist": artist_score, "album": album_score}
    weighted = {k: v for k, v in field_scores.items() if v is not None}
    if weighted:
        total_weight = sum(_CONFIDENCE_WEIGHTS[k] for k in weighted)
        score = int(round(sum(_CONFIDENCE_WEIGHTS[k] * v for k, v in weighted.items()) / total_weight))
    else:
        score = 0

    if score >= CONFIDENCE_HIGH_THRESHOLD:
        level = "high"
    elif score >= CONFIDENCE_MEDIUM_THRESHOLD:
        level = "medium"
    else:
        level = "low"

    if any((field_scores[f] or 0) < CONFIDENCE_FIELD_FLOOR for f in ("title", "artist")):
        level = "low"

    def field(name, target_value, matched_value):
        return {"target": target_value, "matched": matched_value, "score": field_scores[name]}

    return {
        "matched": True,
        "score": score,
        "level": level,
        "needs_review": level == "low",
        "fields": {
            "title": field("title", target.title, matched.title),
            "artist": field("artist", target.artist, matched_artist),
            "album": field("album", target.album, matched.album),
        },
    }


def no_match_confidence(target: TrackStub) -> Dict[str, Any]:
    """Confidence payload for a track the service could not resolve at all."""
    return {
        "matched": False,
        "score": 0,
        "level": "none",
        "needs_review": True,
        "fields": {
            "title": {"target": target.title, "matched": None, "score": None},
            "artist": {"target": target.artist, "matched": None, "score": None},
            "album": {"target": target.album, "matched": None, "score": None},
        },
    }
