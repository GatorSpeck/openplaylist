import urllib
from http.client import HTTPException
import logging
from response_models import LastFMTrack
import os

import dotenv
dotenv.load_dotenv(override=True)

class AlbumAndArtist:
    def __init__(self, album, artist):
        self.album = album
        self.artist = artist

    def __str__(self):
        return f"{self.artist} - {self.album}"

    def __repr__(self):
        return f"{self.artist} - {self.album}"

    def __eq__(self, other):
        return self.album == other.album and self.artist == other.artist

    def __hash__(self):
        return hash((self.album, self.artist))

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
        logging.debug(similar_data)
        similar_tracks = similar_data.get("similartracks", {}).get("track", [])

        return [LastFMTrack(title=track.get("name", ""), artist=track.get("artist", {}).get("name", ""), url=track.get("url")) for track in similar_tracks]

    def search_track(self, artist, title):
        # URL encode parameters
        encoded_title = urllib.parse.quote(title)
        encoded_artist = urllib.parse.quote(artist)

        # Make request to Last.FM API
        url = f"http://ws.audioscrobbler.com/2.0/?method=track.search&track={encoded_title}&artist={encoded_artist}&api_key={self.api_key}&format=json&limit=1"
        response = self.requests_cache_session.get(url)

        if response.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to fetch data from Last.FM")

        data = response.json()
        tracks = data.get("results", {}).get("trackmatches", {}).get("track", [])

        logging.debug(data)

        # Return first matching track
        if tracks:
            track = tracks[0]
            return LastFMTrack(
                title=track.get("name", ""),
                artist=track.get("artist", ""),
                url=track.get("url"),
            )

        return None

    def get_album_art(self, artist, album, redis_session=None):
        if os.getenv("LASTFM_API_KEY") is None:
            raise ValueError("LASTFM_API_KEY environment variable is not set")
        
        pair = AlbumAndArtist(album, artist)

        if redis_session:
            cached_url = redis_session.get(str(pair))
            if cached_url is not None:
                image_url = cached_url if cached_url != "" else None
                return {"image_url": image_url}
        
        logging.info(f"Fetching album info from Last.FM for {pair}")
        url = f"http://ws.audioscrobbler.com/2.0/?method=album.getinfo&api_key={os.getenv('LASTFM_API_KEY')}&artist={pair.artist}&album={pair.album}&format=json"
        response = self.requests_cache_session.get(url)
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
