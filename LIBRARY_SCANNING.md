# Library Scanning

This document describes the library scanning feature that discovers music files and updates the local database.

## Main Responsibilities

- walk configured music library paths
- read metadata from supported audio file types
- create or update `LocalFileDB` and related editable track records
- distinguish between newly scanned files, updated files, and missing files

## Important Entry Points

- `backend/main.py`: scanning flow and background-task integration
- `backend/models.py`: file and track data model relationship
- `backend/lib/normalize_path.py`: path normalization support where needed

## Supported File Types

- `.mp3`
- `.flac`
- `.wav`
- `.ogg`
- `.m4a`

## Scan Modes

- Full scan: rescan all discovered files
- Incremental scan: skip files that have not changed since the last scan

## Things To Watch

- Timestamp precision matters when marking files as missing.
- File metadata should flow into editable track fields through existing sync methods.
- Large library scans should remain safe to run in the background.
