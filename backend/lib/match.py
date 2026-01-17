from collections import namedtuple

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