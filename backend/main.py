import os
import pathlib
import logging
import urllib.parse
from fastapi import FastAPI, Query, APIRouter, Request, Depends
import uvicorn
from mutagen.easyid3 import EasyID3
from mutagen.flac import FLAC
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
from sqlalchemy.orm import joinedload
from fastapi.responses import StreamingResponse
from starlette.middleware.base import BaseHTTPMiddleware
import io
from database import Database
from models import *
import urllib
import requests_cache
from response_models import *
from dependencies import get_music_file_repository, get_playlist_repository
from repositories.music_file import MusicFileRepository
from repositories.playlist import PlaylistRepository
from repositories.open_ai_repository import open_ai_repository
from repositories.last_fm_repository import last_fm_repository
from plexapi.server import PlexServer
from plexapi.playlist import Playlist as PlexPlaylist
from redis import Redis

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

requests_cache_session = requests_cache.CachedSession(
    "lastfm_cache", backend="memory", expire_after=3600
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

app.add_middleware(TimingMiddleware)

dotenv.load_dotenv(override=True)

# read log level from environment variable
log_level = os.getenv("LOG_LEVEL", "INFO").upper()

# Set up logging
logging.basicConfig(level=log_level)

# Create the database tables
Base.metadata.create_all(bind=Database.get_engine())

SUPPORTED_FILETYPES = (".mp3", ".flac", ".wav", ".ogg", ".m4a")

redis_session = None
REDIS_HOST = os.getenv("REDIS_HOST", None)
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
if REDIS_HOST and REDIS_PORT:
    redis_session = Redis(host=REDIS_HOST, port=REDIS_PORT, db=0, decode_responses=True)

def extract_metadata(file_path, extractor):
    try:
        audio = extractor(file_path)
        result = {
            "title": audio.get("title", [None])[0],
            "artist": audio.get("artist", [None])[0],
            "album": audio.get("album", [None])[0],
            "album_artist": audio.get("albumartist", [None])[0],
            "year": audio.get("date", [None])[0],
            "length": int(audio.info.length) if hasattr(audio, "info") else None,
            "publisher": audio.get("organization", [None])[0],
            "kind": audio.mime[0] if hasattr(audio, "mime") else None,
            "genres": audio.get("genre", list()),
        }
        return result
    except Exception as e:
        logging.error(f"Failed to read metadata for {file_path}: {e}")

    return {}


def scan_directory(directory: str, full=False):
    directory = pathlib.Path(directory)
    if not directory.exists():
        logging.error(f"Directory {directory} does not exist")
        return []

    logging.info(f"Scanning directory {directory}")
    start_time = time.time()
    new_adds = 0

    # Get a list of all files in the directory
    all_files = [
        os.path.join(root, file)
        for root, _, files in os.walk(directory)
        for file in files
    ]

    db = Database.get_session()

    files_seen = 0
    files_skipped = 0
    for full_path in tqdm(all_files, desc="Scanning files"):
        if not full_path.lower().endswith(SUPPORTED_FILETYPES):
            continue

        files_seen += 1

        last_modified_time = datetime.fromtimestamp(os.path.getmtime(full_path))
        existing_file = (
            db.query(MusicFileDB).filter(MusicFileDB.path == full_path).first()
        )

        found_existing_file = False
        if existing_file and existing_file.missing:
            found_existing_file = True
            existing_file.missing = False

        if (not full) and (not found_existing_file) and existing_file and existing_file.last_scanned >= last_modified_time:
            files_skipped += 1
            continue  # Skip files that have not changed

        metadata = {}

        if full_path.lower().endswith(".mp3"):
            metadata = extract_metadata(full_path, EasyID3)
        elif full_path.lower().endswith(".flac"):
            metadata = extract_metadata(full_path, FLAC)
        else:
            logging.debug(f"Skipping file {full_path} with unsupported file type")
            continue

        if not metadata:
            continue

        # Update or add the file in the database
        if existing_file:
            existing_file.last_modified = last_modified_time
            existing_file.title = metadata.get("title")
            existing_file.artist = metadata.get("artist")
            existing_file.album = metadata.get("album")
            existing_file.album_artist = metadata.get("album_artist")
            existing_file.year = metadata.get("year")
            existing_file.length = metadata.get("length")
            existing_file.publisher = metadata.get("publisher")
            existing_file.kind = metadata.get("kind")
            existing_file.last_scanned = datetime.now()
            existing_file.genres = [
                TrackGenreDB(parent_type="music_file", genre=genre)
                for genre in metadata.get("genres", [])
            ]
        else:
            new_adds += 1

            db.add(
                MusicFileDB(
                    path=full_path,
                    title=metadata.get("title"),
                    artist=metadata.get("artist"),
                    album=metadata.get("album"),
                    genres=[
                        TrackGenreDB(parent_type="music_file", genre=genre)
                        for genre in metadata.get("genres", [])
                    ],
                    album_artist=metadata.get("album_artist"),
                    year=metadata.get("year"),
                    length=metadata.get("length"),
                    publisher=metadata.get("publisher"),
                    kind=metadata.get("kind"),
                    last_scanned=datetime.now(),
                )
            )

    logging.info(
        f"Scanned {files_seen} music files ({files_seen - files_skipped} existing, {new_adds} new) in {time.time() - start_time:.2f} seconds"
    )

    db.commit()
    db.close()

    return {
        "files_scanned": files_seen,
        "files_indexed": files_seen - files_skipped,
        "new_files_added": new_adds,
        "files_updated": files_seen - files_skipped - new_adds,
    }


router = APIRouter()


@router.get("/purge")
def purge_data():
    engine = Database.get_engine()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


@router.get("/scan", response_model=ScanResults)
def scan(repo: PlaylistRepository = Depends(get_playlist_repository), music_files: MusicFileRepository = Depends(get_music_file_repository)):
    scan_results = scan_directory(os.getenv("MUSIC_PATH", "/music"), full=False)
    prune_results = prune_music_files()

    return ScanResults(**scan_results, **prune_results)


@router.get("/fullscan", response_model=ScanResults)
def full_scan(repo: PlaylistRepository = Depends(get_playlist_repository), music_files: MusicFileRepository = Depends(get_music_file_repository)):
    scan_results = scan_directory(os.getenv("MUSIC_PATH", "/music"), full=True)
    prune_results = prune_music_files()

    return ScanResults(**scan_results, **prune_results)

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
    repo: MusicFileRepository = Depends(get_music_file_repository),
):
    return repo.filter(
        title=title, artist=artist, album=album, genre=genre, limit=limit
    )


@router.get("/search", response_model=List[MusicFile])
def search_music_files(
    query: str = Query(..., min_length=1),
    limit: int = 50,
    repo: MusicFileRepository = Depends(get_music_file_repository),
):
    return repo.search(query=query, limit=limit)


@router.post("/playlists", response_model=Playlist)
def create_playlist(
    playlist: Playlist, repo: PlaylistRepository = Depends(get_playlist_repository)
):
    try:
        return repo.create(playlist)

    except Exception as e:
        logging.error(f"Failed to create playlist: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/playlists", response_model=List[Playlist])
def read_playlists(repo: PlaylistRepository = Depends(get_playlist_repository)):
    try:
        playlists = repo.get_all()
        return playlists
    except Exception as e:
        logging.error(f"Failed to read playlists: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to read playlists")


@router.get("/playlists/{playlist_id}", response_model=Playlist)
async def get_playlist(
    playlist_id: int, limit: Optional[int] = None, offset: Optional[int] = None, repo: PlaylistRepository = Depends(get_playlist_repository)
):
    db = Database.get_session()
    try:
        playlist = repo.get_with_entries(playlist_id, limit, offset)
        return playlist
    except Exception as e:
        logging.error(f"Failed to get playlist: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get playlist")
    finally:
        db.close()

@router.get("/playlists/{playlist_id}/count")
async def get_playlist_count(
    playlist_id: int, repo: PlaylistRepository = Depends(get_playlist_repository)
):
    return repo.get_count(playlist_id)

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
        totalLength=total_length,
        missingTracks=missing_tracks
    )


@router.put("/playlists/{playlist_id}")
def update_playlist(
    playlist_id: int,
    playlist: Playlist,
    repo: PlaylistRepository = Depends(get_playlist_repository),
):
    try:
        repo.replace_entries(playlist_id, playlist.entries)
    except Exception as e:
        logging.error(f"Failed to update playlist: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update playlist")

@router.post("/playlists/{playlist_id}/add")
def add_to_playlist(
    playlist_id: int,
    entries: List[PlaylistEntryBase],
    undo: Optional[bool] = False,
    repo: PlaylistRepository = Depends(get_playlist_repository),
):
    try:
        repo.add_entries(playlist_id, entries, undo)
    except Exception as e:
        logging.error(f"Failed to add to playlist: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to add to playlist")

@router.post("/playlists/{playlist_id}/remove")
def add_to_playlist(
    playlist_id: int,
    entries: List[PlaylistEntryBase],
    undo: Optional[bool] = False,
    repo: PlaylistRepository = Depends(get_playlist_repository),
):
    try:
        repo.remove_entries(playlist_id, entries, undo)
    except Exception as e:
        logging.error(f"Failed to add to playlist: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to add to playlist")

@router.post("/playlists/{playlist_id}/reorder")
def add_to_playlist(
    playlist_id: int,
    positions: List[int],
    new_position: int,
    undo: Optional[bool] = False,
    repo: PlaylistRepository = Depends(get_playlist_repository),
):
    try:
        repo.reorder_entries(playlist_id, positions, new_position, undo)
    except Exception as e:
        logging.error(f"Failed to add to playlist: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to add to playlist")

@router.post("/playlists/rename/{playlist_id}")
def rename_playlist(
    playlist_id: int,
    rename_data: AlterPlaylistDetails
):
    try:
        db = Database.get_session()
        db.query(PlaylistDB).filter(PlaylistDB.id == playlist_id).update(
            {"name": rename_data.new_name}
        )
        db.commit()
    except Exception as e:
        logging.error(f"Failed to rename playlist: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to rename playlist")

@router.delete("/playlists/{playlist_id}")
def delete_playlist(playlist_id: int):
    db = Database.get_session()
    try:
        playlist = (
            db.query(PlaylistDB)
            .options(joinedload(PlaylistDB.entries))
            .filter(PlaylistDB.id == playlist_id)
            .first()
        )
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
def export_playlist(playlist_id: int, repo: PlaylistRepository = Depends(get_playlist_repository)):
    try:
        m3u_content = repo.export_to_m3u(
            playlist_id, mapping_source=os.getenv("PLEX_MAP_SOURCE"), mapping_target=os.getenv("PLEX_MAP_TARGET")
        )

        playlist = repo.get_by_id(playlist_id)

        # Create a StreamingResponse to return the .m3u file
        response = StreamingResponse(
            io.StringIO(m3u_content), media_type="audio/x-mpegurl"
        )
        response.headers["Content-Disposition"] = (
            f"attachment; filename={playlist.name}.m3u"
        )
        return response
    except Exception as e:
        logging.error(f"Failed to export playlist: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to export playlist")

@router.get("/playlists/{playlist_id}/synctoplex")
def sync_playlist_to_plex(playlist_id: int, repo: PlaylistRepository = Depends(get_playlist_repository)):
    try:
        M3U_SOURCE = os.getenv("PLEX_M3U_DROP_SOURCE", None)
        M3U_TARGET = os.getenv("PLEX_M3U_DROP_TARGET", None)
    
        if not M3U_SOURCE or not M3U_TARGET:
            raise HTTPException(status_code=500, detail="Plex drop path not configured")
        
        MAP_SOURCE = os.getenv("PLEX_MAP_SOURCE")
        MAP_TARGET = os.getenv("PLEX_MAP_TARGET")

        m3u_content = repo.export_to_m3u(
            playlist_id, mapping_source=os.getenv("PLEX_MAP_SOURCE"), mapping_target=os.getenv("PLEX_MAP_TARGET")
        )

        playlist = repo.get_by_id(playlist_id)

        m3u_path = pathlib.Path(M3U_SOURCE) / f"{playlist.name}.m3u"

        with open(m3u_path, "w") as f:
            f.write(m3u_content)

        plex_endpoint = os.getenv("PLEX_ENDPOINT")
        plex_token = os.getenv("PLEX_TOKEN")
        plex_library = os.getenv("PLEX_LIBRARY")

        server = PlexServer(plex_endpoint, token=plex_token)

        if M3U_SOURCE and M3U_TARGET:
            endpoint = str(m3u_path).replace(MAP_SOURCE, MAP_TARGET)

        PlexPlaylist.create(server, playlist.name, section=server.library.section(plex_library), m3ufilepath=endpoint)
    except Exception as e:
        logging.error(f"Failed to sync playlist to Plex: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to sync playlist to Plex")

@router.post("/library/findlocals")
def find_local_files(tracks: List[TrackDetails], repo: MusicFileRepository = Depends(get_music_file_repository)):
    return repo.find_local_files(tracks)

@router.get("/lastfm", response_model=LastFMTrack | None)
def get_lastfm_track(title: str = Query(...), artist: str = Query(...)):
    api_key = os.getenv("LASTFM_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Last.FM API key not configured")

    repo = last_fm_repository(api_key)
    return repo.search_track(artist, title)

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

    repo = last_fm_repository(api_key, requests_cache_session)
    return repo.get_album_art(artist, album, redis_session=redis_session)

# get similar tracks
@router.get("/openai/similar")
def get_similar_tracks_with_openai(title: str = Query(...), artist: str = Query(...)):
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")
    
    repo = open_ai_repository(api_key)

    return repo.get_similar_tracks(artist, title)

@router.get("/testing/dumpLibrary/{playlistID}")
def dump_library(playlistID: int, repo: PlaylistRepository = Depends(get_playlist_repository), music_files: MusicFileRepository = Depends(get_music_file_repository)):
    playlist = repo.get_by_id(playlistID)
    music_files.dump_library_to_playlist(playlist, repo)

@app.get("/api/music-files")
async def get_music_files(
    repo: MusicFileRepository = Depends(get_music_file_repository),
):
    return repo.get_all()

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
    music_path = os.getenv("MUSIC_PATH", "/music")
    if not pathlib.Path(music_path).exists():
        logging.warning(f"Music path {music_path} does not exist")

    uvicorn.run("main:app", host=host, port=port, reload=True)
