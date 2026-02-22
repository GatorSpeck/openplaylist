from fastapi import APIRouter
from sqlalchemy.orm import joinedload
from fastapi.responses import StreamingResponse
from repositories.playlist_repository import PlaylistRepository, PlaylistFilter, PlaylistSortCriteria, PlaylistSortDirection
from fastapi import Query, APIRouter, Depends, Body, File, UploadFile
from response_models import Playlist, PlaylistEntry, PlaylistEntriesResponse, AlterPlaylistDetails, LinkChangeRequest, MusicFileEntry, RequestedAlbumEntry, Album, TrackDetails, PlaylistEntryStub, SyncTarget, SyncLogEntry
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
from models import PlaylistDB, PlaylistEntryDB, MusicFileEntryDB
import pathlib
import os
from repositories.requests_cache_session import requests_cache_session
from pydantic import BaseModel
from typing import Dict, Optional, List, Union, Any
from repositories.remote_repository_factory import create_remote_repository
from repositories.remote_playlist_repository import SyncChange, create_snapshot
from profiling import profile_function

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
    remote_batch_size = 100

    def _chunk_changes(changes: List[SyncChange], chunk_size: int):
        for idx in range(0, len(changes), chunk_size):
            yield changes[idx:idx + chunk_size]
    
    try:
        # Get all enabled sync targets for this playlist
        sync_targets = repo.get_sync_targets(playlist_id)
        
        if not sync_targets:
            raise HTTPException(status_code=404, detail="No sync targets configured for this playlist")
        
        # Just get enabled targets
        sync_targets = [target for target in sync_targets if target.enabled]
        if not sync_targets:
            raise HTTPException(status_code=404, detail="No enabled sync targets found for this playlist")
        
        # Initialize success and error counters
        results = {
            "success": [],
            "failed": []
        }
        
        db = Database.get_session()
        
        # Step 1: Initialize all remote repositories and collect current snapshots
        remote_repos = {}
        current_snapshots = {}
        old_snapshots = {}
        
        # Step 2: Get the current local snapshot
        playlist = repo.get_by_id(playlist_id)
        if not playlist:
            raise HTTPException(status_code=404, detail="Playlist not found")
    
        local_snapshot = create_snapshot(playlist)
        
        for target in sync_targets:
            try:
                # Parse the config
                config = target.config
                
                # Get the target name if available
                target_name = config.get('playlist_name', None)
                if not target_name and target.service == 'plex':
                    # Use playlist name as fallback for Plex
                    playlist = repo.get_by_id(playlist_id)
                    target_name = playlist.name
                if not target_name and target.service == 'spotify':
                    target_name = config.get('playlist_uri', None)
                
                # Create the appropriate repository
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

                # Store the repository and target name for later use
                remote_repos[target.id] = {
                    'repo': remote_repo,
                    'target': target,
                    'target_name': target_name or f"{target.service}_playlist"
                }
                
                # Get current and old snapshots for unified planning
                old_snapshots[target.id] = remote_repo.get_current_snapshot(target_name or f"{target.service}_playlist")
                current_snapshots[target.id] = remote_repo.get_playlist_snapshot(target_name or f"{target.service}_playlist")

                if not current_snapshots[target.id]:
                    # remote playlist doesn't exist - let's create it
                    sync_log.append(SyncLogEntry(
                        action="create",
                        track=f"Playlist '{target_name or f'{target.service}_playlist'}'",
                        target=target.service,
                        target_name=target_name,
                        reason="Remote playlist did not exist",
                        success=True
                    ))
                    logging.info(f"Creating new remote playlist for {target.service} target {target.id}")

                    remote_repo.create_playlist(target_name or f"{target.service}_playlist", local_snapshot)
                    current_snapshots[target.id] = remote_repo.get_playlist_snapshot(target_name or f"{target.service}_playlist")

                logging.info(f"Initialized {target.service} repository for target {target.id}")
                
            except Exception as e:
                logging.error(f"Failed to initialize {target.service} target {target.id}: {e}", exc_info=True)
                results["failed"].append({
                    "service": target.service,
                    "target_id": target.id,
                    "error": f"Failed to initialize: {str(e)}"
                })
        
        # If no repositories were successfully initialized, return early
        if not remote_repos:
            raise HTTPException(status_code=500, detail="Failed to initialize any remote repositories")
        
        # Step 3: Create individual sync plans and combine into unified plan
        individual_plans = {}
        unified_plan = None
        
        if force_push:
            logging.info("🔥 FORCE PUSH SYNC requested - all remote playlists will be completely replaced with local content")
            sync_log.append(SyncLogEntry(
                action="force_push",
                track="FORCE PUSH SYNC",
                target="system",
                target_name="All targets",
                reason="Force push sync initiated - all remote content will be replaced",
                success=True
            ))
        
        for target_id, repo_info in remote_repos.items():
            try:
                remote_repo = repo_info['repo']
                target = repo_info['target']
                target_name = repo_info['target_name']
                
                # Create sync plan for this target
                if force_push:
                    # Validate that target supports force push
                    if not target.sendEntryAdds or not target.sendEntryRemovals:
                        logging.warning(f"Skipping force push for target {target_id} ({target.service}): requires both sendEntryAdds and sendEntryRemovals to be enabled")
                        results["failed"].append({
                            "service": target.service,
                            "target_id": target_id,
                            "error": "Force push requires both send adds and send removes to be enabled"
                        })
                        continue
                    
                    # Use force push sync plan
                    logging.info(f"Creating force push sync plan for {target.service} target {target_id}")
                    sync_plan = remote_repo.create_force_push_sync_plan(
                        new_remote_snapshot=current_snapshots.get(target_id),
                        new_local_snapshot=local_snapshot,
                        sync_target=target
                    )

                    logging.info("Clearing remote playlist for force push")
                    remote_repo.clear_playlist()
                else:
                    # Use normal sync plan
                    sync_plan = remote_repo.create_sync_plan(
                        old_remote_snapshot=old_snapshots.get(target_id),
                        new_remote_snapshot=current_snapshots.get(target_id),
                        new_local_snapshot=local_snapshot,
                        sync_target=target
                    )
                
                individual_plans[target_id] = {
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
                
                # Create or merge into unified plan
                if unified_plan is None:
                    # Use the first plan as the base unified plan
                    unified_plan = sync_plan
                else:
                    # Merge this plan with the unified plan
                    unified_plan = merge_sync_plans(unified_plan, sync_plan)
                
                logging.info(f"Created sync plan for {target.service} target {target_id}")
                
            except Exception as e:
                logging.error(f"Failed to create sync plan for target {target_id}: {e}", exc_info=True)
                results["failed"].append({
                    "service": repo_info['target'].service,
                    "target_id": target_id,
                    "error": f"Failed to create sync plan: {str(e)}"
                })
        
        # If we don't have a unified plan, we can't proceed
        if unified_plan is None:
            raise HTTPException(status_code=500, detail="Failed to create any sync plans")
        
        logging.info("Unified sync plan:")
        for change in unified_plan:
            logging.info(f"{change.action} {change.item.to_string()} (source: {change.source}, reason: {change.reason})")

        pending_remote_ops = {
            target_id: {
                "add": [],
                "remove": []
            }
            for target_id in individual_plans.keys()
        }
        
        # Step 4: Apply the unified sync plan
        for change in unified_plan:
            logging.info(f"Processing change: {change.action} {change.item.to_string()} (source: {change.source}, reason: {change.reason})")

            # apply local changes first, only if the change is not from a remote source
            if change.source != "local":
                try:
                    if change.action == 'add':
                        logging.info(f"Adding {change.item.to_string()} to local playlist")
                        result = repo.add_music_file(playlist_id, change.item, normalize=True)
                        if not result:
                            logging.info(f"Could not find music file for {change.item.to_string()}, adding as requested track")
                            repo.add_requested_track(playlist_id, change.item)
                        
                        sync_log.append(SyncLogEntry(
                            action="add",
                            track=change.item.to_string(),
                            target="local",
                            target_name=playlist.name,
                            reason=change.reason,
                            success=True
                        ))

                    if change.action == 'remove':
                        logging.info(f"Removing {change.item.to_string()} from local playlist")
                        repo.remove_music_file(playlist_id, change.item)
                        
                        sync_log.append(SyncLogEntry(
                            action="remove",
                            track=change.item.to_string(),
                            target="local",
                            target_name=playlist.name,
                            reason=change.reason,
                            success=True
                        ))
                        
                except Exception as e:
                    logging.error(f"Failed to apply local change: {e}", exc_info=True)
                    sync_log.append(SyncLogEntry(
                        action=change.action,
                        track=change.item.to_string(),
                        target="local",
                        target_name=playlist.name,
                        reason=change.reason,
                        success=False,
                        error=str(e)
                    ))

            # Apply changes to each remote target
            for target_id, plan_info in individual_plans.items():
                try:
                    repo_info = plan_info['repo_info']
                    remote_repo = repo_info['repo']
                    target = repo_info['target']
                    target_name = repo_info['target_name']

                    logging.info(f"Syncing with target: {target_name}")

                    this_snapshot = current_snapshots[target_id]

                    if change.source == "local" or change.source == "remote":
                        if change.action == "add":
                            # Send adds to remote if enabled
                            if target.sendEntryAdds and change.source == "local":
                                # For force push, always add items without checking snapshot
                                # For regular sync, check if the item is already in the remote snapshot
                                should_add = force_push or (not this_snapshot) or (not this_snapshot.has(change.item))
                                
                                if should_add:
                                    pending_remote_ops[target_id]["add"].append(change)
                            
                            # Receive adds from remote if enabled
                            elif target.receiveEntryAdds and change.source == "remote":
                                sync_log.append(SyncLogEntry(
                                    action="add",
                                    track=change.item.to_string(),
                                    target=target.service,
                                    target_name=target_name,
                                    reason=f"Received from {target.service} playlist",
                                    success=True
                                ))

                        elif change.action == "remove":
                            # Send removes to remote if enabled
                            if target.sendEntryRemovals and change.source == "local":
                                if (not this_snapshot) or this_snapshot.has(change.item):
                                    pending_remote_ops[target_id]["remove"].append(change)
                            
                            # Receive removes from remote if enabled
                            elif target.receiveEntryRemovals and change.source == "remote":
                                sync_log.append(SyncLogEntry(
                                    action="remove",
                                    track=change.item.to_string(),
                                    target=target.service,
                                    target_name=target_name,
                                    reason=f"Removed from {target.service} playlist",
                                    success=True
                                ))
                
                except Exception as e:
                    logging.error(f"Failed to apply sync plan for target {target_id}: {e}", exc_info=True)
                    sync_log.append(SyncLogEntry(
                        action=change.action,
                        track=change.item.to_string(),
                        target=repo_info['target'].service,
                        target_name=repo_info['target_name'],
                        reason=change.reason,
                        success=False,
                        error=str(e)
                    ))
                    results["failed"].append({
                        "service": repo_info['target'].service,
                        "target_id": target_id,
                        "error": f"Failed to apply sync plan: {str(e)}"
                    })

        # Flush batched remote operations for each target
        for target_id, batched_ops in pending_remote_ops.items():
            repo_info = individual_plans[target_id]['repo_info']
            remote_repo = repo_info['repo']
            target = repo_info['target']
            target_name = repo_info['target_name']

            add_changes = batched_ops["add"]
            if add_changes:
                try:
                    for change_chunk in _chunk_changes(add_changes, remote_batch_size):
                        remote_repo.add_items(target_name, [change.item for change in change_chunk])
                        for change in change_chunk:
                            sync_log.append(SyncLogEntry(
                                action="add",
                                track=change.item.to_string(),
                                target=target.service,
                                target_name=target_name,
                                reason=f"Added to {target.service} playlist",
                                success=True
                            ))
                except Exception as e:
                    logging.error(f"Failed to apply batched add sync for target {target_id}: {e}", exc_info=True)
                    for change in add_changes:
                        sync_log.append(SyncLogEntry(
                            action="add",
                            track=change.item.to_string(),
                            target=target.service,
                            target_name=target_name,
                            reason=change.reason,
                            success=False,
                            error=str(e)
                        ))
                    results["failed"].append({
                        "service": target.service,
                        "target_id": target_id,
                        "error": f"Failed to apply batched adds: {str(e)}"
                    })

            remove_changes = batched_ops["remove"]
            if remove_changes:
                try:
                    for change_chunk in _chunk_changes(remove_changes, remote_batch_size):
                        remote_repo.remove_items(target_name, [change.item for change in change_chunk])
                        for change in change_chunk:
                            sync_log.append(SyncLogEntry(
                                action="remove",
                                track=change.item.to_string(),
                                target=target.service,
                                target_name=target_name,
                                reason=f"Removed from {target.service} playlist",
                                success=True
                            ))
                except Exception as e:
                    logging.error(f"Failed to apply batched remove sync for target {target_id}: {e}", exc_info=True)
                    for change in remove_changes:
                        sync_log.append(SyncLogEntry(
                            action="remove",
                            track=change.item.to_string(),
                            target=target.service,
                            target_name=target_name,
                            reason=change.reason,
                            success=False,
                            error=str(e)
                        ))
                    results["failed"].append({
                        "service": target.service,
                        "target_id": target_id,
                        "error": f"Failed to apply batched removes: {str(e)}"
                    })
                    
        # write all remote snapshots
        for target_id, plan_info in individual_plans.items():
            try:
                repo_info = plan_info['repo_info']
                remote_repo = repo_info['repo']
                target_name = repo_info['target_name']

                # Get the new snapshot after applying changes
                new_snapshot = remote_repo.get_playlist_snapshot(target_name)
                if new_snapshot:
                    remote_repo.write_snapshot(new_snapshot)
                    results["success"].append({
                        "service": repo_info['target'].service,
                        "target_id": target_id,
                        "target_name": target_name
                    })
            except Exception as e:
                logging.error(f"Failed to write snapshot for target {target_id}: {e}", exc_info=True)
                results["failed"].append({
                    "service": repo_info['target'].service,
                    "target_id": target_id,
                    "error": f"Failed to write snapshot: {str(e)}"
                })
        
        # write local snapshot
        new_local_snapshot = create_snapshot(playlist)
        first_repo = next(iter(remote_repos.values()))['repo']
        first_repo.write_snapshot(new_local_snapshot)
        
        return {
            "status": "success" if not results["failed"] else "partial",
            "synced": results["success"],
            "failed": results["failed"],
            "summary": {
                "total_targets": len(sync_targets),
                "successful": len(results["success"]),
                "failed": len(results["failed"])
            },
            "log": sync_log  # Include the detailed sync log
        }
    
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logging.error(f"Failed to sync playlist: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to sync playlist")
    finally:
        if 'db' in locals():
            db.close()

def merge_sync_plans(plan1, plan2):
    """Merge two sync plans (lists of SyncChange instances) into a unified plan"""
    changes_seen = set()
    for change in plan1:
        changes_seen.add(change.item.to_string())

    for change in plan2:
        if change.item.to_string() in changes_seen:
            continue
        plan1.append(change)
        
    return plan1

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