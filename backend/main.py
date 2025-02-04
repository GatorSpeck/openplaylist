import os
import pathlib
import logging
import urllib.parse
from pydantic import BaseModel
from fastapi import FastAPI, Query, APIRouter, Request
import uvicorn
from mutagen.easyid3 import EasyID3
from mutagen.flac import FLAC
from sqlalchemy import text, or_
import dotenv
from typing import Optional, List
import time
from tqdm import tqdm
from datetime import datetime
from fastapi.exceptions import HTTPException, RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import joinedload
from fastapi.responses import StreamingResponse
import io
from database import Database
from models import MusicFileDB, PlaylistDB, PlaylistEntryDB, Base
import urllib
import requests
import requests_cache

app = FastAPI()

requests_cache_session = requests_cache.CachedSession("lastfm_cache", backend="memory", expire_after=3600)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

dotenv.load_dotenv(override=True)

# read log level from environment variable
log_level = os.getenv("LOG_LEVEL", "INFO").upper()

# Set up logging
logging.basicConfig(level=log_level)

# Create the database tables
Base.metadata.create_all(bind=Database.get_engine())

# Simple model for a music file
class MusicFile(BaseModel):
    id: Optional[int] = None
    path: str
    title: str
    artist: Optional[str] = None
    album_artist: Optional[str] = None
    album: Optional[str] = None
    year: Optional[str] = None
    length: Optional[int] = None
    publisher: Optional[str] = None
    kind: Optional[str] = None
    genres: List[str] = []

class PlaylistEntry(BaseModel):
    order: int
    music_file_id: int
    music_file_details: Optional[MusicFile] = None

class Playlist(BaseModel):
    id: Optional[int] = None
    name: str
    entries: List[PlaylistEntry] = []

class SearchQuery(BaseModel):
    full_search: Optional[str] = None  # title, artist, and album are scored
    album: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    limit: Optional[int] = 50

class LastFMTrack(BaseModel):
    name: str
    artist: str
    url: str | None = None

SUPPORTED_FILETYPES = (".mp3", ".flac", ".wav", ".ogg", ".m4a")

def extract_metadata(file_path, extractor):
    try:
        audio = extractor(file_path)
        result = {
            'title': audio.get('title', [None])[0],
            'artist': audio.get('artist', [None])[0],
            'album': audio.get('album', [None])[0],
            'album_artist': audio.get('albumartist', [None])[0],
            'year': audio.get('date', [None])[0],
            'length': int(audio.info.length),
            'publisher': audio.get('organization', [None])[0],
            'kind': audio.mime[0] if hasattr(audio, 'mime') else None,
            'genres': audio.get('genre', list())
        }
        return result
    except Exception as e:
        logging.error(f"Failed to read metadata for {file_path}: {e}")

    return {}

def scan_directory(directory: str):
    directory = pathlib.Path(directory)
    if not directory.exists():
        logging.error(f"Directory {directory} does not exist")
        return []

    logging.info(f"Scanning directory {directory}")
    start_time = time.time()
    new_adds = 0

    # Get a list of all files in the directory
    all_files = [os.path.join(root, file) for root, _, files in os.walk(directory) for file in files]

    db = Database.get_session()

    files_seen = 0
    files_skipped = 0
    for full_path in tqdm(all_files, desc="Scanning files"):
        if not full_path.lower().endswith(SUPPORTED_FILETYPES):
            continue

        files_seen += 1
        last_modified_time = datetime.fromtimestamp(os.path.getmtime(full_path))
        existing_file = db.query(MusicFileDB).filter(MusicFileDB.path == full_path).first()

        if existing_file and existing_file.last_scanned >= last_modified_time:
            files_skipped += 1
            continue  # Skip files that have not changed
        
        metadata = {}

        if full_path.lower().endswith('.mp3'):
            metadata = extract_metadata(full_path, EasyID3)
        elif full_path.lower().endswith('.flac'):
            metadata = extract_metadata(full_path, FLAC)
        else:
            logging.debug(f"Skipping file {full_path} with unsupported file type")
            continue

        if not metadata:
            continue

        # Update or add the file in the database
        if existing_file:
            existing_file.last_modified = last_modified_time
            files_skipped += 1
        else:
            new_adds += 1
            db.add(MusicFileDB(
                path=full_path,
                title=metadata.get('title'),
                artist=metadata.get('artist'),
                album=metadata.get('album'),
                genres=metadata.get("genres"),
                album_artist=metadata.get('album_artist'),
                year=metadata.get('year'),
                length=metadata.get('length'),
                publisher=metadata.get('publisher'),
                kind=metadata.get('kind'),
                last_scanned=last_modified_time
            ))

    logging.info(f"Scanned {files_skipped + new_adds} music files ({files_skipped} existing, {new_adds} new) in {time.time() - start_time:.2f} seconds")

    db.commit()
    db.close()   

router = APIRouter()

@router.get("/scan")
def scan():
    scan_directory(os.getenv("MUSIC_PATH", "/music"))

@router.get("/fullscan")
def full_scan():
    drop_music_files()
    scan_directory(os.getenv("MUSIC_PATH", "/music"))
    prune_music_files()

def drop_music_files():
    db = Database.get_session()
    files = db.query(MusicFileDB).all()
    for f in files:
        db.delete(f)

    db.commit()
    db.close()

def prune_music_files():
    db = Database.get_session()
    existing_files = db.query(MusicFileDB).all()

    prunes = 0
    for existing_file in existing_files:
        if not pathlib.Path(existing_file.path).exists():
            prunes += 1
            logging.debug(f"Removing nonexistent music file {existing_file.path} from the database")
            db.delete(existing_file)
    
    if prunes:
        logging.info(f"Pruned {prunes} music files from the database")

    db.commit()
    db.close()

def to_music_file(music_file_db: MusicFileDB) -> MusicFile:
    return MusicFile(
        id=music_file_db.id,
        path=music_file_db.path,
        title=music_file_db.title,
        artist=music_file_db.artist,
        album_artist=music_file_db.album_artist,
        album=music_file_db.album,
        year=music_file_db.year,
        length=music_file_db.length,
        publisher=music_file_db.publisher,
        kind=music_file_db.kind,
        genres=music_file_db.genres or []
    )

@router.get("/filter", response_model=List[MusicFile])
def filter_music_files(
    title: Optional[str] = None,
    artist: Optional[str] = None,
    album: Optional[str] = None,
    genre: Optional[str] = None,
    limit: int = 50
):
    db = Database.get_session()
    query = db.query(MusicFileDB)

    if title:
        query = query.filter(MusicFileDB.title.ilike(f"%{title}%"))
    if artist:
        query = query.filter(MusicFileDB.artist.ilike(f"%{artist}%"))
    if album:
        query = query.filter(MusicFileDB.album.ilike(f"%{album}%"))
    if genre:
        query = query.filter(MusicFileDB.genres.any(genre))

    results = query.limit(limit).all()
    db.close()
    
    return [to_music_file(music_file) for music_file in results]

@router.get("/search", response_model=List[MusicFile])
def search_music_files(query: str = Query(..., min_length=1), limit: int = 50):
    query_package = SearchQuery(full_search=query, limit=limit)
    db = Database.get_session()
    start_time = time.time()
    
    search_query = urllib.parse.unquote(query_package.full_search or "")
    tokens = search_query.split()
    
    # Build scoring expression
    scoring = """
        CASE
            -- Exact title match (highest priority)
            WHEN lower(title) = lower(:token) THEN 100
            -- Title starts with token
            WHEN lower(title) LIKE lower(:token || '%') THEN 75
            -- Title contains token
            WHEN lower(title) LIKE lower('%' || :token || '%') THEN 50
            -- Artist exact match
            WHEN lower(artist) = lower(:token) THEN 40
            -- Artist contains token
            WHEN lower(artist) LIKE lower('%' || :token || '%') THEN 30
            -- Album exact match
            WHEN lower(album) = lower(:token) THEN 20
            -- Album contains token
            WHEN lower(album) LIKE lower('%' || :token || '%') THEN 10
            ELSE 0
        END
    """
    
    # Add score for each token
    score_sum = "+".join([scoring.replace(":token", f":token{i}") 
                         for i in range(len(tokens))])
    
    # Build query with scoring
    query = db.query(
        MusicFileDB,
        text(f"({score_sum}) as relevance")
    )
    
    # Add token parameters
    for i, token in enumerate(tokens):
        query = query.params({f"token{i}": token})
        
        # Filter to only include results matching at least one token
        query = query.filter(or_(
            MusicFileDB.title.ilike(f"%{token}%"),
            MusicFileDB.artist.ilike(f"%{token}%"), 
            MusicFileDB.album.ilike(f"%{token}%")
        ))
    
    # Order by relevance score
    results = query.order_by(text("relevance DESC")).limit(query_package.limit).all()
    
    logging.info(f"Search query: {search_query} returned {len(results)} results in {time.time() - start_time:.2f} seconds")

    db.close()
    
    # Extract just the MusicFileDB objects from results
    return [r[0] for r in results]

@router.post("/playlists", response_model=Playlist)
def create_playlist(playlist: Playlist):
    db = Database.get_session()
    try:
        # Create a new PlaylistDB instance
        db_playlist = PlaylistDB(name=playlist.name, entries=[])
        
        # Add music files to the playlist
        for entry in playlist.entries:
            music_file = db.query(MusicFileDB).filter(MusicFileDB.id == entry.music_file_id).first()
            if music_file:
                db_playlist.entries.append(PlaylistEntryDB(playlist_id=db_playlist.id, music_file_id=music_file.id, order=entry.order))
            else:
                logging.warning(f"Music file {entry.music_file_id} not found")
        
        # Add the new playlist to the database
        db.add(db_playlist)
        db.commit()
        db.refresh(db_playlist)
        
        # Eagerly load the entries relationship
        db_playlist = db.query(PlaylistDB).options(joinedload(PlaylistDB.entries)).filter(PlaylistDB.id == db_playlist.id).first()
    except Exception as e:
        db.rollback()
        logging.error(f"Failed to create playlist: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create playlist")
    finally:
        db.close()
    
    return db_playlist

@router.get("/playlists", response_model=List[Playlist])
def read_playlists(skip: int = 0, limit: int = 10):
    db = Database.get_session()
    try:
        playlists = db.query(PlaylistDB).options(joinedload(PlaylistDB.entries)).all()
        filtered_playlists = []
        for playlist in playlists:
            filtered_entries = [
                entry for entry in playlist.entries if entry.music_file_id is not None
            ]
            filtered_playlists.append(
                Playlist(
                    id=playlist.id,
                    name=playlist.name,
                    entries=[
                        PlaylistEntry(
                            order=entry.order,
                            music_file_id=entry.music_file_id,
                            music_file_details=to_music_file(entry.music_file)
                        ) for entry in filtered_entries
                    ]
                )
            )
    except Exception as e:
        logging.error(f"Failed to read playlists: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to read playlists")
    finally:
        db.close()
    return filtered_playlists

@router.get("/playlists/{playlist_id}", response_model=Playlist)
def get_playlist(playlist_id: int):
    db = Database.get_session()
    try:
        # Load playlist with all related data
        playlist = db.query(PlaylistDB).options(
            joinedload(PlaylistDB.entries)
            .joinedload(PlaylistEntryDB.music_file)
        ).filter(PlaylistDB.id == playlist_id).first()
        
        if playlist is None:
            raise HTTPException(status_code=404, detail="Playlist not found")

        # Map all fields to response
        playlist_entries = [
            PlaylistEntry(
                order=entry.order,
                music_file_id=entry.music_file.id,
                music_file_details=to_music_file(entry.music_file)
            ) for entry in playlist.entries
        ]
        
        return Playlist(
            id=playlist.id,
            name=playlist.name,
            entries=playlist_entries
        )
    except Exception as e:
        logging.error(f"Failed to fetch playlist: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch playlist")
    finally:
        db.close()

@router.put("/playlists/{playlist_id}", response_model=Playlist)
def update_playlist(playlist_id: int, playlist: Playlist):
    db = Database.get_session()
    try:
        db_playlist = db.query(PlaylistDB).options(joinedload(PlaylistDB.entries)).filter(PlaylistDB.id == playlist_id).first()
        if db_playlist is None:
            raise HTTPException(status_code=404, detail="Playlist not found")

        # Clear existing associations
        db.query(PlaylistEntryDB).filter(PlaylistEntryDB.playlist_id == playlist_id).delete()

        # Add new associations with updated order
        for entry in playlist.entries:
            logging.debug(entry)
            music_file = db.query(MusicFileDB).filter(MusicFileDB.id == entry.music_file_id).first()
            if music_file:
                association = PlaylistEntryDB(playlist_id=playlist_id, music_file_id=music_file.id, order=entry.order)
                db.add(association)
            else:
                logging.warning(f"Music file {entry.music_file_id} not found")

        db.commit()
        db.refresh(db_playlist)

        # Eagerly load the entries relationship
        db_playlist = db.query(PlaylistDB).options(joinedload(PlaylistDB.entries)).filter(PlaylistDB.id == db_playlist.id).first()

        entries = db.query(PlaylistEntryDB).join(MusicFileDB).filter(PlaylistEntryDB.playlist_id == playlist_id).all()
        playlist_entries = [
            PlaylistEntry(
                order=entry.order,
                music_file_id=entry.music_file_id,
                music_file_details=to_music_file(entry.music_file)
            ) for entry in entries
        ]
    except Exception as e:
        logging.error(f"Failed to update playlist: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update playlist")
    finally:
        db.close()
    return Playlist(
        id=db_playlist.id,
        name=db_playlist.name,
        entries=playlist_entries
    )

@router.delete("/playlists/{playlist_id}")
def delete_playlist(playlist_id: int):
    db = Database.get_session()
    try:
        playlist = db.query(PlaylistDB).options(joinedload(PlaylistDB.entries)).filter(PlaylistDB.id == playlist_id).first()
        if playlist is None:
            raise HTTPException(status_code=404, detail="Playlist not found")
        db.delete(playlist)
        db.commit()
    except Exception as e:
        db.rollback()
        logging.error(f"Failed to delete playlist: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to delete playlist")
    finally:
        db.close()
    return {"detail": "Playlist deleted successfully"}

@router.get("/playlists/{playlist_id}/export", response_class=StreamingResponse)
def export_playlist(playlist_id: int):
    db = Database.get_session()
    try:
        playlist = db.query(PlaylistDB).options(joinedload(PlaylistDB.entries)).filter(PlaylistDB.id == playlist_id).first()
        if playlist is None:
            raise HTTPException(status_code=404, detail="Playlist not found")

        # Generate the .m3u content
        m3u_content = "#EXTM3U\n"
        for entry in playlist.entries:
            music_file = entry.music_file
            m3u_content += f"#EXTINF:{entry.order},{music_file.title} - {music_file.artist}\n"
            m3u_content += f"{music_file.path}\n"

        # Create a StreamingResponse to return the .m3u file
        response = StreamingResponse(io.StringIO(m3u_content), media_type="audio/x-mpegurl")
        response.headers["Content-Disposition"] = f"attachment; filename={playlist.name}.m3u"
        return response
    except Exception as e:
        logging.error(f"Failed to export playlist: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to export playlist")
    finally:
        db.close()

@router.get("/api/playlists/{playlist_id}")
def get_playlist(playlist_id: int):
    db = Database.get_session()
    try:
        playlist = db.query(PlaylistDB).options(
            joinedload(PlaylistDB.entries).joinedload(PlaylistEntryDB.music_file)
        ).filter(PlaylistDB.id == playlist_id).first()
        
        if playlist is None:
            raise HTTPException(status_code=404, detail="Playlist not found")
            
        return {
            "id": playlist.id,
            "name": playlist.name,
            "entries": [to_music_file(entry.music_file) for entry in playlist.entries]
        }
    finally:
        db.close()

@router.get("/lastfm", response_model=LastFMTrack | None)
def get_lastfm_track(title: str = Query(...), artist: str = Query(...)):
    api_key = os.getenv("LASTFM_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Last.FM API key not configured")

    # URL encode parameters
    encoded_title = urllib.parse.quote(title)
    encoded_artist = urllib.parse.quote(artist)

    # Make request to Last.FM API
    url = f"http://ws.audioscrobbler.com/2.0/?method=track.search&track={encoded_title}&artist={encoded_artist}&api_key={api_key}&format=json&limit=1"
    response = requests_cache_session.get(url)
    
    if response.status_code != 200:
        raise HTTPException(status_code=500, detail="Failed to fetch data from Last.FM")

    data = response.json()
    tracks = data.get('results', {}).get('trackmatches', {}).get('track', [])
    
    # Return first matching track
    if tracks:
        track = tracks[0]
        return LastFMTrack(
            name=track.get('name', ''),
            artist=track.get('artist', ''),
            url=track.get('url')
        )
    
    return None

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logging.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logging.error(f"Validation error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=422,
        content=jsonable_encoder({"detail": exc.errors()}),
    )

app.include_router(router, prefix="/api")

host = os.getenv("HOST", "0.0.0.0")
port = int(os.getenv("PORT", 3000))

if __name__ == "__main__":
    uvicorn.run("main:app", host=host, port=port, reload=True)