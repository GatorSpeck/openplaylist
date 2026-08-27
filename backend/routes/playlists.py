from fastapi import APIRouter
from sqlalchemy.orm import joinedload
from fastapi.responses import StreamingResponse
from repositories.playlist_repository import PlaylistRepository, PlaylistFilter, PlaylistSortCriteria, PlaylistSortDirection
from fastapi import Query, APIRouter, Depends, Body, File, UploadFile
from response_models import Playlist, PlaylistEntry, PlaylistEntriesResponse, AlterPlaylistDetails, LinkChangeRequest, MusicFileEntry, RequestedAlbumEntry, Album, TrackDetails, PlaylistEntryStub, SyncTarget, SyncLogEntry, PersistentSyncLogEntry, PlaylistSnapshot
import json
from repositories.playlist_repository import PlaylistRepository
from repositories.music_file import MusicFileRepository
from repositories.last_fm_repository import get_last_fm_repo
from repositories.plex_repository import PlexRepository
import logging
from fastapi.exceptions import HTTPException
from dependencies import get_music_file_repository, get_playlist_repository, get_plex_repository
from typing import Optional, List
from database import Database
from models import PlaylistDB, PlaylistEntryDB, MusicFileEntryDB, RemoteSyncRunDB, RemoteSyncEventDB, SyncTargetDB
import pathlib
import os
from repositories.requests_cache_session import requests_cache_session
from pydantic import BaseModel
from typing import Dict, Optional, List, Union, Any, Tuple
from datetime import datetime
from repositories.remote_repository_factory import create_remote_repository
from repositories.remote_playlist_repository import SyncChange, create_snapshot, RemoteUnavailableError
from dataclasses import dataclass, field

router = APIRouter()


def _get_remote_playlist_ref(config: Dict[str, Any], local_playlist_name: str) -> str:
    return config.get("playlist_id") or config.get("playlist_uri") or config.get("playlist_name") or local_playlist_name


def _get_remote_playlist_display_name(config: Dict[str, Any], local_playlist_name: str) -> str:
    return config.get("playlist_name") or local_playlist_name


def _get_remote_playlist_create_title(config: Dict[str, Any], local_playlist_name: str) -> str:
    return config.get("playlist_name") or local_playlist_name


def _persist_remote_playlist_id(db, target: SyncTarget, playlist_id: int, remote_playlist_id: Optional[str]) -> None:
    if not remote_playlist_id:
        return

    config = dict(target.config or {})
    if config.get("playlist_id") == remote_playlist_id:
        return

    config["playlist_id"] = remote_playlist_id

    db_target = db.query(SyncTargetDB).filter(
        SyncTargetDB.id == target.id,
        SyncTargetDB.playlist_id == playlist_id,
    ).first()

    if not db_target:
        return

    db_target.config = json.dumps(config)
    db.commit()
    target.config = config


def _get_enabled_sync_targets(repo: PlaylistRepository, playlist_id: int) -> List[SyncTarget]:
    """Raises 404 if there are no sync targets configured at all, or a distinct 404 if there are
    some but none are enabled - same two checks sync_playlist has always done, just named."""
    sync_targets = repo.get_sync_targets(playlist_id)

    if not sync_targets:
        raise HTTPException(status_code=404, detail="No sync targets configured for this playlist")

    sync_targets = [target for target in sync_targets if target.enabled]
    if not sync_targets:
        raise HTTPException(status_code=404, detail="No enabled sync targets found for this playlist")

    return sync_targets


def _chunk_changes(changes: List[SyncChange], chunk_size: int):
    for idx in range(0, len(changes), chunk_size):
        yield changes[idx:idx + chunk_size]


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

@router.post("/{playlist_id}/checkdups", response_model=List[PlaylistEntry])
async def check_duplicates(
    playlist_id: int,
    entries: List[PlaylistEntry],
    repo: PlaylistRepository = Depends(get_playlist_repository)
):
    try:
        duplicates = repo.check_for_duplicates(playlist_id, entries)
        return duplicates
    except Exception as e:
        logging.error(f"Failed to check duplicates: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to check duplicates")

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

@router.post("/{playlist_id}/reserve-entry")
def reserve_playlist_entry(
    playlist_id: int,
    request_data: dict = Body(default={}),
    repo: PlaylistRepository = Depends(get_playlist_repository),
):
    try:
        entry_type = request_data.get("entry_type", "music_file")
        entry = repo.reserve_entry_id(playlist_id, entry_type)
        return {"id": entry.id, "entry_type": entry.entry_type}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logging.error(f"Failed to reserve playlist entry: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to reserve playlist entry")

@router.post("/{playlist_id}/remove")
def remove_from_playlist(
    playlist_id: int,
    entries: List[PlaylistEntryStub],
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
    
@router.put("/{playlist_id}/links")
def update_links(playlist_id: int, details: LinkChangeRequest = Body(...), repo: PlaylistRepository = Depends(get_playlist_repository)):
    try:
        repo.update_links(playlist_id, details)
    except Exception as e:
        logging.error(f"Failed to update links: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update links")

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

                        entries.append(MusicFileEntry(
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

@router.get("/{playlist_id}/syncconfig", response_model=List[SyncTarget])
def get_playlist_sync_config(playlist_id: int, repo: PlaylistRepository = Depends(get_playlist_repository)):
    """Get sync targets for a playlist"""
    try:
        return repo.get_sync_targets(playlist_id)
    except Exception as e:
        logging.error(f"Failed to get sync targets: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get sync targets")

@router.post("/{playlist_id}/syncconfig", response_model=SyncTarget)
def create_sync_target(playlist_id: int, target: SyncTarget, repo: PlaylistRepository = Depends(get_playlist_repository)):
    """Create a new sync target for a playlist"""
    try:
        return repo.create_sync_target(playlist_id, target)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logging.error(f"Failed to create sync target: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create sync target")

@router.put("/{playlist_id}/syncconfig/{target_id}", response_model=SyncTarget)
def update_sync_target(playlist_id: int, target_id: int, target: SyncTarget, repo: PlaylistRepository = Depends(get_playlist_repository)):
    """Update an existing sync target"""
    try:
        # Ensure the target ID matches the path parameter
        if target.id is not None and target.id != target_id:
            raise HTTPException(status_code=400, detail="Target ID mismatch")
        
        # Set the ID from the path parameter
        target.id = target_id
        
        return repo.update_sync_target(playlist_id, target)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logging.error(f"Failed to update sync target: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update sync target")

@router.delete("/{playlist_id}/syncconfig/{target_id}", response_model=dict)
def delete_sync_target(playlist_id: int, target_id: int, repo: PlaylistRepository = Depends(get_playlist_repository)):
    """Delete a sync target"""
    try:
        repo.delete_sync_target(playlist_id, target_id)
        return {"success": True, "detail": "Sync target deleted successfully"}
    except Exception as e:
        logging.error(f"Failed to delete sync target: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to delete sync target")

@router.get("/{playlist_id}/sync")
def sync_playlist(
    playlist_id: int,
    force_push: bool = False,
    repo: PlaylistRepository = Depends(get_playlist_repository)
):
    """
    Sync a playlist with configured remote targets using a unified sync plan
    
    Args:
        playlist_id: The ID of the playlist to sync
    """
    sync_log = []  # Initialize sync log
    db = None
    sync_run = None

    def _persist_sync_log_entries():
        if not db or not sync_run:
            return

        for event in sync_log:
            db.add(RemoteSyncEventDB(
                sync_run_id=sync_run.id,
                playlist_id=playlist_id,
                created_at=datetime.now(),
                event_kind=event.eventKind or "change",
                action=event.action,
                track=event.track,
                target=event.target,
                target_name=event.target_name,
                reason=event.reason,
                success=event.success,
                error=event.error,
                event_metadata=event.metadata
            ))

    try:
        sync_targets = _get_enabled_sync_targets(repo, playlist_id)

        # Initialize success and error counters
        results = {
            "success": [],
            "failed": []
        }

        db = Database.get_session()

        playlist = repo.get_by_id(playlist_id)
        if not playlist:
            raise HTTPException(status_code=404, detail="Playlist not found")

        sync_run = RemoteSyncRunDB(
            playlist_id=playlist_id,
            started_at=datetime.now(),
            status="running",
            force_push=force_push,
        )
        db.add(sync_run)
        db.commit()
        db.refresh(sync_run)

        local_snapshot = create_snapshot(playlist)

        # Step 1+2: Initialize all remote repositories and collect current/old snapshots
        init_result = _initialize_target_contexts(db, sync_targets, playlist, playlist_id, local_snapshot)
        sync_log.extend(init_result.log_entries)
        results["failed"].extend(init_result.failures)

        # If no repositories were successfully initialized, return early
        if not init_result.contexts:
            raise HTTPException(status_code=500, detail="Failed to initialize any remote repositories")

        # Step 3: Create individual sync plans and combine into unified plan
        plan_result = _build_unified_sync_plan(
            init_result.contexts, init_result.current_snapshots, init_result.old_snapshots, local_snapshot, force_push
        )
        sync_log.extend(plan_result.log_entries)
        results["failed"].extend(plan_result.failures)

        # If we don't have a unified plan, we can't proceed
        if plan_result.unified_plan is None:
            raise HTTPException(status_code=500, detail="Failed to create any sync plans")

        logging.info("Unified sync plan:")
        for change in plan_result.unified_plan:
            logging.info(f"{change.action} {change.item.to_string()} (source: {change.source}, reason: {change.reason})")

        # Step 4: Decide what applying the unified plan means for local + each target (pure -
        # see decide_sync_plan_application), then actually perform the local mutations.
        target_infos = {
            target_id: TargetSyncInfo(target=plan_info['repo_info']['target'], target_name=plan_info['repo_info']['target_name'])
            for target_id, plan_info in plan_result.individual_plans.items()
        }
        decision = decide_sync_plan_application(plan_result.unified_plan, target_infos, init_result.current_snapshots, force_push)

        for change in decision.local_changes:
            sync_log.extend(_apply_local_change(repo, playlist_id, playlist.name, change))

        sync_log.extend(decision.receive_log_entries)

        # Step 5: Flush batched remote operations for each target
        flush_log_entries, flush_failures = _flush_remote_operations(decision.remote_ops, plan_result.individual_plans)
        sync_log.extend(flush_log_entries)
        results["failed"].extend(flush_failures)

        # Step 6: Write back each target's post-apply snapshot, plus the local snapshot
        snapshot_successes, snapshot_failures = _persist_post_sync_snapshots(
            plan_result.individual_plans, init_result.contexts, playlist
        )
        results["success"].extend(snapshot_successes)
        results["failed"].extend(snapshot_failures)

        status = "success" if not results["failed"] else "partial"
        response_payload = {
            "status": status,
            "synced": results["success"],
            "failed": results["failed"],
            "summary": {
                "total_targets": len(sync_targets),
                "successful": len(results["success"]),
                "failed": len(results["failed"])
            },
            "log": sync_log  # Include the detailed sync log
        }

        if sync_run:
            sync_run.completed_at = datetime.now()
            sync_run.status = status
            sync_run.summary = response_payload["summary"]
            _persist_sync_log_entries()
            db.commit()

        return response_payload
    
    except HTTPException as e:
        if sync_run and db:
            sync_run.completed_at = datetime.now()
            sync_run.status = "failed"
            sync_run.error = str(e.detail)
            _persist_sync_log_entries()
            db.commit()
        raise
    except Exception as e:
        logging.error(f"Failed to sync playlist: {e}", exc_info=True)
        if sync_run and db:
            sync_run.completed_at = datetime.now()
            sync_run.status = "failed"
            sync_run.error = str(e)
            _persist_sync_log_entries()
            db.commit()
        raise HTTPException(status_code=500, detail="Failed to sync playlist")
    finally:
        if db:
            db.close()


@router.get("/{playlist_id}/sync-log", response_model=List[PersistentSyncLogEntry])
def get_playlist_sync_log(
    playlist_id: int,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    run_id: Optional[int] = None,
    include_success: bool = True,
    repo: PlaylistRepository = Depends(get_playlist_repository),
):
    playlist = repo.get_by_id(playlist_id)
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    sync_targets = repo.get_sync_targets(playlist_id)
    youtube_display_name = next(
        (
            target.config.get("playlist_name")
            for target in sync_targets
            if target.service == "youtube" and target.config.get("playlist_name")
        ),
        playlist.name,
    )

    db = Database.get_session()
    try:
        query = db.query(RemoteSyncEventDB).filter(RemoteSyncEventDB.playlist_id == playlist_id)

        if run_id is not None:
            query = query.filter(RemoteSyncEventDB.sync_run_id == run_id)

        if not include_success:
            query = query.filter(RemoteSyncEventDB.success == False)

        events = (
            query
            .order_by(RemoteSyncEventDB.created_at.desc(), RemoteSyncEventDB.id.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        return [
            PersistentSyncLogEntry(
                id=event.id,
                syncRunId=event.sync_run_id,
                playlistId=event.playlist_id,
                createdAt=event.created_at,
                eventKind=event.event_kind,
                action=event.action,
                track=event.track,
                target=event.target,
                targetName=youtube_display_name if event.target == "youtube" else event.target_name,
                reason=event.reason,
                success=event.success,
                error=event.error,
                metadata=event.event_metadata,
            )
            for event in events
        ]
    except Exception as e:
        logging.error(f"Failed to read sync log for playlist {playlist_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to read sync log")
    finally:
        db.close()

def merge_sync_plans(plan1, plan2):
    """Merge two sync plans (lists of SyncChange instances) into a unified plan"""
    index_by_key = {change.item.to_string(): i for i, change in enumerate(plan1)}

    for change in plan2:
        key = change.item.to_string()
        existing_index = index_by_key.get(key)
        if existing_index is None:
            index_by_key[key] = len(plan1)
            plan1.append(change)
        else:
            # Same item surfaced from more than one target's plan (e.g. added remotely on both
            # Plex and YouTube) - keep a single change but remember every target it came from, so
            # a 'remote' change isn't later misattributed to a target that never actually saw it.
            existing = plan1[existing_index]
            merged_origins = tuple(set(existing.origin_target_ids) | set(change.origin_target_ids))
            plan1[existing_index] = existing._replace(origin_target_ids=merged_origins)

    return plan1


@dataclass
class TargetInitResult:
    """Result of initializing every configured sync target for one sync run."""
    contexts: Dict[int, Dict[str, Any]] = field(default_factory=dict)
    current_snapshots: Dict[int, Optional[PlaylistSnapshot]] = field(default_factory=dict)
    old_snapshots: Dict[int, Optional[PlaylistSnapshot]] = field(default_factory=dict)
    log_entries: List[SyncLogEntry] = field(default_factory=list)
    failures: List[Dict[str, str]] = field(default_factory=list)


def _initialize_target_contexts(
    db,
    sync_targets: List[SyncTarget],
    playlist: PlaylistDB,
    playlist_id: int,
    local_snapshot: PlaylistSnapshot,
) -> TargetInitResult:
    """Build a remote repo and fetch its snapshots for each target, auto-creating the remote
    playlist if it doesn't exist yet. Catches RemoteUnavailableError (skip target, log 'skip')
    and any other exception (skip target, record failure) per-target - nothing here aborts the
    sync for the other targets.

    The three _persist_remote_playlist_id call sites below (after the initial fetch, after
    create_playlist, after the post-creation re-fetch) are a distinct commit point each and must
    stay in this order/count: if a later one throws, the earlier persisted id must remain in
    place, same as before this was extracted into its own function.
    """
    result = TargetInitResult()

    for target in sync_targets:
        try:
            config = target.config

            target_ref = _get_remote_playlist_ref(config, playlist.name)
            target_create_title = _get_remote_playlist_create_title(config, playlist.name)
            # Bookkeeping snapshots (our own record of "what did we last sync") are keyed by
            # this instead of target_ref: target_ref can change out from under us once the
            # remote playlist id gets persisted (see _persist_remote_playlist_id), which would
            # otherwise orphan the previous snapshot row and force a full re-diff every sync.
            snapshot_key = f"synctarget:{target.id}"

            remote_repo = create_remote_repository(
                service=target.service,
                session=db,
                config=config,
                music_file_repo=get_music_file_repository(db)
            )

            if remote_repo is None:
                raise Exception(f"Unsupported service: {target.service}")

            if not remote_repo.is_authenticated():
                raise Exception(f"Authentication failed for service: {target.service}")

            context = {
                'repo': remote_repo,
                'target': target,
                'target_ref': target_ref or f"{target.service}_playlist",
                'target_name': _get_remote_playlist_display_name(target.config, playlist.name),
                'snapshot_key': snapshot_key,
            }
            result.contexts[target.id] = context

            result.old_snapshots[target.id] = remote_repo.get_current_snapshot(context['snapshot_key'])
            result.current_snapshots[target.id] = remote_repo.get_playlist_snapshot(context['target_ref'])

            _persist_remote_playlist_id(db, target, playlist_id, getattr(remote_repo, "playlist_id", None))

            if not result.current_snapshots[target.id]:
                # remote playlist doesn't exist - let's create it
                result.log_entries.append(SyncLogEntry(
                    action="create",
                    track=f"Playlist '{context['target_name']}'",
                    target=target.service,
                    target_name=context['target_name'],
                    reason="Remote playlist did not exist",
                    success=True,
                    eventKind="system"
                ))
                logging.info(f"Creating new remote playlist for {target.service} target {target.id}")

                created_playlist = remote_repo.create_playlist(target_create_title, local_snapshot)

                remote_playlist_id = getattr(remote_repo, "playlist_id", None)
                if not remote_playlist_id:
                    if isinstance(created_playlist, dict):
                        remote_playlist_id = created_playlist.get("id") or created_playlist.get("playlist_id")
                    else:
                        remote_playlist_id = getattr(created_playlist, "id", None) or getattr(created_playlist, "playlist_id", None)

                _persist_remote_playlist_id(db, target, playlist_id, remote_playlist_id)

                result.current_snapshots[target.id] = remote_repo.get_playlist_snapshot(context['target_ref'])
                _persist_remote_playlist_id(db, target, playlist_id, getattr(remote_repo, "playlist_id", None))

            logging.info(f"Initialized {target.service} repository for target {target.id}")

        except RemoteUnavailableError as e:
            # The remote couldn't be reached/queried this sync - skip it entirely rather than
            # falling through to the "remote playlist doesn't exist" create/reset path above,
            # which would otherwise treat "couldn't check" as "confirmed empty".
            logging.warning(f"Skipping {target.service} target {target.id} for this sync - remote unavailable: {e}")
            result.contexts.pop(target.id, None)
            result.log_entries.append(SyncLogEntry(
                action="skip",
                track=f"Target '{target.service}'",
                target=target.service,
                target_name=_get_remote_playlist_display_name(target.config, playlist.name),
                reason=f"Remote unavailable, skipped this sync: {e}",
                success=False,
                eventKind="system"
            ))
            result.failures.append({
                "service": target.service,
                "target_id": target.id,
                "error": f"Remote unavailable: {str(e)}"
            })

        except Exception as e:
            logging.error(f"Failed to initialize {target.service} target {target.id}: {e}", exc_info=True)
            result.failures.append({
                "service": target.service,
                "target_id": target.id,
                "error": f"Failed to initialize: {str(e)}"
            })

    return result


@dataclass
class PlanBuildResult:
    """Result of building and merging every target's own sync plan into one unified plan."""
    unified_plan: Optional[List[SyncChange]] = None
    individual_plans: Dict[int, Dict[str, Any]] = field(default_factory=dict)
    log_entries: List[SyncLogEntry] = field(default_factory=list)
    failures: List[Dict[str, str]] = field(default_factory=list)


def _build_unified_sync_plan(
    target_contexts: Dict[int, Dict[str, Any]],
    current_snapshots: Dict[int, Optional[PlaylistSnapshot]],
    old_snapshots: Dict[int, Optional[PlaylistSnapshot]],
    local_snapshot: PlaylistSnapshot,
    force_push: bool,
) -> PlanBuildResult:
    """Build each target's own sync plan and merge them into one unified plan.

    Order matters and must not change: build plan -> filter out changes for disabled
    receiveEntryAdds/receiveEntryRemovals -> apply_sync_guardrails -> merge. The guardrail's
    removal-percentage check runs AFTER disabled-target removes are already filtered out, so
    reordering these steps changes what the guardrail sees.

    Force-push's clear_playlist() call is deliberately kept here, mid-loop, matching prior
    behavior exactly: it's a real destructive remote mutation embedded in an otherwise
    plan-building phase, by design - not something to "clean up" as part of this refactor.
    """
    result = PlanBuildResult()

    if force_push:
        logging.info("🔥 FORCE PUSH SYNC requested - all remote playlists will be completely replaced with local content")
        result.log_entries.append(SyncLogEntry(
            action="force_push",
            track="FORCE PUSH SYNC",
            target="system",
            target_name="All targets",
            reason="Force push sync initiated - all remote content will be replaced",
            success=True,
            eventKind="system"
        ))

    for target_id, repo_info in target_contexts.items():
        try:
            remote_repo = repo_info['repo']
            target = repo_info['target']
            target_name = repo_info['target_name']

            if force_push:
                if not target.sendEntryAdds or not target.sendEntryRemovals:
                    logging.warning(f"Skipping force push for target {target_id} ({target.service}): requires both sendEntryAdds and sendEntryRemovals to be enabled")
                    result.failures.append({
                        "service": target.service,
                        "target_id": target_id,
                        "error": "Force push requires both send adds and send removes to be enabled"
                    })
                    continue

                logging.info(f"Creating force push sync plan for {target.service} target {target_id}")
                sync_plan = remote_repo.create_force_push_sync_plan(
                    new_remote_snapshot=current_snapshots.get(target_id),
                    new_local_snapshot=local_snapshot,
                    sync_target=target
                )

                logging.info("Clearing remote playlist for force push")
                remote_repo.clear_playlist()
            else:
                sync_plan = remote_repo.create_sync_plan(
                    old_remote_snapshot=old_snapshots.get(target_id),
                    new_remote_snapshot=current_snapshots.get(target_id),
                    new_local_snapshot=local_snapshot,
                    sync_target=target
                )

            result.individual_plans[target_id] = {
                'plan': sync_plan,
                'repo_info': repo_info
            }

            if not target.receiveEntryAdds:
                # remove sync changes with a source of remote
                sync_plan = [
                    change for change in sync_plan
                    if change.action != 'add' or change.source != 'remote'
                ]

            if not target.receiveEntryRemovals:
                # remove sync changes with a source of remote
                sync_plan = [
                    change for change in sync_plan
                    if change.action != 'remove' or change.source != 'remote'
                ]

            sync_plan = remote_repo.apply_sync_guardrails(
                plan=sync_plan,
                new_local_snapshot=local_snapshot,
                sync_target=target,
                target_name=target_name,
            )

            if result.unified_plan is None:
                result.unified_plan = sync_plan
            else:
                result.unified_plan = merge_sync_plans(result.unified_plan, sync_plan)

            logging.info(f"Created sync plan for {target.service} target {target_id}")

        except Exception as e:
            logging.error(f"Failed to create sync plan for target {target_id}: {e}", exc_info=True)
            result.failures.append({
                "service": repo_info['target'].service,
                "target_id": target_id,
                "error": f"Failed to create sync plan: {str(e)}"
            })

    return result


@dataclass(frozen=True)
class TargetSyncInfo:
    """Minimal, I/O-free view of a sync target - deliberately excludes the repo/session so this
    stays constructible with plain data in tests, independent of decide_sync_plan_application's
    other callers needing the full repo_info dict for actual network calls."""
    target: SyncTarget
    target_name: str


@dataclass
class SyncPlanApplyDecision:
    """Result of deciding what to do with each change in a unified sync plan, before anything
    is actually applied."""
    local_changes: List[SyncChange] = field(default_factory=list)
    remote_ops: Dict[int, Dict[str, List[SyncChange]]] = field(default_factory=dict)
    receive_log_entries: List[SyncLogEntry] = field(default_factory=list)


def decide_sync_plan_application(
    unified_plan: List[SyncChange],
    target_infos: Dict[int, TargetSyncInfo],
    current_snapshots: Dict[int, Optional[PlaylistSnapshot]],
    force_push: bool,
) -> SyncPlanApplyDecision:
    """Pure decision logic for applying a unified sync plan - no db/session/network access.

    For every change, selects it for local application if it didn't originate locally. Then,
    for every (change, target) pair, decides whether to queue the change as a pending remote
    add/remove for that target (respecting sendEntryAdds/sendEntryRemovals, force_push, and
    whether current_snapshots[target_id] already/still has the item) or to emit a "receive" log
    entry crediting that target (respecting receiveEntryAdds/receiveEntryRemovals AND
    target_id in change.origin_target_ids - a 'remote' change must only be credited to the
    target(s) it was actually observed on, never to every target with receiveEntryAdds set).
    """
    decision = SyncPlanApplyDecision(
        remote_ops={target_id: {"add": [], "remove": []} for target_id in target_infos}
    )

    for change in unified_plan:
        if change.source != "local":
            decision.local_changes.append(change)

        for target_id, info in target_infos.items():
            target = info.target
            this_snapshot = current_snapshots.get(target_id)

            if change.action == "add":
                if target.sendEntryAdds and change.source == "local":
                    should_add = force_push or (not this_snapshot) or (not this_snapshot.has(change.item))
                    if should_add:
                        decision.remote_ops[target_id]["add"].append(change)
                elif target.receiveEntryAdds and change.source == "remote" and target_id in change.origin_target_ids:
                    decision.receive_log_entries.append(SyncLogEntry(
                        action="add",
                        track=change.item.to_string(),
                        target=target.service,
                        target_name=info.target_name,
                        reason=change.reason,
                        success=True,
                        eventKind="change"
                    ))

            elif change.action == "remove":
                if target.sendEntryRemovals and change.source == "local":
                    if (not this_snapshot) or this_snapshot.has(change.item):
                        decision.remote_ops[target_id]["remove"].append(change)
                elif target.receiveEntryRemovals and change.source == "remote" and target_id in change.origin_target_ids:
                    decision.receive_log_entries.append(SyncLogEntry(
                        action="remove",
                        track=change.item.to_string(),
                        target=target.service,
                        target_name=info.target_name,
                        reason=change.reason,
                        success=True,
                        eventKind="change"
                    ))

    return decision


def _apply_local_change(repo: PlaylistRepository, playlist_id: int, playlist_name: str, change: SyncChange) -> List[SyncLogEntry]:
    """Perform one local add/remove mutation. Never raises - returns an 'error' log entry
    instead, matching the try/except this replaced."""
    entries: List[SyncLogEntry] = []

    try:
        if change.action == 'add':
            logging.info(f"Adding {change.item.to_string()} to local playlist")
            result = repo.add_music_file(playlist_id, change.item, normalize=True)
            if not result:
                logging.info(f"Could not find music file for {change.item.to_string()}, adding as requested track")
                repo.add_requested_track(playlist_id, change.item)
            else:
                unmatched_entries = [entry for entry in result if not getattr(entry, "music_file_id", None)]
                for unmatched_entry in unmatched_entries:
                    unmatched_details = getattr(unmatched_entry, "details", None)
                    unmatched_track = change.item.to_string()
                    if unmatched_details and unmatched_details.artist and unmatched_details.title:
                        unmatched_track = f"{unmatched_details.artist} - {unmatched_details.title}"

                    entries.append(SyncLogEntry(
                        action="failed_match",
                        track=unmatched_track,
                        target="local",
                        target_name=playlist_name,
                        reason="No local library match found; added as requested track",
                        success=False,
                        eventKind="failed_match",
                        metadata={
                            "source": change.source,
                            "original_reason": change.reason
                        }
                    ))

            entries.append(SyncLogEntry(
                action="add",
                track=change.item.to_string(),
                target="local",
                target_name=playlist_name,
                reason=change.reason,
                success=True,
                eventKind="change"
            ))

        if change.action == 'remove':
            logging.info(f"Removing {change.item.to_string()} from local playlist")
            repo.remove_music_file(playlist_id, change.item)

            entries.append(SyncLogEntry(
                action="remove",
                track=change.item.to_string(),
                target="local",
                target_name=playlist_name,
                reason=change.reason,
                success=True,
                eventKind="change"
            ))

    except Exception as e:
        logging.error(f"Failed to apply local change: {e}", exc_info=True)
        entries.append(SyncLogEntry(
            action=change.action,
            track=change.item.to_string(),
            target="local",
            target_name=playlist_name,
            reason=change.reason,
            success=False,
            error=str(e),
            eventKind="error"
        ))

    return entries


def _flush_remote_operations(
    pending_remote_ops: Dict[int, Dict[str, List[SyncChange]]],
    individual_plans: Dict[int, Dict[str, Any]],
    remote_batch_size: int = 100,
) -> Tuple[List[SyncLogEntry], List[Dict[str, str]]]:
    """Push each target's queued adds/removes to its remote, in chunks.

    target_ref always comes from that target's own individual_plans[target_id]['repo_info'] -
    never a variable left over from a previous loop iteration. This is exactly the shape of an
    already-fixed bug; test_multi_target_sync_applies_changes_to_each_targets_own_remote_playlist
    is the canary for this.
    """
    log_entries: List[SyncLogEntry] = []
    failures: List[Dict[str, str]] = []

    for target_id, batched_ops in pending_remote_ops.items():
        repo_info = individual_plans[target_id]['repo_info']
        remote_repo = repo_info['repo']
        target = repo_info['target']
        target_name = repo_info['target_name']
        target_ref = repo_info['target_ref']

        add_changes = batched_ops["add"]
        if add_changes:
            try:
                for change_chunk in _chunk_changes(add_changes, remote_batch_size):
                    remote_repo.add_items(target_ref, [change.item for change in change_chunk])
                    for change in change_chunk:
                        log_entries.append(SyncLogEntry(
                            action="add",
                            track=change.item.to_string(),
                            target=target.service,
                            target_name=target_name,
                            reason=change.reason,
                            success=True,
                            eventKind="change"
                        ))
            except Exception as e:
                logging.error(f"Failed to apply batched add sync for target {target_id}: {e}", exc_info=True)
                for change in add_changes:
                    log_entries.append(SyncLogEntry(
                        action="add",
                        track=change.item.to_string(),
                        target=target.service,
                        target_name=target_name,
                        reason=change.reason,
                        success=False,
                        error=str(e),
                        eventKind="error"
                    ))
                failures.append({
                    "service": target.service,
                    "target_id": target_id,
                    "error": f"Failed to apply batched adds: {str(e)}"
                })

        remove_changes = batched_ops["remove"]
        if remove_changes:
            try:
                for change_chunk in _chunk_changes(remove_changes, remote_batch_size):
                    remote_repo.remove_items(target_ref, [change.item for change in change_chunk])
                    for change in change_chunk:
                        log_entries.append(SyncLogEntry(
                            action="remove",
                            track=change.item.to_string(),
                            target=target.service,
                            target_name=target_name,
                            reason=change.reason,
                            success=True,
                            eventKind="change"
                        ))
            except Exception as e:
                logging.error(f"Failed to apply batched remove sync for target {target_id}: {e}", exc_info=True)
                for change in remove_changes:
                    log_entries.append(SyncLogEntry(
                        action="remove",
                        track=change.item.to_string(),
                        target=target.service,
                        target_name=target_name,
                        reason=change.reason,
                        success=False,
                        error=str(e),
                        eventKind="error"
                    ))
                failures.append({
                    "service": target.service,
                    "target_id": target_id,
                    "error": f"Failed to apply batched removes: {str(e)}"
                })

    return log_entries, failures


def _persist_post_sync_snapshots(
    individual_plans: Dict[int, Dict[str, Any]],
    target_contexts: Dict[int, Dict[str, Any]],
    playlist: PlaylistDB,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Fetch and write each target's post-apply remote snapshot (keyed by snapshot_key - the
    stable key, not the remote's own possibly-changing name), then write the local snapshot via
    the first available repo.

    Deliberately reads that "first available repo" from target_contexts (every target that
    initialized successfully in Phase B), not individual_plans (the subset that made it through
    Phase C, which can be smaller - e.g. a force-push target skipped there for missing
    send flags). This matches prior behavior exactly, which is guaranteed non-empty by the
    caller's earlier check on target_contexts.
    """
    successes: List[Dict[str, Any]] = []
    failures: List[Dict[str, Any]] = []

    for target_id, plan_info in individual_plans.items():
        try:
            repo_info = plan_info['repo_info']
            remote_repo = repo_info['repo']
            target_name = repo_info['target_name']
            target_ref = repo_info['target_ref']

            new_snapshot = remote_repo.get_playlist_snapshot(target_ref)
            if new_snapshot:
                # Persist under snapshot_key (stable), not new_snapshot.name (the remote's own,
                # possibly-changing title) - see snapshot_key comment in _initialize_target_contexts.
                new_snapshot.name = repo_info['snapshot_key']
                remote_repo.write_snapshot(new_snapshot)
                successes.append({
                    "service": repo_info['target'].service,
                    "target_id": target_id,
                    "target_name": target_name
                })
        except Exception as e:
            logging.error(f"Failed to write snapshot for target {target_id}: {e}", exc_info=True)
            failures.append({
                "service": repo_info['target'].service,
                "target_id": target_id,
                "error": f"Failed to write snapshot: {str(e)}"
            })

    new_local_snapshot = create_snapshot(playlist)
    first_repo = next(iter(target_contexts.values()))['repo']
    first_repo.write_snapshot(new_local_snapshot)

    return successes, failures


@router.put("/{playlist_id}/update-entry")
def update_entry_details(
    playlist_id: int, 
    update_request: dict = Body(...),
    repo: PlaylistRepository = Depends(get_playlist_repository)
):
    """Update specific fields of a playlist entry"""
    try:
        track_id = update_request.get('track_id')
        updates = update_request.get('updates', {})
        
        if not track_id:
            raise HTTPException(status_code=400, detail="track_id is required")
        
        # Find the playlist entry
        entry = repo.session.query(PlaylistEntryDB).filter(
            PlaylistEntryDB.playlist_id == playlist_id,
            PlaylistEntryDB.id == track_id
        ).first()
        
        if not entry:
            raise HTTPException(status_code=404, detail="Entry not found")
        
        # Update other entry-level fields as needed
        updatable_fields = ['notes']  # Add other entry-level fields here as needed
        for field in updatable_fields:
            if field in updates:
                setattr(entry, field, updates[field])
                logging.info(f"Updated {field} for playlist entry {entry.id}: {updates[field]}")
        
        repo.session.commit()
        
        return {"message": "Entry updated successfully"}
        
    except Exception as e:
        logging.error(f"Failed to update entry: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update entry")

@router.post("/{playlist_id}/hide")
def hide_entries(
    playlist_id: int,
    request_data: dict = Body(...),  # Change this line
    repo: PlaylistRepository = Depends(get_playlist_repository),
):
    try:
        # Extract data from the request body
        entry_ids = request_data.get('entry_ids', [])
        hide = request_data.get('hide', True)
        
        if not entry_ids:
            raise HTTPException(status_code=400, detail="entry_ids is required")
        
        repo.hide_entries(playlist_id, entry_ids, hide)
        return {"status": "success", "hidden": hide, "count": len(entry_ids)}
    except Exception as e:
        logging.error(f"Failed to hide entries: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to hide entries")

# Update existing filter endpoint to support include_hidden parameter
@router.get("/{playlist_id}/filter")
def filter_playlist(
    playlist_id: int,
    filter: Optional[str] = None,
    sort_criteria: Optional[str] = None,
    sort_direction: Optional[str] = None,
    limit: Optional[int] = None,
    offset: Optional[int] = None,
    include_hidden: Optional[bool] = False,
    count_only: Optional[bool] = False,
    random_seed: Optional[int] = None,
    repo: PlaylistRepository = Depends(get_playlist_repository)
):
    try:
        playlist_filter = PlaylistFilter(
            filter=filter,
            sortCriteria=PlaylistSortCriteria[sort_criteria.upper()] if sort_criteria else PlaylistSortCriteria.ORDER,
            sortDirection=PlaylistSortDirection[sort_direction.upper()] if sort_direction else PlaylistSortDirection.ASC,
            limit=limit,
            offset=offset,
            include_hidden=include_hidden,
            randomSeed=random_seed
        )
        
        result = repo.filter_playlist(playlist_id, playlist_filter, count_only=count_only)
        return result
    except Exception as e:
        logging.error(f"Failed to filter playlist: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to filter playlist")