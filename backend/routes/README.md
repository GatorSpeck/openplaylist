# API Routes

This folder contains route modules for backend API surfaces that are large enough to live outside `backend/main.py`.

## Current Areas

- `playlists.py`: playlist CRUD, entry operations, and playlist-related actions
- `scheduled_tasks.py`: scheduled jobs and playlist auto-sync endpoints
- `spotify_router.py`: Spotify authentication and related API flow separation

## Responsibilities

- validate request data
- orchestrate repository or service-layer calls
- keep request/response contracts stable for the frontend
- avoid embedding complex matching or normalization logic directly in route handlers

## Editing Guidelines

- Prefer pushing reusable logic into repositories or library helpers.
- Keep route handlers thin and explicit.
- If a change affects frontend payloads, verify both the requesting component and response models.
