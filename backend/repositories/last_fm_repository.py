import urllib
import urllib.parse
from fastapi.exceptions import HTTPException
import logging
from response_models import Album, AlbumTrack, AlbumAndArtist, Artist, AlbumSearchResult, MusicFile
import os
import warnings
import json
from typing import Optional, List

import dotenv
dotenv.load_dotenv(override=True)

LASTFM_API_KEY = os.getenv("LASTFM_API_KEY", None)

def get_last_fm_repo(requests_cache_session):
    if not LASTFM_API_KEY:
        return None
    return last_fm_repository(LASTFM_API_KEY, requests_cache_session)

def from_json(payload) -> Optional[Album]:
    if "album" not in payload:
        return None

    tracks = []
    if "track" in payload.get("album", {}).get("tracks", {}):
        for i, track in enumerate(payload.get("album").get("tracks").get("track")):
            linked_track = MusicFile(title=track.get("name"), artist=track.get("artist").get("name"), last_fm_url=track.get("url"))
            tracks.append(AlbumTrack(order=i, linked_track=linked_track))

    exact_release_date = payload.get("album", {}).get("releasedate")

    return Album(
        title=payload.get("album").get("name"),
        artist=payload.get("album").get("artist"),
        art_url=payload.get("album").get("image")[-1].get("#text"),
        last_fm_url=payload.get("album").get("url"),
        exact_release_date=exact_release_date,
        mbid=payload.get("album").get("mbid"),
        tracks=tracks
    )

class last_fm_repository:
    def __init__(self, api_key, requests_cache_session, redis_session = None):
        self.api_key = api_key
        self.requests_cache_session = requests_cache_session
        self.redis_session = redis_session
    
    def get_with_retries(self, uri):
        # Retry logic can be implemented here
        response = None
        for i in range(2):
            try:
                response = self.requests_cache_session.get(uri)
                if response.status_code == 200:
                    return response
            except Exception as e:
                pass
        
        if response is not None:
            return response
        
        raise HTTPException(status_code=500, detail="Failed to fetch data from Last.FM")

    def get_similar_tracks(self, artist, title):
        # URL encode parameters
        encoded_title = urllib.parse.quote(title)
        encoded_artist = urllib.parse.quote(artist)

        similar_url = f"http://ws.audioscrobbler.com/2.0/?method=track.getsimilar&artist={encoded_artist}&track={encoded_title}&api_key={self.api_key}&format=json&limit=10"
        similar_response = self.get_with_retries(similar_url)

        if similar_response.status_code != 200:
            raise HTTPException(
                status_code=500, detail="Failed to fetch similar tracks from Last.FM"
            )

        similar_data = similar_response.json()
        
        similar_tracks = similar_data.get("similartracks", {}).get("track", [])

        return [MusicFile(title=track.get("name", ""), artist=track.get("artist", {}).get("name", ""), last_fm_url=track.get("url")) for track in similar_tracks]

    def search_track(self, title: Optional[str] = None, artist: Optional[str] = None, limit: int=10, page: int=1) -> List[MusicFile]:
        # URL encode parameters
        encoded_title = urllib.parse.quote(title) if title else None
        encoded_artist = urllib.parse.quote(artist) if artist else None

        if not encoded_title and not encoded_artist:
            raise HTTPException(status_code=400, detail="Either title or artist must be provided")
        
        if encoded_artist and not encoded_title:
            # get list of top tracks
            last_fm_artists = self.search_artist(encoded_artist, limit=1)
            if not last_fm_artists:
                logging.error(f"Artist not found: {encoded_artist}")
                raise HTTPException(status_code=404, detail="Artist not found")
            
            url = f"http://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&api_key={self.api_key}&format=json&limit={limit}&page={page}&artist={encoded_artist}"
            logging.info(url)

            response = self.get_with_retries(url)
            if response.status_code != 200:
                logging.warning(f"Failed to fetch data from Last.FM: {response.status_code} {response.text}")
                raise HTTPException(status_code=500, detail="Failed to fetch data from Last.FM")
            
            data = response.json()
            tracks = data.get("toptracks", {}).get("track", [])
            return [MusicFile(title=track.get("name", ""), artist=track.get("artist", {}).get("name", ""), last_fm_url=track.get("url")) for track in tracks]

        base_url = f"http://ws.audioscrobbler.com/2.0/?method=track.search&track={encoded_title}&api_key={self.api_key}&format=json&limit={limit}&page={page}"

        results = []

        if encoded_artist:
            # fetch artist first
            last_fm_artists = self.search_artist(encoded_artist, limit=5)
            for artist in last_fm_artists:
                artist_name = urllib.parse.quote(artist.name)
                url = base_url + f"&artist={artist_name}"

                logging.info(url)
                response = self.get_with_retries(url)

                data = response.json()
                tracks = data.get("results", {}).get("trackmatches", {}).get("track", [])

                results.extend([MusicFile(title=track.get("name", ""), artist=track.get("artist", ""), url=track.get("url")) for track in tracks])
        else:
            # fetch without artist
            url = base_url
            logging.info(url)
            response = self.get_with_retries(url)

            data = response.json()
            tracks = data.get("results", {}).get("trackmatches", {}).get("track", [])

            results.extend([MusicFile(title=track.get("name", ""), artist=track.get("artist", ""), last_fm_url=track.get("url")) for track in tracks])

        return results[:limit]
    
    def search_album_fallback(self, artist: Optional[str] = None, title: Optional[str] = None, limit: int = 10, page: int = 1) -> List[AlbumSearchResult]:
        if not artist and not title:
            raise HTTPException(status_code=400, detail="Either artist or title must be provided")
        
        # URL encode parameters
        encoded_title = urllib.parse.quote(title) if title else None
        encoded_artist = urllib.parse.quote(artist) if artist else None

        # Make request to Last.FM API
        url = f"http://ws.audioscrobbler.com/2.0/?method=album.search&api_key={self.api_key}&format=json&limit={limit}&album={encoded_title}&autocorrect=1"
        logging.info(url)

        response = self.get_with_retries(url)

        if response.status_code != 200:
            logging.warning(f"Failed to fetch data from Last.FM: {response.status_code} {response.text}")
            raise HTTPException(status_code=500, detail="Failed to fetch data from Last.FM")

        data = response.json()
        albums = data.get("results", {}).get("albummatches", {}).get("album", [])

        results = []

        for match in albums:
            score = 0
            match_name = match.get("name")
            match_artist = match.get("artist")
            if match_name.lower() == title.lower() and match_artist.lower() == artist.lower():
                score = 10
            elif match_name.lower().startswith(title.lower()) and match_artist.lower() == artist.lower():
                score = 5
            elif match_artist.lower() == artist.lower():
                score = 2
            elif title.lower() in match_name.lower():
                score = 1
            
            if score == 0:
                continue
            
            match = AlbumSearchResult(
                title=match.get("name"),
                artist=match.get("artist"),
                art_url=match.get("image")[-1].get("#text"),
                last_fm_url=match.get("url"),
                score=score
            )

            results.append(match)

        results.sort(key=lambda x: x.score, reverse=True)

        return results
    
    def search_album(self, artist: Optional[str] = None, title: Optional[str] = None, limit: int = 10, page: int = 1) -> List[Album]:
        if not artist and not title:
            raise HTTPException(status_code=400, detail="Either artist or title must be provided")
        
        if artist and not title:
            last_fm_artists = self.search_artist(artist, limit=1)
            if not last_fm_artists:
                logging.error(f"Artist not found: {artist}")
                raise HTTPException(status_code=404, detail="Artist not found")
            artist = last_fm_artists[0]
            
            return self.get_artist_albums(artist_name=artist.name, artist_mbid=artist.mbid, limit=limit, page=page)
        
        if artist and title:
            last_fm_artists = self.search_artist(artist, limit=10)
            if not last_fm_artists:
                logging.error(f"Artist not found: {artist}")
                raise HTTPException(status_code=404, detail="Artist not found")
            
            results = []

            for artist in last_fm_artists:
                albums = self.get_artist_albums(artist_name=artist.name, artist_mbid=artist.mbid, limit=25, page=page)

                album_matches = [a.to_json() for a in albums]

                for album in album_matches:
                    album_title = album.get("title")
                    if album_title.lower() == title.lower():
                        album["score"] = 10
                    elif album_title.lower().startswith(title.lower()):
                        album["score"] = 5
                    elif title.lower() in album_title.lower():
                        album["score"] = 2
                    else:
                        album["score"] = 0

                    results.append(album)
                
                if results:
                    break
            
            results.sort(key=lambda x: x.get("score", 0), reverse=True)

            if not (results and results[0].get("score", 0) >= 5):
                # try searching for album without artist
                albums = self.search_album_fallback(artist=artist.name, title=title, limit=limit)

                # insert results at beginning
                results = [a.to_json() for a in albums] + results

            return [Album(
                title=album.get("title"),
                artist=album.get("artist"),
                art_url=album.get("art_url"),
                last_fm_url=album.get("last_fm_url"),
                mbid=album.get("mbid"),
                exact_release_date=album.get("exact_release_date"),
                release_year=album.get("release_year"),
            ) for album in results][:limit]
        
        # else, we just have the title to work with

        # URL encode parameters
        encoded_title = urllib.parse.quote(title) if title else None

        # Make request to Last.FM API
        url = f"http://ws.audioscrobbler.com/2.0/?method=album.search&api_key={self.api_key}&format=json&limit={limit}&album={encoded_title}&autocorrect=1"
        logging.info(url)

        response = self.get_with_retries(url)

        if response.status_code != 200:
            logging.warning(f"Failed to fetch data from Last.FM: {response.status_code} {response.text}")
            raise HTTPException(status_code=500, detail="Failed to fetch data from Last.FM")

        data = response.json()
        # logging.info(json.dumps(data, indent=4))
        albums = data.get("results", {}).get("albummatches", {}).get("album", [])

        if artist:
            # put albums with artist match at the top
            artist_albums = [album for album in albums if album.get("artist").lower() == artist.lower()]
            other_albums = [album for album in albums if album.get("artist").lower() != artist.lower()]
            albums = artist_albums + other_albums

        return [Album(
            title=album.get("name"),
            artist=album.get("artist"),
            art_url=album.get("image")[-1].get("#text"),
            last_fm_url=album.get("url"),
            mbid=album.get("mbid"),
            exact_release_date=album.get("exact_release_date"),
            release_year=album.get("release_year"),
        ) for album in albums]

    def get_album_art(self, artist, album):
        warnings.warn("This method is deprecated. Use get_album_info instead.", DeprecationWarning)
        if os.getenv("LASTFM_API_KEY") is None:
            raise ValueError("LASTFM_API_KEY environment variable is not set")
        
        pair = AlbumAndArtist(album=album, artist=artist)
        redis_tag = f"albumart:{pair}"

        if self.redis_session:
            try:
                cached_url = self.redis_session.get(redis_tag)
                if cached_url is not None:
                    image_url = cached_url if cached_url != "" else None
                    return {"image_url": image_url}
            except Exception as e:
                logging.error(e)
                pass
        
        encoded_title = urllib.parse.quote(pair.album)
        encoded_artist = urllib.parse.quote(pair.artist)
        
        logging.info(f"Fetching album info from Last.FM for {pair}")
        url = f"http://ws.audioscrobbler.com/2.0/?method=album.getinfo&api_key={os.getenv('LASTFM_API_KEY')}&artist={encoded_artist}&album={encoded_title}&format=json&autocorrect=1"

        response = None
        try:
            response = self.get_with_retries(url)
        except Exception as e:
            logging.error(e)
            return {"image_url": None}

        image_url = None
        if response.status_code == 200:
            album_info = response.json()
            if "album" in album_info:
                urls = album_info["album"]["image"]
                image_url = urls[-2]["#text"] if len(urls) > 1 else urls[-1]["#text"]
                
                if self.redis_session:
                    try:
                        self.redis_session.set(redis_tag, image_url)
                    except Exception as e:
                        logging.error(e)
                        pass
        
            return {"image_url": image_url}
        else:
            logging.warning(f"Failed to fetch data from Last.FM: {response.status_code} {response.text}")
            return {"image_url": None}
    
    def search_artist(self, artist: str, limit: int=10, page: int=1) -> List[Artist]:
        if not artist:
            logging.error("Artist name is empty")
            raise HTTPException(status_code=400, detail="Artist name must be non-empty")
        
        # URL encode parameters
        encoded_artist = urllib.parse.quote(artist)

        # Make request to Last.FM API
        url = f"http://ws.audioscrobbler.com/2.0/?method=artist.search&artist={encoded_artist}&api_key={self.api_key}&format=json&limit={limit}&page={page}"
        logging.info(url)
        response = self.get_with_retries(url)

        if response.status_code != 200:
            logging.warning(f"Failed to fetch data from Last.FM: {response.status_code} {response.text}")
            raise HTTPException(status_code=500, detail="Failed to fetch data from Last.FM")

        data = response.json()

        artists = data.get("results", {}).get("artistmatches", {}).get("artist", [])

        results = []

        for match in artists:
            match_name = match.get("name")
            if match_name.lower() == artist.lower():
                match["score"] = 10
            elif match_name.lower().startswith(artist.lower()):
                match["score"] = 5
            elif artist.lower() in match_name.lower():
                match["score"] = 2
            else:
                match["score"] = 0
            
            results.append(match)
        
        results.sort(key=lambda x: x.get("score", 0), reverse=True)

        return [Artist(
            name=match.get("name"),
            url=match.get("url"),
            mbid=match.get("mbid"),
            albums=[]
        ) for match in results]
    
    def get_artist_albums(self, artist_name: Optional[str], artist_mbid: Optional[str], limit: int=10, page: int=1) -> List[Album]:
        if not artist_mbid and not artist_name:
            logging.error("Artist Name or MBID required")
            raise HTTPException(status_code=400, detail="Artist MBID must be non-empty")
        
        artist_name = urllib.parse.quote(artist_name) if artist_name else None
        artist_mbid = urllib.parse.quote(artist_mbid) if artist_mbid else None

        url = f"http://ws.audioscrobbler.com/2.0/?method=artist.gettopalbums&api_key={self.api_key}&format=json&limit={limit}&page={page}"
        if artist_mbid:
            url += f"&mbid={artist_mbid}"
        elif artist_name:
            url += f"&artist={artist_name}"

        logging.info(url)
        response = self.get_with_retries(url)

        if response.status_code != 200:
            logging.warning(f"Failed to fetch data from Last.FM: {response.status_code} {response.text}")
            raise HTTPException(status_code=500, detail="Failed to fetch data from Last.FM")
        
        data = response.json()
        albums = data.get("topalbums", {}).get("album", [])

        return [Album(
            title=album.get("name"),
            artist=album.get("artist").get("name"),
            art_url=album.get("image")[-1].get("#text"),
            last_fm_url=album.get("url"),
            mbid=album.get("mbid"),
            exact_release_date=album.get("exact_release_date"),
            release_year=album.get("release_year"),
        ) for album in albums]
    
    def get_album_info_by_mbid(self, mbid: str) -> Optional[Album]:
        if os.getenv("LASTFM_API_KEY") is None:
            raise ValueError("LASTFM_API_KEY environment variable is not set")
        
        redis_tag = f"albuminfo:mbid:{mbid}"

        if self.redis_session:
            try:
                cached_info = self.redis_session.get(redis_tag)
                if cached_info is not None:
                    logging.debug(cached_info)
                    return from_json(json.loads(cached_info))
            except Exception as e:
                logging.error(e)
                pass

        url = f"http://ws.audioscrobbler.com/2.0/?method=album.getinfo&api_key={os.getenv('LASTFM_API_KEY')}&mbid={mbid}&format=json"
        logging.info(url)

        response = self.get_with_retries(url)
    
        album_info = None
        if response.status_code == 200:
            album_info = response.json()
            if self.redis_session:
                try:
                    self.redis_session.set(redis_tag, json.dumps(album_info))
                except Exception as e:
                    logging.error(e)
                    pass
        else:
            logging.warning(f"Failed to fetch data from Last.FM: {response.status_code} {response.text}")
            raise HTTPException(status_code=500, detail="Failed to fetch data from Last.FM")
        
        return from_json(album_info) if album_info else None

    def get_album_info(self, artist=None, album=None, mbid=None) -> Optional[Album]:
        if mbid is not None:
            return self.get_album_info_by_mbid(mbid)
        
        if os.getenv("LASTFM_API_KEY") is None:
            raise ValueError("LASTFM_API_KEY environment variable is not set")
        
        pair = AlbumAndArtist(album=album, artist=artist)
        redis_tag = f"albuminfo:{pair}"

        if self.redis_session:
            try:
                cached_info = self.redis_session.get(redis_tag)
                if cached_info is not None:
                    logging.debug(cached_info)
                    return from_json(json.loads(cached_info))
            except Exception as e:
                logging.error(e)
                pass

        matches = self.search_album(artist=pair.artist, title=pair.album, limit=1)
        if not matches:
            return None
        
        match = matches[0]
        encoded_match_title = urllib.parse.quote(match.title)
        encoded_match_artist = urllib.parse.quote(match.artist)
        url = f"http://ws.audioscrobbler.com/2.0/?method=album.getinfo&api_key={os.getenv('LASTFM_API_KEY')}&artist={encoded_match_artist}&album={encoded_match_title}&format=json&autocorrect=1"
        logging.info(url)

        response = self.get_with_retries(url)
    
        album_info = None
        if response.status_code == 200:
            album_info = response.json()
            if self.redis_session:
                try:
                    self.redis_session.set(redis_tag, json.dumps(album_info))
                except Exception as e:
                    logging.error(e)
                    pass
        else:
            logging.warning(f"Failed to fetch data from Last.FM: {response.status_code} {response.text}")
            raise HTTPException(status_code=500, detail="Failed to fetch data from Last.FM")
        
        return from_json(album_info) if album_info else None
