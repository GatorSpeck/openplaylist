# Backend Data Model Guide

This project uses a few data-model patterns that are easy to break if treated as ordinary CRUD tables.

## Core Separation

- `LocalFileDB` stores immutable metadata scanned from files on disk.
- `MusicFileDB` stores editable metadata that may override file-derived values.
- `sync_from_file_metadata()` is the bridge from file metadata into editable track state.

Do not collapse these layers unless a task explicitly requires a schema redesign.

## Playlist Entry Polymorphism

Playlist entries use inheritance rather than a single flat table shape.

- Base: `PlaylistEntryDB`
- Specialized entries: `MusicFileEntryDB`, `RequestedAlbumEntryDB`, `AlbumEntryDB`

Queries that depend on subtype behavior should use `with_polymorphic()` or an equivalent loading strategy.

## Related Concerns

- Genre data is normalized into related tables.
- Album relationships use linking tables rather than a single direct pointer.
- Search-heavy fields are indexed and should stay performant for large libraries.

## Editing Guidelines

- Treat migrations touching playlist entries or file/track separation as high-risk.
- Keep response models and frontend expectations aligned with any schema changes.
- Be careful with nullable fields that support both legacy and newer sync flows.
