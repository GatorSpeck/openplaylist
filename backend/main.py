import os
import pathlib
import logging
from pydantic import BaseModel
from fastapi import FastAPI, Query, APIRouter, Request
import uvicorn
from mutagen.easyid3 import EasyID3
from mutagen.flac import FLAC
from sqlalchemy import create_engine, Column, String, DateTime, or_, JSON, Table, ForeignKey, Integer
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
import dotenv
from typing import Optional, List
import time
from tqdm import tqdm
from datetime import datetime
from fastapi.exceptions import HTTPException, RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import joinedload


app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

dotenv.load_dotenv(override=True)

# Set up logging
logging.basicConfig(level=logging.DEBUG)

# SQLAlchemy setup
DATABASE_URL = "sqlite:///./music_files.db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# SQLAlchemy model for a music file
class MusicFileDB(Base):
    __tablename__ = "music_files"
    path = Column(String, primary_key=True, index=True)
    title = Column(String, index=True)
    artist = Column(String, index=True)
    album = Column(String, index=True)
    last_modified = Column(DateTime, index=True)
    genres = Column(JSON, nullable=True)  # list of genres of the music file

# Association table for many-to-many relationship
playlist_music_files = Table('playlist_music_files', Base.metadata,
    Column('playlist_id', Integer, ForeignKey('playlists.id'), primary_key=True),
    Column('music_file_path', String, ForeignKey('music_files.path'), primary_key=True)
)

class PlaylistDB(Base):
    __tablename__ = "playlists"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    music_files = relationship("MusicFileDB", secondary=playlist_music_files, back_populates="playlists")

MusicFileDB.playlists = relationship("PlaylistDB", secondary=playlist_music_files, back_populates="music_files")

# Create the database tables
Base.metadata.create_all(bind=engine)

# Simple model for a music file
class MusicFile(BaseModel):
    path: str
    title: str
    artist: Optional[str] = None
    album: Optional[str] = None
    genres: List[str] = []

class Playlist(BaseModel):
    id: Optional[int] = None
    name: str
    music_files: List[MusicFile] = []

class PlaylistCreate(BaseModel):
    name: str
    music_file_paths: List[str] = []

IGNORED_FILETYPES = (".jpg", ".txt", ".db", ".m3u")

def extract_metadata(file_path, extractor):
    try:
        audio = extractor(file_path)
        return {
            'title': audio.get('title', [None])[0],
            'artist': audio.get('artist', [None])[0],
            'album': audio.get('album', [None])[0],
            'genres': audio.get('genre', list())
        }
    except Exception as e:
        logging.error(f"Failed to read metadata for {file_path}: {e}")

    return {}

def scan_directory(directory: str, deep=False):
    directory = pathlib.Path(directory)
    if not directory.exists():
        logging.error(f"Directory {directory} does not exist")
        return []

    logging.info(f"Scanning directory {directory}")
    music_files = []
    start_time = time.time()
    new_adds = 0

    # Get a list of all files in the directory
    all_files = [os.path.join(root, file) for root, _, files in os.walk(directory) for file in files]

    db = SessionLocal()
    files_seen = 0
    files_skipped = 0
    for full_path in tqdm(all_files, desc="Scanning files"):
        files_seen += 1
        last_modified_time = datetime.fromtimestamp(os.path.getmtime(full_path))
        existing_file = db.query(MusicFileDB).filter(MusicFileDB.path == full_path).first()

        if existing_file and existing_file.last_modified >= last_modified_time:
            files_skipped += 1
            continue  # Skip files that have not changed
        
        metadata = {}

        if full_path.lower().endswith(IGNORED_FILETYPES):
            continue

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
                last_modified=last_modified_time
            ))

    logging.info(f"Scanned {len(music_files)} music files ({files_skipped} existing, {new_adds} new) in {time.time() - start_time:.2f} seconds")

    db.commit()
    db.close()   

router = APIRouter()

@router.get("/scan")
def scan():
    scan_directory(os.getenv("MUSIC_PATH", "data/music"))

@router.get("/fullscan")
def scan():
    drop_music_files()
    scan_directory(os.getenv("MUSIC_PATH", "data/music"))
    prune_music_files()

def drop_music_files():
    db = SessionLocal()
    files = db.query(MusicFileDB).all()
    for f in files:
        db.delete(f)

    db.commit()
    db.close()

def prune_music_files():
    db = SessionLocal()
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

@router.get("/music", response_model=List[MusicFile])
def get_music_files():
    db = SessionLocal()
    try:
        music_files = db.query(MusicFileDB).all()
    except Exception as e:
        logging.error(f"Failed to get music files: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get music files")
    finally:
        db.close()
    return music_files

@router.get("/search")
def search_music_files(query: str = Query(..., min_length=1)):
    db = SessionLocal()
    search_query = f"%{query}%"
    results = db.query(MusicFileDB).filter(
        (MusicFileDB.title.ilike(search_query)) |
        (MusicFileDB.artist.ilike(search_query)) |
        (MusicFileDB.album.ilike(search_query))
    ).all()

    return results

@router.post("/playlists", response_model=Playlist)
def create_playlist(playlist: PlaylistCreate):
    db = SessionLocal()
    try:
        # Create a new PlaylistDB instance
        db_playlist = PlaylistDB(name=playlist.name)
        
        # Add music files to the playlist
        for path in playlist.music_file_paths:
            music_file = db.query(MusicFileDB).filter(MusicFileDB.path == path).first()
            if music_file:
                db_playlist.music_files.append(music_file)
        
        # Add the new playlist to the database
        db.add(db_playlist)
        db.commit()
        db.refresh(db_playlist)
        
        # Eagerly load the music_files relationship
        db_playlist = db.query(PlaylistDB).options(joinedload(PlaylistDB.music_files)).filter(PlaylistDB.id == db_playlist.id).first()
    except Exception as e:
        db.rollback()
        logging.error(f"Failed to create playlist: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create playlist")
    finally:
        db.close()
    
    return db_playlist

@router.get("/playlists", response_model=List[Playlist])
def read_playlists(skip: int = 0, limit: int = 10):
    db = SessionLocal()
    try:
        playlists = db.query(PlaylistDB).options(joinedload(PlaylistDB.music_files)).offset(skip).limit(limit).all()
    except Exception as e:
        logging.error(f"Failed to read playlists: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to read playlists")
    finally:
        db.close()
    return playlists

@router.get("/playlists/{playlist_id}", response_model=Playlist)
def read_playlist(playlist_id: int):
    db = SessionLocal()
    try:
        playlist = db.query(PlaylistDB).options(joinedload(PlaylistDB.music_files)).filter(PlaylistDB.id == playlist_id).first()
        if playlist is None:
            raise HTTPException(status_code=404, detail="Playlist not found")
    except Exception as e:
        logging.error(f"Failed to read playlist: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to read playlist")
    finally:
        db.close()
    return playlist

@router.put("/playlists/{playlist_id}", response_model=Playlist)
def update_playlist(playlist_id: int, playlist: PlaylistCreate):
    db = SessionLocal()
    try:
        db_playlist = db.query(PlaylistDB).options(joinedload(PlaylistDB.music_files)).filter(PlaylistDB.id == playlist_id).first()
        if db_playlist is None:
            raise HTTPException(status_code=404, detail="Playlist not found")
        db_playlist.name = playlist.name
        db_playlist.music_files = []
        for path in playlist.music_file_paths:
            music_file = db.query(MusicFileDB).filter(MusicFileDB.path == path).first()
            if music_file:
                db_playlist.music_files.append(music_file)
        db.commit()
        db.refresh(db_playlist)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()
    return db_playlist

@router.delete("/playlists/{playlist_id}")
def delete_playlist(playlist_id: int):
    db = SessionLocal()
    try:
        playlist = db.query(PlaylistDB).options(joinedload(PlaylistDB.music_files)).filter(PlaylistDB.id == playlist_id).first()
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

# Further endpoints for playlists would go here.

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

host = os.getenv("HOST", "127.0.0.1")
port = int(os.getenv("PORT", 8000))

if __name__ == "__main__":
    uvicorn.run("main:app", host=host, port=port, reload=True)