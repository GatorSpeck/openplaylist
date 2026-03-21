<!--
SYNC IMPACT REPORT
==================
Version change: (new) → 1.0.0
Modified principles: N/A (initial ratification)
Added sections: Core Principles (I–V), Technology Constraints, Development Workflow, Governance
Removed sections: N/A
Templates requiring updates:
  ✅ plan-template.md  — Constitution Check gates align with principles below
  ✅ spec-template.md  — No mandatory section changes required
  ✅ tasks-template.md — No principle-driven task-type changes required
Follow-up TODOs: None — all placeholders resolved
-->

# OpenPlaylist Constitution

## Core Principles

### I. Local Library as Source of Truth
The local music file library is the authoritative source for track identity and
metadata. Every external service interaction (Spotify, YouTube, Last.fm, Plex)
MUST enrich or synchronise against the local library — it MUST NOT silently
overwrite, delete, or replace locally-held data.

- File metadata (ID3 tags) MUST be stored in the immutable `LocalFileDB` layer.
- User-editable fields MUST live in the `MusicFileDB` layer and MUST NOT
  propagate back to the physical file without explicit user action.
- `sync_from_file_metadata()` is the only authorised path for propagating file
  data into editable fields.

### II. Playlist Integrity (NON-NEGOTIABLE)
Playlist content MUST never be silently corrupted. Any operation that modifies
playlist membership or ordering MUST be:

- **Reversible**: the previous state must be recoverable.
- **Validated**: entry types and relationships MUST be checked before commit.
- **Typed correctly**: queries involving `PlaylistEntryDB` subclasses MUST use
  `with_polymorphic()` to load the correct polymorphic type; raw base-table
  queries on entries are forbidden in production code paths.

### III. Performance at Scale
The system MUST remain responsive with libraries containing tens of thousands
of tracks and playlists containing tens of thousands of entries.

- All list endpoints MUST implement server-side pagination and filtering; client-
  side-only pagination over full result sets is forbidden.
- Frontend list rendering of large playlists MUST use virtualised rendering
  (`react-window` / `react-window-infinite-loader`).
- Expensive external API calls (OpenAI, Last.fm) MUST be cached via Redis or
  the session-cache layer before being exposed through response endpoints.
- Database queries on searchable fields (title, artist, album) MUST use indexed
  columns; full-table scans on these fields are not permitted.

### IV. Repository Abstraction for External Services
All integration with external services MUST be implemented behind repository
interfaces in `backend/repositories/`. Route handlers MUST NOT make direct
third-party API calls.

- Each repository MUST implement `get_playlist_snapshot()` for import operations.
- Track matching across services MUST go through `lib/normalize.py` and
  `lib/match.py`; ad-hoc string comparison in routes is forbidden.
- Unmatched tracks MUST be represented as `RequestedAlbumEntryDB` or equivalent
  "requested" entry type — they MUST NOT be silently dropped.

### V. Simplicity and Minimal Footprint
Complexity MUST be justified by a concrete, current requirement. Speculative
abstractions, premature generalisation, and over-engineered solutions are
explicitly disallowed.

- New helpers, utilities, or abstractions are only introduced when used in two
  or more independent callsites.
- Error handling and validation are added at system boundaries (user input,
  external API responses) only; internal trust boundaries do not require
  defensive wrapping.
- Database schema changes MUST be expressed as Alembic migrations. Migrations
  MUST be idempotent and MUST work on both SQLite (test) and MariaDB
  (production/development).

## Technology Constraints

The approved stack MUST NOT be changed without a constitution amendment:

- **Backend**: Python 3.x, FastAPI, SQLAlchemy (async), Alembic, Mutagen
- **Database**: MariaDB (production/development); SQLite (tests only)
- **Frontend**: React, Vite, Material-UI; no Redux — component state and hooks
- **Caching**: Redis for expensive API call results
- **File formats**: `.mp3`, `.flac`, `.wav`, `.ogg`, `.m4a` via Mutagen
- **Containerisation**: Docker / docker-compose with `supervisord`

External service credentials (Spotify OAuth, YouTube Music OAuth, Plex token,
Last.fm API key, OpenAI key) MUST be supplied via environment variables or the
`CONFIG_DIR` config file — never hardcoded.

## Development Workflow

- **Setup**: `./scripts/setup.sh` for one-time developer environment init.
- **Dev server**: `./scripts/dev.sh` starts frontend (Vite) and backend (uvicorn).
- **Tests**: `./scripts/test.sh` — backend via `python -m pytest` (async),
  frontend via `npm test` (Vitest). All tests MUST pass before merging.
- **Lint**: `./scripts/lint.sh` — code quality gate; MUST pass before merging.
- **Migrations**: `alembic revision --autogenerate -m "Description"` then
  `alembic upgrade head`. Migration scripts MUST be reviewed for idempotency
  and cross-database compatibility before committing.
- **Background work**: Long-running operations (directory scans, playlist sync)
  MUST use FastAPI `BackgroundTasks` or the job-tracker pattern — they MUST NOT
  block request/response cycles.

## Governance

This constitution supersedes all other project practices. Amendments require:

1. A documented rationale describing what changes and why.
2. A version bump following semantic versioning:
   - **MAJOR**: removal or redefinition of a principle; backward-incompatible
     governance change.
   - **MINOR**: new principle or section added; materially expanded guidance.
   - **PATCH**: clarifications, wording, or typo fixes.
3. Updates to any dependent templates flagged in the Sync Impact Report.
4. A commit message of the form:
   `docs: amend constitution to vX.Y.Z (<summary of change>)`

All planned work MUST be checked against this constitution before implementation
begins (Constitution Check gate in `plan-template.md`). Complexity deviations
from Principle V MUST be explicitly justified in the plan's Complexity Tracking
section.

**Version**: 1.0.0 | **Ratified**: 2026-03-21 | **Last Amended**: 2026-03-21
