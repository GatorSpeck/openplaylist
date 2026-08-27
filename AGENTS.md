# OpenPlaylist Agent Guide

This is the canonical repository instruction file for coding agents working in this project. If another tool-specific instruction file exists, it should point back here rather than define separate guidance.

## Project Overview

OpenPlaylist is a music library management system with a FastAPI backend and React frontend. The core architectural pattern is a repository-based design where external music services are abstracted behind repository interfaces for playlist synchronization and metadata enrichment.

### Key Components

- Backend: FastAPI + SQLAlchemy with MariaDB support
- Frontend: React + Vite with themed UI and some Material-UI usage
- Database: dual-model approach for file metadata vs. user-editable track data
- External integrations: Spotify, YouTube Music, Last.fm, Plex, Redis, OpenAI

## Preferred Workflow

Use the provided Justfile for dev workflows:
- `just clean`
- `just test`
    - `just test_backend`
    - `just test_frontend`

### Creating Database Migrations

```bash
cd backend && source venv/bin/activate
alembic revision --autogenerate -m "Description"
alembic upgrade head
```

## Architecture Notes

### File vs. Track Separation

The system maintains two distinct data layers:

- `LocalFileDB`: immutable file metadata from scanned tags
- `MusicFileDB`: user-editable track data that can override file metadata
- `sync_from_file_metadata()`: the key method for propagating file metadata into editable fields

Preserve this separation. Avoid mixing file-derived state with user-editable state in a single model path.

### Repository Pattern For External Services

All external integrations follow a consistent interface in `backend/repositories/`.

- Spotify: playlist import/export
- YouTube Music: remote playlist integration
- Plex: server and playlist sync
- Last.fm: album art and track suggestions

When adding or changing integrations:

1. Implement or extend the repository in `backend/repositories/`
2. Follow existing `get_playlist_snapshot()` import patterns where relevant
3. Keep normalization and matching logic in backend helpers rather than route handlers
4. Update frontend service status and configuration surfaces consistently

### Request Caching Strategy

- Redis is optionally used for expensive API calls such as OpenAI and Last.fm operations
- Session-based request caching exists via `requests_cache_session.py`
- Respect caching behavior for rate-limited services

### Frontend State And Performance

- State is primarily component-local React state
- Repository classes under `frontend/src/repositories/` are the frontend API boundary
- Large playlist views use virtualization and infinite-loading patterns
- Preserve list and drag/drop performance characteristics when editing playlist screens

## Project-Specific Conventions

### Music File Scanning

- `scan_directory()` in `backend/main.py` supports full and incremental scans
- Supported file types include `.mp3`, `.flac`, `.wav`, `.ogg`, and `.m4a`
- Background processing uses FastAPI `BackgroundTasks`

### Playlist Entry Polymorphism

Playlist entries use inheritance in `backend/models.py`:

- Base: `PlaylistEntryDB`
- Types: `MusicFileEntryDB`, `RequestedAlbumEntryDB`, `AlbumEntryDB`

Use `with_polymorphic()` when a query must load the correct subtype behavior.

### Configuration Management

- Environment variables are used heavily for service configuration
- `CONFIG_DIR` points to persistent config storage
- Music library locations come from JSON config

## External Service Patterns

### Authentication Flows

- Spotify: OAuth2 client credentials flow
- YouTube Music: browser-based OAuth with stored JSON credentials
- Plex: token-based authentication
- Last.fm: API key and shared secret

### Import And Export Behavior

When adding a new external service:

1. Create or extend the repository implementation
2. Add configuration validation in the settings flow
3. Add import/export routes following existing `main.py` patterns
4. Support both exact matches and requested tracks for unmatched items where applicable

### Metadata Enhancement

- Album art primarily comes from Last.fm via `get_album_art()`
- Track suggestions may come from Last.fm or OpenAI
- Normalization logic belongs in `lib/normalize.py`

## Database And Migrations

- Use Alembic for schema changes
- Migrations should be idempotent where practical
- Keep migrations compatible with both SQLite and MySQL/MariaDB
- Avoid database-specific features
- Be especially careful around polymorphic playlist entry models

### Performance Considerations

- Search fields are heavily indexed
- Genres are stored in a separate table for multiple genres per track
- Album relationships use many-to-many linking tables
- Operations that return large data sets should support pagination

## Coding Expectations

- Use `.md` files throughout in the repository for additional context about each area of code
- Prefer minimal, local changes over broad refactors
- Fix root causes instead of layering UI-only or route-only workarounds
- Preserve existing public APIs and payload shapes unless the task requires changing them
- Reuse existing patterns before introducing new abstractions
- Avoid creating parallel configuration flows when one already exists
- If behavior spans backend and frontend, verify both sides still agree on field names and semantics

### Documentation Maintenance

- Refer to the top-level `specs/` directory for project-wide design specs, and keep it up to date
- Keep folder-level `README.md` documentation up to date whenever you add, remove, or significantly reshape code in that folder.
- For any new significant folder, add a `README.md` in the same change that introduces the folder.
- Update neighboring folder READMEs when ownership or boundaries move between areas.
- Prefer concise, operational guidance: folder purpose, key files, and how to validate changes.

## UI Guidance

- All screens and UI components need to support dark mode
- Respect existing Tailwind theme tokens such as `bg-surface`, `text-text`, and dark-mode variants
- Avoid mixing default browser or library light-theme controls into screens without styling them for dark mode
- Preserve the established interaction model for playlist management, sync configuration, and large-table/list performance
- Keep settings and playlist actions discoverable but avoid duplicating advanced configuration in multiple places unless the UX explicitly requires it

## Common Hotspots

- Library scanning and missing-file handling: `backend/main.py`
- Core models: `backend/models.py`
- Scheduled jobs and playlist auto-sync: `backend/routes/scheduled_tasks.py`
- Playlist UI and options: `frontend/src/components/playlist/`
- Settings UI: `frontend/src/components/nav/SettingsModal.tsx`

## Testing

- Testing should focus on the core logic of the app
    - Special focus on frontend <-> backend interactions likely to cause runtime errors
- Avoid testing NFRs like performance and resource usage

## Before Finishing

- Run the narrowest relevant validation available
- Avoid reverting unrelated user changes
- If you change behavior that spans backend and frontend, verify both sides still agree on payloads and field names
