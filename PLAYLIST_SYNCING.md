# Playlist Syncing

This document describes how OpenPlaylist syncs playlists between the local library and remote services.

## Scope

Playlist syncing includes:

- configuring remote sync targets per playlist
- importing or exporting playlist snapshots
- matching local tracks to remote items
- scheduled playlist sync jobs
- playlist-level auto-sync eligibility

## Main Areas In The Repo

- `frontend/src/components/playlist/SyncConfig.tsx`: per-playlist sync target configuration
- `frontend/src/components/nav/ScheduledTasksPanel.tsx`: scheduled sync execution and auto-sync configuration entry point
- `backend/repositories/playlist_repository.py`: local playlist operations
- `backend/repositories/spotify_repository.py`, `youtube_repository.py`, `plex_repository.py`: remote service integrations
- `backend/routes/scheduled_tasks.py`: scheduled task and playlist auto-sync endpoints
- `backend/lib/match.py` and `backend/lib/normalize.py`: match and normalization helpers

## Conceptual Split

- Sync targets define where and how a playlist synchronizes remotely.
- Auto-sync marks whether a playlist should participate in scheduled playlist-sync runs.
- Scheduled tasks define when sync jobs actually execute.

## Editing Guidelines

- Keep the split between per-playlist sync configuration, auto-sync eligibility, and scheduled execution clear.
- When changing sync payloads, verify both frontend config screens and backend repository expectations.
- Matching changes can alter sync quality across all services, so treat them as broad-impact changes.