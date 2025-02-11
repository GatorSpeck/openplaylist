import urllib
from http.client import HTTPException
import logging
from response_models import LastFMTrack

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