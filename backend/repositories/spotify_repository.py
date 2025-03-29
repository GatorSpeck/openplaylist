import os
import dotenv
from fastapi import HTTPException
import requests
from response_models import SpotifyPlaylist, SpotifyTrack

dotenv.load_dotenv(override=True)

CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID", None)
CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET", None)

def get_spotify_repo(requests_cache_session):
    if not CLIENT_ID or not CLIENT_SECRET:
        return None
    
    return spotify_repository(CLIENT_ID, CLIENT_SECRET, requests_cache_session)

class spotify_repository:
    def __init__(self, client_id, client_secret, requests_cache_session):
        self.client_id = client_id
        self.client_secret = client_secret
        self.requests_cache_session = requests_cache_session

        self.access_token = self.get_access_token()
    
    def get_access_token(self):
        auth_url = "https://accounts.spotify.com/api/token"
        auth_data = {
            'grant_type': 'client_credentials',
            'client_id': self.client_id,
            'client_secret': self.client_secret
        }
        headers = {
            'Content-Type': 'application/x-www-form-urlencoded'
        }

        resp = requests.post(auth_url, data=auth_data, headers=headers)
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail="Failed to fetch access token")
        
        token_info = resp.json()
        access_token = token_info.get('access_token')
        if not access_token:
            raise HTTPException(status_code=400, detail="Access token not found in response")
        return access_token
    
    def get_playlist(self, playlist_id):
        resp = self.requests_cache_session.get(f"https://api.spotify.com/v1/playlists/{playlist_id}", headers={
            'Authorization': f'Bearer {self.access_token}'
        })

        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail="Failed to fetch playlist")
        
        # TODO: handle pagination

        data = resp.json()
        results = SpotifyPlaylist(
            description=data.get("description"),
            external_url=data.get("external_urls", {}).get("spotify"),
            id=data.get("id"),
            name=data.get("name"),
            tracks=[]
        )

        for item in data.get("tracks", {}).get("items", []):
            track_data = item.get("track")
            if track_data:
                artist = None
                artists = track_data.get("artists", [])
                if artists:
                    artist = artists[0].get("name") if len(artists) > 0 else None

                track = SpotifyTrack(
                    id=track_data.get("id"),
                    title=track_data.get("name"),
                    artist=artist,
                    track_uri=track_data.get("uri"),
                    album=track_data.get("album", {}).get("name"),
                    album_uri=track_data.get("album", {}).get("uri"),
                )
                results.tracks.append(track)

        return results
