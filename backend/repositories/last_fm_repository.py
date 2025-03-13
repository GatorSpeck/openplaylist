import urllib
from fastapi.exceptions import HTTPException
import logging
from response_models import LastFMTrack, Album, AlbumTrack, AlbumAndArtist
import os
import warnings
import json
from typing import Optional

import dotenv
dotenv.load_dotenv(override=True)

def from_json(payload) -> Optional[Album]:
    if "album" not in payload:
        return None

    tracks = []
    if "track" in payload.get("album", {}).get("tracks", {}):
        for i, track in enumerate(payload.get("album").get("tracks").get("track")):
            linked_track = LastFMTrack(title=track.get("name"), artist=track.get("artist").get("name"), url=track.get("url"))
            tracks.append(AlbumTrack(order=i, linked_track=linked_track))

    return Album(
        title=payload.get("album").get("name"),
        artist=payload.get("album").get("artist"),
        art_url=payload.get("album").get("image")[-1].get("#text"),
        tracks=tracks
    )

class last_fm_repository:
    def __init__(self, api_key, requests_cache_session):
        self.api_key = api_key
        self.requests_cache_session = requests_cache_session

    def get_similar_tracks(self, artist, title):
        # URL encode parameters
        encoded_title = urllib.parse.quote(title)
        encoded_artist = urllib.parse.quote(artist)

        similar_url = f"http://ws.audioscrobbler.com/2.0/?method=track.getsimilar&artist={encoded_artist}&track={encoded_title}&api_key={self.api_key}&format=json&limit=10"
        similar_response = self.requests_cache_session.get(similar_url)

        if similar_response.status_code != 200:
            raise HTTPException(
                status_code=500, detail="Failed to fetch similar tracks from Last.FM"
            )

        similar_data = similar_response.json()
        logging.info(similar_data)
        similar_tracks = similar_data.get("similartracks", {}).get("track", [])

        return [LastFMTrack(title=track.get("name", ""), artist=track.get("artist", {}).get("name", ""), url=track.get("url")) for track in similar_tracks]

    def search_track(self, artist, title):
        # URL encode parameters
        encoded_title = urllib.parse.quote(title)
        encoded_artist = urllib.parse.quote(artist)

        # Make request to Last.FM API
        url = f"http://ws.audioscrobbler.com/2.0/?method=track.search&track={encoded_title}&artist={encoded_artist}&api_key={self.api_key}&format=json&limit=10"
        response = self.requests_cache_session.get(url)

        if response.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to fetch data from Last.FM")

        data = response.json()
        tracks = data.get("results", {}).get("trackmatches", {}).get("track", [])

        logging.info(data)

        return [LastFMTrack(title=track.get("name", ""), artist=track.get("artist", ""), url=track.get("url")) for track in tracks]
    
    def search_album(self, artist, title):
        # URL encode parameters
        encoded_title = urllib.parse.quote(title) if title else None
        encoded_artist = urllib.parse.quote(artist) if artist else None  # TODO: not used

        if not encoded_title:
            return None

        # Make request to Last.FM API
        url = f"http://ws.audioscrobbler.com/2.0/?method=album.search&api_key={self.api_key}&format=json&limit=10"
        if encoded_title:
            url += f"&album={encoded_title}"

        response = self.requests_cache_session.get(url)

        if response.status_code != 200:
            logging.warning(f"Failed to fetch data from Last.FM: {response.status_code} {response.text}")
            raise HTTPException(status_code=500, detail="Failed to fetch data from Last.FM")

        data = response.json()
        # logging.info(json.dumps(data, indent=4))
        albums = data.get("results", {}).get("albummatches", {}).get("album", [])

        return [Album(
            title=album.get("name"),
            artist=album.get("artist"),
            art_url=album.get("image")[-1].get("#text"),
            tracks=[]
        ) for album in albums]

    def get_album_art(self, artist, album, redis_session=None):
        warnings.warn("This method is deprecated. Use get_album_info instead.", DeprecationWarning)
        if os.getenv("LASTFM_API_KEY") is None:
            raise ValueError("LASTFM_API_KEY environment variable is not set")
        
        pair = AlbumAndArtist(album=album, artist=artist)

        if redis_session:
            cached_url = redis_session.get(str(pair))
            if cached_url is not None:
                image_url = cached_url if cached_url != "" else None
                return {"image_url": image_url}
        
        encoded_title = urllib.parse.quote(pair.album)
        encoded_artist = urllib.parse.quote(pair.artist)
        
        logging.info(f"Fetching album info from Last.FM for {pair}")
        url = f"http://ws.audioscrobbler.com/2.0/?method=album.getinfo&api_key={os.getenv('LASTFM_API_KEY')}&artist={encoded_artist}&album={encoded_title}&format=json&autocorrect=1"

        response = None
        try:
            response = self.requests_cache_session.get(url)
        except Exception as e:
            logging.error(e)
            return {"image_url": None}

        image_url = None
        if response.status_code == 200:
            album_info = response.json()
            if "album" in album_info:
                urls = album_info["album"]["image"]
                image_url = urls[-2]["#text"] if len(urls) > 1 else urls[-1]["#text"]
                
                if redis_session:
                    redis_session.set(str(pair), image_url)
        
            return {"image_url": image_url}
        else:
            return {"image_url": None}

    def get_album_info(self, artist, album, redis_session=None) -> Optional[Album]:
        if os.getenv("LASTFM_API_KEY") is None:
            raise ValueError("LASTFM_API_KEY environment variable is not set")
        
        pair = AlbumAndArtist(album=album, artist=artist)

        if redis_session:
            cached_info = redis_session.get(str(pair))
            if cached_info is not None:
                return from_json(json.loads(cached_info))
        
        encoded_title = urllib.parse.quote(pair.album)
        encoded_artist = urllib.parse.quote(pair.artist)
        
        logging.info(f"Fetching album info from Last.FM for {pair}")
        url = f"http://ws.audioscrobbler.com/2.0/?method=album.getinfo&api_key={os.getenv('LASTFM_API_KEY')}&artist={encoded_artist}&album={encoded_title}&format=json&autocorrect=1"
        response = self.requests_cache_session.get(url)
        logging.info(response)
        album_info = None
        if response.status_code == 200:
            album_info = response.json()
            if redis_session:
                redis_session.set(str(pair), json.dumps(album_info))
        
        return from_json(album_info) if album_info else None
