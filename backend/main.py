import os
import pathlib
import logging
import urllib.parse
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
from models import *
import urllib
import requests_cache
from response_models import *

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
                genres=[TrackGenre(parent_type="music_file", genre=genre) for genre in metadata.get("genres", [])],
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

@router.get("/purge")
def purge_data():
    engine = Database.get_engine()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

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
        genres=[g.genre for g in music_file_db.genres] or [],
        last_scanned=music_file_db.last_scanned
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
    
    # Extract just the MusicFileDB objects from results
    return [to_music_file(r.MusicFileDB) for r in results]

@router.post("/playlists", response_model=Playlist)
def create_playlist(playlist: Playlist):
    db = Database.get_session()
    try:
        # Create a new PlaylistDB instance
        db_playlist = PlaylistDB(name=playlist.name)
        db.add(db_playlist)
        db.flush()  # Flush to get the playlist ID
        
        # Add entries to the playlist
        for entry in playlist.entries:
            entry.entry_type = to_entry_type(entry.entry_type)
            
            if entry.entry_type == EntryType.MUSIC_FILE:
                music_file = db.query(MusicFileDB).filter(MusicFileDB.id == entry.music_file_id).first()
                if music_file:
                    db_playlist.entries.append(
                        MusicFileEntryDB(
                            playlist_id=db_playlist.id,
                            music_file_id=music_file.id,
                            order=entry.order,
                            entry_type=EntryType.MUSIC_FILE
                        )
                    )
                else:
                    logging.warning(f"Music file {entry.music_file_id} not found")
                    
            elif entry.entry_type == EntryType.LASTFM:
                last_fm_track = db.query(LastFMTrackDB).filter(LastFMTrackDB.url == entry.url).first()
                if not last_fm_track:
                    last_fm_track = LastFMTrackDB(
                        title=entry.details.title,
                        artist=entry.details.artist,
                        album=entry.details.album,
                        url=entry.url
                    )
                    db.add(last_fm_track)
                    db.flush()
                
                db_playlist.entries.append(
                    LastFMEntryDB(
                        playlist_id=db_playlist.id,
                        lastfm_track_id=last_fm_track.id,
                        order=entry.order,
                        entry_type=EntryType.LASTFM
                    )
                )
                
            elif entry.entry_type == EntryType.NESTED_PLAYLIST:
                nested_playlist = db.query(PlaylistDB).filter(PlaylistDB.id == entry.playlist_id).first()
                if nested_playlist:
                    db_playlist.entries.append(
                        NestedPlaylistEntryDB(
                            playlist_id=db_playlist.id,
                            nested_playlist_id=nested_playlist.id,
                            order=entry.order,
                            entry_type=EntryType.NESTED_PLAYLIST
                        )
                    )
                else:
                    logging.warning(f"Nested playlist {entry.playlist_id} not found")
        
        db.commit()
        
        # Reload the playlist with all relationships for response
        db_playlist = db.query(PlaylistDB).options(
            joinedload(PlaylistDB.entries.of_type(MusicFileEntryDB)).joinedload(MusicFileEntryDB.music_file),
            joinedload(PlaylistDB.entries.of_type(NestedPlaylistEntryDB)).joinedload(NestedPlaylistEntryDB.nested_playlist),
            joinedload(PlaylistDB.entries.of_type(LastFMEntryDB)).joinedload(LastFMEntryDB.details)
        ).filter(PlaylistDB.id == db_playlist.id).first()
        
        return Playlist(
            id=db_playlist.id,
            name=db_playlist.name,
            entries=[convert_entry_to_response(entry) for entry in db_playlist.entries]
        )
        
    except Exception as e:
        db.rollback()
        logging.error(f"Failed to create playlist: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

def to_entry_type(entry_type: str) -> EntryType:
    if entry_type == "music_file":
        return EntryType.MUSIC_FILE
    elif entry_type == "nested_playlist":
        return EntryType.NESTED_PLAYLIST
    elif entry_type == "lastfm":
        return EntryType.LASTFM
    elif entry_type == "requested":
        return EntryType.REQUESTED
    else:
        raise ValueError(f"Unknown entry type: {entry_type}")

def convert_entry_to_response(entry: PlaylistEntryDB) -> PlaylistEntry:
    entry.entry_type = to_entry_type(entry.entry_type)

    base_entry = {
        "id": entry.id,
        "order": entry.order,
        "entry_type": entry.entry_type
    }
    
    if entry.entry_type == EntryType.MUSIC_FILE:
        return MusicFileEntry(
            **base_entry,
            music_file_id=entry.music_file_id,
            details=MusicFile(
                id=entry.music_file.id,
                path=entry.music_file.path,
                kind=entry.music_file.kind,
                last_scanned=entry.music_file.last_scanned,
                title=entry.music_file.title,
                artist=entry.music_file.artist,
                album_artist=entry.music_file.album_artist,
                album=entry.music_file.album,
                year=entry.music_file.year,
                length=entry.music_file.length,
                publisher=entry.music_file.publisher,
                genres=entry.music_file.genres or []
            ) if entry.music_file else None
        )
    elif entry.entry_type == EntryType.NESTED_PLAYLIST:
        return NestedPlaylistEntry(
            **base_entry,
            playlist_id=entry.nested_playlist_id,
            details=PlaylistBase(
                id=entry.nested_playlist.id,
                name=entry.nested_playlist.name
            ) if entry.nested_playlist else None
        )
    elif entry.entry_type == EntryType.LASTFM:
        return LastFMEntry(
            **base_entry,
            url=entry.details.url,
            details=LastFMTrack(
                title=entry.details.title,
                artist=entry.details.artist,
                album=entry.details.album,
                url=entry.details.url
            ) if entry.details.url else None
        )
    elif entry.entry_type == EntryType.REQUESTED:
        return RequestedTrackEntry(
            **base_entry,
            details=TrackDetails(
                title=entry.requested_title,
                artist=entry.requested_artist,
                album=entry.requested_album
            )
        )
    else:
        raise ValueError(f"Unsupported entry type: {entry.entry_type}")
        

@router.get("/playlists", response_model=List[Playlist])
def read_playlists(skip: int = 0, limit: int = 10):
    db = Database.get_session()
    try:
        playlists = db.query(PlaylistDB).options(
            joinedload(PlaylistDB.entries.of_type(MusicFileEntryDB)).joinedload(MusicFileEntryDB.music_file),
            joinedload(PlaylistDB.entries.of_type(NestedPlaylistEntryDB)).joinedload(NestedPlaylistEntryDB.nested_playlist),
            joinedload(PlaylistDB.entries.of_type(RequestedTrackEntryDB))
        ).offset(skip).limit(limit).all()
        
        return [
            Playlist(
                id=playlist.id,
                name=playlist.name,
                entries=[convert_entry_to_response(entry) for entry in playlist.entries]
            ) 
            for playlist in playlists
        ]
    except Exception as e:
        logging.error(f"Failed to read playlists: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to read playlists")
    finally:
        db.close()

@router.get("/playlists/{playlist_id}", response_model=Playlist)
async def get_playlist(playlist_id: int):
    db = Database.get_session()
    try:
        playlist = db.query(PlaylistDB).options(
            joinedload(PlaylistDB.entries.of_type(MusicFileEntryDB)).joinedload(MusicFileEntryDB.music_file),
            joinedload(PlaylistDB.entries.of_type(NestedPlaylistEntryDB)).joinedload(NestedPlaylistEntryDB.nested_playlist),
            joinedload(PlaylistDB.entries.of_type(RequestedTrackEntryDB))
        ).filter(PlaylistDB.id == playlist_id).first()
        
        if not playlist:
            raise HTTPException(status_code=404, detail="Playlist not found")
            
        return Playlist(
            id=playlist.id,
            name=playlist.name,
            entries=[convert_entry_to_response(entry) for entry in playlist.entries]
        )
    except Exception as e:
        logging.error(f"Failed to get playlist: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get playlist")
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
            if to_entry_type(entry.entry_type) == EntryType.MUSIC_FILE:
                music_file = db.query(MusicFileDB).filter(MusicFileDB.id == entry.music_file_id).first()
                if music_file:
                    association = MusicFileEntryDB(playlist_id=playlist_id, music_file_id=music_file.id, order=entry.order, details=entry.details)
                    db.add(association)
                else:
                    logging.warning(f"Music file {entry.music_file_id} not found")
            elif to_entry_type(entry.entry_type) == EntryType.LASTFM:
                association = LastFMEntryDB(playlist_id=playlist_id, lastfm_url=entry.url, order=entry.order, requested_title=entry.title, requested_artist=entry.artist, requested_album=entry.album)
                db.add(association)
            else:
                logging.warning(f"Unsupported entry type: {entry.entry_type}")

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
            joinedload(PlaylistDB.entries.of_type(MusicFileEntryDB)).joinedload(MusicFileEntryDB.music_file),
            joinedload(PlaylistDB.entries.of_type(NestedPlaylistEntryDB)).joinedload(NestedPlaylistEntryDB.nested_playlist),
            joinedload(PlaylistDB.entries.of_type(RequestedTrackEntryDB))
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
            title=track.get('name', ''),
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