from fastapi import APIRouter
from sqlalchemy.orm import joinedload
from fastapi.responses import StreamingResponse
from repositories.playlist import PlaylistRepository, PlaylistFilter, PlaylistSortCriteria, PlaylistSortDirection
from plexapi.server import PlexServer
from plexapi.playlist import Playlist as PlexPlaylist
from fastapi import Query, APIRouter, Depends, Body, File, UploadFile
from response_models import Playlist, PlaylistEntry, PlaylistEntriesResponse, AlterPlaylistDetails, ReplaceTrackRequest, MusicFileEntry, RequestedAlbumEntry, Album, RequestedTrackEntry, TrackDetails
import json
from repositories.playlist import PlaylistRepository
from repositories.music_file import MusicFileRepository
from repositories.last_fm_repository import get_last_fm_repo
import logging
from fastapi.exceptions import HTTPException
from dependencies import get_music_file_repository, get_playlist_repository
from typing import Optional, List
from database import Database
from models import PlaylistDB
import pathlib
import os
from repositories.requests_cache_session import requests_cache_session

router = APIRouter()

@router.post("/", response_model=Playlist)
def create_playlist(
    playlist: Playlist, repo: PlaylistRepository = Depends(get_playlist_repository)
):
    try:
        return repo.create(playlist)

    except Exception as e:
        logging.error(f"Failed to create playlist: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=List[Playlist])
def read_playlists(repo: PlaylistRepository = Depends(get_playlist_repository)):
    try:
        playlists = repo.get_all()
        return playlists
    except Exception as e:
        logging.error(f"Failed to read playlists: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to read playlists")


@router.get("/{playlist_id}", response_model=Playlist)
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

@router.get("/{playlist_id}/entries", response_model=PlaylistEntriesResponse)
async def get_playlist_entries(
    playlist_id: int,
    limit: Optional[int] = None,
    offset: Optional[int] = None,
    filter: Optional[str] = None,
    sortCriteria: Optional[str] = None,
    sortDirection: Optional[str] = None,
    countOnly: Optional[bool] = False,
    repo: PlaylistRepository = Depends(get_playlist_repository)
):
    f = PlaylistFilter(
        filter=filter,
        sortCriteria=PlaylistSortCriteria.from_str(sortCriteria),
        sortDirection=PlaylistSortDirection.from_str(sortDirection),
        limit=limit,
        offset=offset,
    )
    return repo.filter_playlist(playlist_id, f, count_only=countOnly)

@router.get("/{playlist_id}/count")
async def get_playlist_count(
    playlist_id: int, repo: PlaylistRepository = Depends(get_playlist_repository)
):
    return repo.get_count(playlist_id)

@router.get("/{playlist_id}/details")
async def get_playlist_count(
    playlist_id: int, repo: PlaylistRepository = Depends(get_playlist_repository)
):
    return repo.get_details(playlist_id)

@router.put("/{playlist_id}")
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

@router.post("/{playlist_id}/add")
def add_to_playlist(
    playlist_id: int,
    entries: List[PlaylistEntry],
    undo: Optional[bool] = False,
    repo: PlaylistRepository = Depends(get_playlist_repository),
):
    try:
        repo.add_entries(playlist_id, entries, undo)
    except Exception as e:
        logging.error(f"Failed to add to playlist: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to add to playlist")

@router.post("/{playlist_id}/remove")
def remove_from_playlist(
    playlist_id: int,
    entries: List[PlaylistEntry],
    undo: Optional[bool] = False,
    repo: PlaylistRepository = Depends(get_playlist_repository),
):
    try:
        repo.remove_entries(playlist_id, entries, undo)
    except Exception as e:
        logging.error(f"Failed to add to playlist: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to add to playlist")

@router.post("/{playlist_id}/reorder")
def reorder_in_playlist(
    playlist_id: int,
    positions: List[int],
    new_position: int,
    undo: Optional[bool] = False,
    repo: PlaylistRepository = Depends(get_playlist_repository),
):
    try:
        repo.reorder_entries(playlist_id, positions, new_position)
    except Exception as e:
        logging.error(f"Failed to add to playlist: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to add to playlist")

@router.post("/rename/{playlist_id}")
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

@router.delete("/{playlist_id}")
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

@router.put("/{playlist_id}/replace")
def replace_track(playlist_id: int, details: ReplaceTrackRequest = Body(...), repo: PlaylistRepository = Depends(get_playlist_repository)):
    try:
        repo.replace_track(playlist_id, details.existing_track_id, details.new_track)
    except Exception as e:
        logging.error(f"Failed to replace track: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to replace track")

@router.get("/{playlist_id}/export", response_class=StreamingResponse)
def export_playlist(playlist_id: int, type: str = Query("m3u"), repo: PlaylistRepository = Depends(get_playlist_repository)):
    try:
        if type == "m3u":
            export_generator = repo.export_to_m3u(playlist_id)
        elif type == "json":
            export_generator = repo.export_to_json(playlist_id)
        else:
            raise HTTPException(status_code=400, detail="Invalid export type")

        playlist = repo.get_by_id(playlist_id)

        response = StreamingResponse(
            export_generator,
            media_type="application/octet-stream" if type == "json" else "audio/x-mpegurl"
        )
        response.headers["Content-Disposition"] = (
            f"attachment; filename={playlist.name}.{type}"
        )
        return response
    except Exception as e:
        logging.error(f"Failed to export playlist: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to export playlist")



@router.get("/{playlist_id}/artgrid")
def get_playlist_art_grid(playlist_id: int, repo: PlaylistRepository = Depends(get_playlist_repository)):
    try:
        lastfm_repo = get_last_fm_repo(requests_cache_session)
        return repo.get_art_grid(playlist_id, lastfm_repo)
    except Exception as e:
        logging.error(f"Failed to get playlist art grid: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get playlist art grid")
    
@router.get("/listbytrack/{track_id}")
def get_playlists_by_track(track_id: int, repo: PlaylistRepository = Depends(get_playlist_repository)):
    try:
        return repo.get_playlists_by_track(track_id)
    except Exception as e:
        logging.error(f"Failed to get playlists by track: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get playlists by track")

@router.get("/{playlist_id}/synctoplex")
def sync_playlist_to_plex(playlist_id: int, repo: PlaylistRepository = Depends(get_playlist_repository)):
    try:
        M3U_SOURCE = os.getenv("PLEX_M3U_DROP_SOURCE", None)
        M3U_TARGET = os.getenv("PLEX_M3U_DROP_TARGET", None)
    
        if not M3U_SOURCE or not M3U_TARGET:
            raise HTTPException(status_code=500, detail="Plex drop path not configured")
        
        MAP_SOURCE = os.getenv("PLEX_MAP_SOURCE")
        MAP_TARGET = os.getenv("PLEX_MAP_TARGET")

        if MAP_SOURCE and MAP_TARGET:
            logging.info(f"Mapping track paths: source = {MAP_SOURCE}, target = {MAP_TARGET}")

        m3u_content = repo.export_to_m3u(
            playlist_id, mapping_source=MAP_SOURCE, mapping_target=MAP_TARGET
        )

        playlist = repo.get_by_id(playlist_id)

        m3u_path = pathlib.Path(M3U_SOURCE) / f"{playlist.name}.m3u"

        logging.info(f"Writing playlist to {m3u_path}")
        with open(m3u_path, "w") as f:
            while True:
                try:
                    chunk = next(m3u_content)
                except StopIteration:
                    break
                
                if not chunk:
                    break
                f.write(chunk)
        
        logging.info("Done updating M3U file")

        plex_endpoint = os.getenv("PLEX_ENDPOINT")
        plex_token = os.getenv("PLEX_TOKEN")
        plex_library = os.getenv("PLEX_LIBRARY")

        server = PlexServer(plex_endpoint, token=plex_token)

        if M3U_SOURCE and M3U_TARGET:
            logging.info(f"Mapping m3u path: source = {M3U_SOURCE}, target = {M3U_TARGET}")
            endpoint = str(m3u_path).replace(M3U_SOURCE, M3U_TARGET)
        
        logging.info(f"Syncing playlist to Plex: m3u path sent to Plex = {endpoint}")

        PlexPlaylist.create(server, playlist.name, section=server.library.section(plex_library), m3ufilepath=endpoint)
    except Exception as e:
        logging.error(f"Failed to sync playlist to Plex: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to sync playlist to Plex")

@router.put("/reorderpinned/{playlist_id}")
def reorder_pinned_tracks(playlist_id: int, new_order: List[int], repo: PlaylistRepository = Depends(get_playlist_repository)):
    try:
        repo.reorder_pinned_tracks(playlist_id, new_order)
    except Exception as e:
        logging.error(f"Failed to reorder pinned tracks: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to reorder pinned tracks")

@router.put("/{playlist_id}/updatepin")
def update_playlist_pin(playlist_id: int, pin: str = Query(...), repo: PlaylistRepository = Depends(get_playlist_repository)):
    try:
        repo.update_pin(playlist_id, pin == "true")
    except Exception as e:
        logging.error(f"Failed to update playlist pin: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update playlist pin")

@router.post("/import/m3u/{playlist_name}")
async def import_m3u_playlist(
    playlist_name: str,
    file: UploadFile = File(...),
    repo: PlaylistRepository = Depends(get_playlist_repository),
    music_repo: MusicFileRepository = Depends(get_music_file_repository)
):
    created_playlist = None

    try:
        content = await file.read()
        lines = content.decode('utf-8').splitlines()

        # Create a new playlist
        playlist = Playlist(
            name=playlist_name,
            entries=[]
        )

        created_playlist = repo.create(playlist)

        logging.info(f"Created playlist {created_playlist.id}")

        entries = []

        for line in lines:
            line = line.strip()
            if not line or line.startswith("#"):
                continue

            # Try to find a matching track in the library
            local_track = None

            # Search for matching track by path
            matches = music_repo.filter(
                path=line,
                limit=1
            )
            if matches:
                local_track = matches[0]

            # If track is found, add it as a regular entry
            if local_track:
                entries.append(MusicFileEntry(
                    entry_type="music_file",
                    music_file_id=local_track.id,
                ))
            else:
                continue
        
        # Add all entries to the playlist
        if entries:
            repo.add_entries(created_playlist.id, entries)
            logging.info(f"Added {len(entries)} entries to playlist {created_playlist.id}")
        
    except json.JSONDecodeError as e:
        logging.error(e)
        raise HTTPException(status_code=400, detail="Invalid JSON format")
    except Exception as e:
        logging.error(f"Failed to import playlist: {e}", exc_info=True)

        # delete empty playlist
        if (created_playlist):
            repo.delete(created_playlist.id)
        
        raise HTTPException(status_code=500, detail=f"Failed to import playlist: {str(e)}")


@router.post("/import/json/{playlist_name}")
async def import_json_playlist(
    playlist_name: str,
    file: UploadFile = File(...),
    repo: PlaylistRepository = Depends(get_playlist_repository),
    music_repo: MusicFileRepository = Depends(get_music_file_repository)
):
    created_playlist = None
    try:
        content = await file.read()
        playlist_data = json.loads(content.decode('utf-8'))
        
        # Create a new playlist
        playlist = Playlist(
            name=playlist_name,
            entries=[]
        )
        created_playlist = repo.create(playlist)

        logging.info(f"Created playlist {created_playlist.id}")
        
        # Process tracks from the JSON file
        if "entries" in playlist_data.get("playlist", {}):
            entries = []
            for entry in playlist_data["playlist"]["entries"]:
                # Try to find a matching track in the library
                local_track = None

                if "artist" in entry and "album" in entry and "title" not in entry:
                    # add as requested album
                    details = Album(
                        artist=entry.get("artist"),
                        title=entry.get("album")
                    )

                    logging.info(f"Adding requested album {details.artist} - {details.title}")

                    entries.append(RequestedAlbumEntry(
                        entry_type="requested_album",
                        details=details,
                    ))
                
                if "artist" in entry and "title" in entry:
                    # Search for matching track by artist/title/album
                    matches = music_repo.filter(
                        artist=entry.get("artist"),
                        title=entry.get("title"),
                        album=entry.get("album"),
                        limit=1
                    )
                    if matches:
                        local_track = matches[0]
                
                    # If track is found, add it as a regular entry
                    if local_track:
                        logging.info(f"Adding track {local_track.artist} - {local_track.title}")

                        entries.append(MusicFileEntry(
                            entry_type="music_file",
                            music_file_id=local_track.id,
                        ))
                    else:
                        # Add as a requested track
                        details = TrackDetails(
                            artist=entry.get("artist"),
                            title=entry.get("title"),
                            album=entry.get("album")
                        )

                        logging.info(f"Adding requested track {details.artist} - {details.title}")

                        entries.append(RequestedTrackEntry(
                            entry_type="requested",
                            details=details,
                        ))
            
            # Add all entries to the playlist
            if entries:
                repo.add_entries(created_playlist.id, entries)
                logging.info(f"Added {len(entries)} entries to playlist {created_playlist.id}")
        else:
            raise ValueError("Invalid JSON format")
            
    except json.JSONDecodeError as e:
        logging.error(e)
        raise HTTPException(status_code=400, detail="Invalid JSON format")
    except Exception as e:
        logging.error(f"Failed to import playlist: {e}", exc_info=True)

        # delete empty playlist
        if created_playlist:
            repo.delete(created_playlist.id)
        
        raise HTTPException(status_code=500, detail=f"Failed to import playlist: {str(e)}")