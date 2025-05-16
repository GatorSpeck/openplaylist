import os
import pathlib
import logging
from fastapi import FastAPI, Query, APIRouter, Request, Depends, BackgroundTasks
import uvicorn
from mutagen.easyid3 import EasyID3
from mutagen.flac import FLAC
from mutagen.wave import WAVE
from mutagen.mp4 import MP4
from mutagen import File as MutagenFile
import dotenv
from typing import Optional, List, Callable
import time
from tqdm import tqdm
from datetime import datetime
from fastapi.exceptions import HTTPException, RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from sqlalchemy import func
from starlette.middleware.base import BaseHTTPMiddleware
from database import Database
from models import *
import urllib
from response_models import *
from dependencies import get_music_file_repository, get_playlist_repository, get_plex_repository
from repositories.music_file import MusicFileRepository
from repositories.playlist import PlaylistRepository
from repositories.open_ai_repository import open_ai_repository
from repositories.last_fm_repository import last_fm_repository
from repositories.requests_cache_session import requests_cache_session
from repositories.spotify_repository import get_spotify_repo
from repositories.plex_repository import plex_repository
from redis import Redis
import json
from pydantic import BaseModel
import sys
from routes import router

class TimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable):
        start_time = time.time()
        
        # Get query parameters as dict
        params = dict(request.query_params)

        logging.info(
                f"{request.method} {request.url.path} "
                f"params={params}"
            )
        
        try:
            response = await call_next(request)
            status_code = response.status_code
        except Exception as e:
            status_code = 500
            raise e
        finally:
            duration = time.time() - start_time
            logging.info(
                f"{request.method} {request.url.path} "
                f"params={params} "
                f"status={status_code} "
                f"duration={duration:.3f}s"
            )
            
        return response

app = FastAPI()

app.add_middleware(TimingMiddleware)

dotenv.load_dotenv(override=True)

# read log level from environment variable
log_level = os.getenv("LOG_LEVEL", "INFO").upper()

# Set up logging
logging.basicConfig(
    level=log_level,
    format='%(asctime)s.%(msecs)03d - %(levelname)s - %(name)s:%(filename)s:%(lineno)d - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

ALLOW_ORIGINS = [origin.strip() for origin in os.getenv("ALLOW_ORIGINS", "http://localhost:80").split(",")]

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOW_ORIGINS + ["null", ""],
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Create the database tables
Base.metadata.create_all(bind=Database.get_engine())

SUPPORTED_FILETYPES = (".mp3", ".flac", ".wav", ".ogg", ".m4a")

redis_session = None
REDIS_HOST = os.getenv("REDIS_HOST", None)
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
if REDIS_HOST and REDIS_PORT:
    redis_session = Redis(host=REDIS_HOST, port=REDIS_PORT, db=0, decode_responses=True)

CONFIG_DIR = pathlib.Path(os.getenv("CONFIG_DIR", "/config"))

def extract_tag(dict, options, squash_list=True, to_string=True):
    for option in options:
        result = dict.get(option, None)
        if result is not None:
            while squash_list and (isinstance(result, list) or isinstance(result, tuple)):
                result = result[0]

            if to_string:
                result = str(result)
                
            return result
        
    return None

def extract_m4a(file_path) -> Optional[MusicFile]:
    try:
        audio = MP4(file_path)
        result = MusicFile(
            path=file_path,
            title=extract_tag(audio, ["\xa9nam"]),  # this is required
            artist=extract_tag(audio, ["\xa9ART"]),
            album=extract_tag(audio, ["\xa9alb"]),
            album_artist=extract_tag(audio, ["aART"]),
            year=extract_tag(audio, ["\xa9day"]),
            length=None,
            publisher=None,
            kind="M4A",
            genres=extract_tag(audio, ["\xa9gen"], squash_list=False, to_string=False) or list(),
            track_number=try_parse_int(extract_tag(audio, ["trkn"])),
            disc_number=try_parse_int(extract_tag(audio, ["disk"])),
            rating=None,
            comments=extract_tag(audio, ["\xa9cmt"])
        )
        
        return result
    except Exception as e:
        exc_type, exc_obj, exc_tb = sys.exc_info()
        logging.error(f"Failed to read metadata for {file_path}: {e}")
        logging.error(f"{exc_type} {exc_tb.tb_lineno}")

    return None

def extract_metadata(file_path, extractor) -> Optional[MusicFile]:
    try:
        audio = extractor(file_path)
        result = MusicFile(
            path=file_path,
            title=extract_tag(audio, ["title", "TIT2"]),  # this is required
            artist=extract_tag(audio, ["artist", "TPE2"]),
            album=extract_tag(audio, ["album", "TALB"]),
            album_artist=extract_tag(audio, ["albumartist"]),
            year=extract_tag(audio, ["date"]),
            length=int(audio.info.length) if hasattr(audio, "info") else None,
            publisher=extract_tag(audio, ["organization"]),
            kind=audio.mime[0] if hasattr(audio, "mime") else None,
            genres=extract_tag(audio, ["genre"], squash_list=False, to_string=False) or list(),
            track_number=try_parse_int(extract_tag(audio, ["tracknumber"])),
            disc_number=try_parse_int(extract_tag(audio, ["discnumber"])),
            rating=extract_tag(audio, ["rating"]),
            comments=extract_tag(audio, ["comment"])
        )
        
        return result
    except Exception as e:
        exc_type, exc_obj, exc_tb = sys.exc_info()
        logging.error(f"Failed to read metadata for {file_path}: {e}")
        logging.error(f"{exc_type} {exc_tb.tb_lineno}")

    return None

# singleton
scan_results = ScanResults()

def scan_directory(directory: str, full=False):
    directory = pathlib.Path(directory)
    if not directory.exists():
        logging.error(f"Directory {directory} does not exist")
        return
    
    if scan_results.in_progress:
        return
    
    scan_results.in_progress = True
    scan_results.files_missing = 0
    scan_results.files_updated = 0

    logging.info(f"Scanning directory {directory}, full={full}")
    start_time = time.time()

    # read directory paths from config file
    all_files = []
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r") as f:
            config = json.load(f)
            music_paths = config.get("music_paths", [])
            if music_paths:
                logging.info(f"Found {len(music_paths)} music paths in config file")
                for path in music_paths:
                    for root, _, files in os.walk(path):
                        for file in files:
                            all_files.append(os.path.join(root, file))

    db = Database.get_session()

    albums_and_artists_seen = {}

    files_seen = 0
    total_files = float(len(all_files))
    ops = 0
    for full_path in tqdm(all_files, desc="Scanning files"):
        try:
            files_seen += 1
            scan_results.progress = round(files_seen / total_files * 100, 1)

            if not full_path.lower().endswith(SUPPORTED_FILETYPES):
                continue

            last_modified_time = datetime.fromtimestamp(os.path.getmtime(full_path))
            existing_file = (
                db.query(MusicFileDB).filter(MusicFileDB.path == full_path).first()
            )

            found_existing_file = False
            if existing_file and existing_file.missing:
                found_existing_file = True
                existing_file.missing = False

            if (not full) and (not found_existing_file) and existing_file and existing_file.last_scanned and existing_file.last_scanned >= last_modified_time:
                continue  # Skip files that have not changed

            metadata = None

            try:
                if full_path.lower().endswith(".mp3"):
                    metadata = extract_metadata(full_path, EasyID3)
                elif full_path.lower().endswith(".flac"):
                    metadata = extract_metadata(full_path, FLAC)
                elif full_path.lower().endswith(".wav"):
                    metadata = extract_metadata(full_path, WAVE)
                elif full_path.lower().endswith(".m4a"):
                    metadata = extract_m4a(full_path)
                else:
                    metadata = extract_metadata(full_path, MutagenFile)
            except Exception as e:
                logging.error(f"Failed to read metadata for {full_path}: {e}", exc_info=True)
                continue

            if not metadata:
                logging.warning(f"Failed to read metadata for {full_path}")
                continue

            file_size = os.path.getsize(full_path)

            year = metadata.year
            release_year = None
            exact_release_date = None

            # try to infer the exact release date
            if year:
                if len(year) > 4:
                    try:
                        exact_release_date = datetime.strptime(year, "%Y-%m-%d")
                        release_year = exact_release_date.year
                        exact_release_date = exact_release_date
                    except ValueError:
                        pass
                elif len(year) == 4:
                    release_year = int(year)
            
            album = None

            # create album entry if applicable
            if metadata.album and metadata.get_album_artist():
                album_and_artist = AlbumAndArtist(album=metadata.album, artist=metadata.get_album_artist())
                album = albums_and_artists_seen.get(album_and_artist)
                if not album:
                    album = AlbumDB(
                        artist=metadata.get_album_artist(),
                        title=metadata.album,
                        year=exact_release_date if exact_release_date else release_year,
                        tracks = []
                    )
                    db.add(album)
                    db.flush()
                    albums_and_artists_seen[album_and_artist] = album

            # Update or add the file in the database
            if existing_file:
                scan_results.files_updated += 1

                existing_file.last_modified = last_modified_time
                existing_file.title = metadata.title
                existing_file.artist = metadata.artist
                existing_file.album = metadata.album
                existing_file.album_artist = metadata.album_artist
                existing_file.year = year
                existing_file.length = metadata.length
                existing_file.publisher = metadata.publisher
                existing_file.kind = metadata.kind
                existing_file.last_scanned = datetime.now()
                existing_file.exact_release_date = exact_release_date
                existing_file.release_year = release_year
                existing_file.size = file_size
                existing_file.rating = metadata.rating
                existing_file.genres = [
                    TrackGenreDB(parent_type="music_file", genre=genre)
                    for genre in metadata.genres
                ]
                existing_file.comments = metadata.comments
                existing_file.track_number = metadata.track_number
                existing_file.disc_number = metadata.disc_number
            else:
                scan_results.files_indexed += 1
                scan_results.files_added += 1

                this_track = metadata.to_db()

                db.add(this_track)

                if album is not None:
                    db.flush()
                    album.tracks.append(AlbumTrackDB(linked_track_id=this_track.id, order=len(album.tracks)))
            
            ops += 1
            if ops > 100:
                db.commit()
                ops = 0
        
        except Exception as e:
            logging.error(f"Failed to scan file {full_path}: {e}", exc_info=True)

    db.commit()
    db.close()

    scan_results.in_progress = False

@router.get("/purge")
def purge_data():
    engine = Database.get_engine()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


@router.get("/scan")
def scan(background_tasks: BackgroundTasks):
    background_tasks.add_task(scan_directory, os.getenv("MUSIC_PATH", "/music"), full=False)
    background_tasks.add_task(prune_music_files)

    return HTTPException(status_code=202, detail="Scan started")

@router.get("/fullscan")
def full_scan(background_tasks: BackgroundTasks):
    background_tasks.add_task(scan_directory, os.getenv("MUSIC_PATH", "/music"), full=True)
    background_tasks.add_task(prune_music_files)

    return HTTPException(status_code=202, detail="Scan started")

@router.get("/scan/progress", response_model=ScanResults)
def scan_progress():
    return scan_results

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
        if (not existing_file.missing) and not pathlib.Path(existing_file.path).exists():
            prunes += 1
            logging.debug(
                f"Marking nonexistent music file {existing_file.path} as missing"
            )

            existing_file.last_scanned = datetime.now()
            existing_file.missing = True

    if prunes:
        logging.info(f"Pruned {prunes} music files from the database")

    db.commit()
    db.close()

    return {
        "files_missing": prunes
    }


@router.get("/filter", response_model=List[MusicFile])
def filter_music_files(
    title: Optional[str] = None,
    artist: Optional[str] = None,
    album: Optional[str] = None,
    genre: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    repo: MusicFileRepository = Depends(get_music_file_repository),
):
    return repo.filter(
        title=title, artist=artist, album=album, genre=genre, offset=offset, limit=limit
    )


@router.get("/search", response_model=List[MusicFile])
def search_music_files(
    query: str = Query(..., min_length=1),
    limit: int = 50,
    offset: int = 0,
    repo: MusicFileRepository = Depends(get_music_file_repository),
):
    return repo.search(query=query, limit=limit, offset=offset)

@router.get("/stats", response_model=LibraryStats)
async def get_stats():
    db = Database.get_session()
    track_count = db.query(MusicFileDB).count()
    album_count = db.query(MusicFileDB.album).distinct().count()
    artist_count = db.query(MusicFileDB.artist).distinct().count()
    total_length = db.query(func.sum(MusicFileDB.length)).first()[0]
    missing_tracks = db.query(MusicFileDB).filter(MusicFileDB.missing == True).count()

    return LibraryStats(
        trackCount=track_count,
        albumCount=album_count,
        artistCount=artist_count,
        totalLength=total_length if total_length else 0,
        missingTracks=missing_tracks
    )

@router.post("/library/findlocals")
def find_local_files(tracks: List[TrackDetails], repo: MusicFileRepository = Depends(get_music_file_repository)):
    return repo.find_local_files(tracks)

@router.get("/lastfm", response_model=List[LastFMTrack])
def get_lastfm_track(title: str = Query(...), artist: str = Query(...)):
    api_key = os.getenv("LASTFM_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Last.FM API key not configured")

    repo = last_fm_repository(api_key, requests_cache_session)
    return repo.search_track(title=title, artist=artist)

# get similar tracks using last.fm API
@router.get("/lastfm/similar", response_model=List[LastFMTrack])
def get_similar_tracks(title: str = Query(...), artist: str = Query(...)):
    api_key = os.getenv("LASTFM_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Last.FM API key not configured")

    repo = last_fm_repository(api_key, requests_cache_session)
    return repo.get_similar_tracks(artist, title)

@router.get("/lastfm/albumart")
def get_album_art(artist: str = Query(...), album: str = Query(...)):
    api_key = os.getenv("LASTFM_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Last.FM API key not configured")

    repo = last_fm_repository(api_key, requests_cache_session, redis_session=redis_session)
    return repo.get_album_art(artist, album)

@router.get("/lastfm/album/info", response_model=Optional[Album])
def get_album_info(artist: str = Query(...), album: str = Query(...)):
    api_key = os.getenv("LASTFM_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Last.FM API key not configured")

    repo = last_fm_repository(api_key, requests_cache_session, redis_session=redis_session)
    return repo.get_album_info(artist, album)

@router.get("/lastfm/album/search", response_model=List[Album])
def search_album(album: str = Query(...), artist: Optional[str] = Query(None), ):
    api_key = os.getenv("LASTFM_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Last.FM API key not configured")

    repo = last_fm_repository(api_key, requests_cache_session)
    return repo.search_album(artist=artist, title=album)

# get similar tracks
@router.get("/openai/similar")
def get_similar_tracks_with_openai(title: str = Query(...), artist: str = Query(...)):
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")
    
    repo = open_ai_repository(api_key)

    return repo.get_similar_tracks(artist, title)

def dump_library_to_playlist(playlist: Playlist, repo: PlaylistRepository, music_files: MusicFileRepository):
    music_files.dump_library_to_playlist(playlist, repo)
    logging.info("Finished playlist dump")

@router.get("/testing/dumpLibrary/{playlistID}")
def dump_library(
    playlistID: int,
    repo: PlaylistRepository = Depends(get_playlist_repository),
    music_files: MusicFileRepository = Depends(get_music_file_repository),
    background_tasks: BackgroundTasks = None
):
    playlist = repo.get_by_id(playlistID)

    background_tasks.add_task(dump_library_to_playlist, playlist, repo, music_files)

@app.get("/api/music-files")
async def get_music_files(
    repo: MusicFileRepository = Depends(get_music_file_repository),
):
    return repo.get_all()

@app.get("/api/artistlist")
async def get_artist_list(
    repo: MusicFileRepository = Depends(get_music_file_repository),
):
    return repo.get_artist_list()

@app.get("/api/albumlist")
async def get_album_list(
    artist: str | None = None,
    repo: MusicFileRepository = Depends(get_music_file_repository),
):
    return repo.get_album_list(artist)

CONFIG_FILE = CONFIG_DIR / "config.json"

@router.get("/settings/paths")
def get_index_paths():
    """Get configured music indexing paths"""
    if not os.path.exists(CONFIG_FILE):
        return []
    with open(CONFIG_FILE, 'r') as f:
        config = json.load(f)
    return config.get('music_paths', [])

@router.post("/settings/paths")
def save_index_paths(paths: List[str]):
    """Save configured music indexing paths"""
    with open(CONFIG_FILE, 'w') as f:
        json.dump({'music_paths': paths}, f)
    return {"success": True}

@router.get("/settings")
def get_settings():
    return {
        "lastFmApiKeyConfigured": all([os.getenv("LASTFM_API_KEY"), os.getenv("LASTFM_SHARED_SECRET")]),
        "openAiApiKeyConfigured": os.getenv("OPENAI_API_KEY") is not None,
        "plexConfigured": all([os.getenv("PLEX_TOKEN"), os.getenv("PLEX_ENDPOINT"), os.getenv("PLEX_LIBRARY")]),
        "spotifyConfigured": all([os.getenv("SPOTIFY_CLIENT_ID"), os.getenv("SPOTIFY_CLIENT_SECRET")]),
        "redisConfigured": redis_session is not None,
        "configDir": str(CONFIG_DIR),
        "logLevel": log_level,
    }

@router.post("/spotify/import")
def import_spotify_playlist(
    params: SpotifyImportParams,
    playlist_repo: PlaylistRepository = Depends(get_playlist_repository)
):
    spotify_repo = get_spotify_repo(requests_cache_session)
    if not spotify_repo:
        raise HTTPException(status_code=500, detail="Spotify API key not configured")
    
    playlist = spotify_repo.get_playlist(params.playlist_id)

    new_playlist = Playlist(name=params.playlist_name, description=playlist.description, entries=[])
    for t in playlist.tracks:
        track = RequestedTrackEntry(
            entry_type="requested",
            details=TrackDetails(
                title=t.title,
                artist=t.artist,
                album=t.album,
            )
        )
        new_playlist.entries.append(track)

    playlist_repo.create(new_playlist)

    return playlist

@router.post("/plex/import")
def import_plex_playlist(
    params: PlexImportParams,
    plex_repo: plex_repository = Depends(get_plex_repository),
    playlist_repo: PlaylistRepository = Depends(get_playlist_repository)
):
    new_playlist = Playlist(name=params.playlist_name, description=None, entries=[])
    new_playlist = playlist_repo.create(new_playlist)

    logging.info("Creating Plex playlist snapshot")
    playlist = plex_repo.get_playlist_snapshot(params.remote_playlist_name)

    logging.info("Populating new playlist")
    playlist_repo.add_music_file(new_playlist.id, playlist.items)
    
    return new_playlist

class Directory(BaseModel):
    name: str
    path: str

class DirectoryListResponse(BaseModel):
    current_path: str
    directories: List[Directory]

@router.get("/browse/directories", response_model=DirectoryListResponse)
def browse_directories(current_path: Optional[str] = Query(None)):
    """Browse filesystem directories"""
    # Default to cwd if no path is provided
    if not current_path:
        current_path = str(pathlib.Path.cwd())
    
    # Validate the path exists
    if not os.path.exists(current_path):
        current_path = str(pathlib.Path.cwd())
    
    directories = []
    
    try:
        # List all directories in the current path
        for item in os.listdir(current_path):
            full_path = os.path.join(current_path, item)
            if os.path.isdir(full_path):
                directories.append(Directory(
                    name=item,
                    path=full_path
                ))
                
        # Sort directories alphabetically
        directories.sort(key=lambda x: x.name.lower())
                
    except PermissionError:
        # Handle permission errors gracefully
        pass
    
    return DirectoryListResponse(
        current_path=current_path,
        directories=directories
    )

@router.get("/health")
def health_check():
    return {"status": "ok"}

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
    logging.info(f"Allowed origins: {ALLOW_ORIGINS}")
    
    music_path = os.getenv("MUSIC_PATH", "/music")
    if not pathlib.Path(music_path).exists():
        logging.warning(f"Music path {music_path} does not exist")

    uvicorn.run("main:app", host=host, port=port, reload=True)
