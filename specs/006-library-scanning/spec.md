# Feature Specification: Library Scanning

**Feature Branch**: `006-library-scanning`  
**Created**: March 29, 2026  
**Status**: Draft  
**Input**: User description: "Can you help me add specs around the library scanning feature?"

## Overview

The Library Scanning feature enables OpenPlaylist to discover, catalog, and manage music files from configured file system directories. It extracts metadata from audio files, creates database records, handles incremental updates, and provides progress tracking for long-running scan operations.

---

## Clarifications

### Session 2026-03-29

**Metadata Tag Format Handling**
- Q: Which audio tag format versions should be supported (ID3 versions, Vorbis variants, iTunes atoms)?
- A: Leverage mutagen library's auto-detection without specifying explicit versions. Mutagen handles format detection transparently across all common tag formats (ID3v1/v2.x, Vorbis Comments, iTunes atoms) and applies appropriate extraction for each.

**Incremental Scan Change Detection**
- Q: How should file modifications be detected for incremental scans (timestamp vs. file size vs. content hash)?
- A: Use file timestamp comparison only (matches current implementation). This provides optimal performance for incremental scan scenarios while acceptable accuracy for typical use cases.

**Partial Scan Failure Handling**
- Q: How should the system behave when some files fail during metadata extraction?
- A: Skip failed files and immediately commit successful extractions. This maximizes usable results and avoids blocking on individual file failures. Failed files are logged for user review and can be retried in subsequent scans.

**Scan Configuration Storage**
- Q: Where should scan paths and scheduled scan configurations be stored?
- A: Database only, as part of user settings/preferences. This allows users to configure scans through the UI and persists settings across sessions. Environment variables can supplement for deployment-level configuration.

**Progress Reporting Granularity**
- Q: How frequently should progress updates be reported during active scans?
- A: Batch updates every 100 files processed OR every 5 seconds, whichever occurs first. This balances real-time feedback with performance (avoids excessive DB/UI updates).

---

## User Scenarios & Testing

### User Story 1 - Initial Music Library Setup (Priority: P1)

A new user has a collection of 5,000 music files organized in directories and wants to import them into OpenPlaylist to build their searchable music library.

**Why this priority**: This is the foundational use case - without the ability to scan and import existing music collections, users cannot use the application. It unlocks all downstream features (playlist creation, searching, recommendations).

**Independent Test**: User can:
1. Configure a directory path to scan
2. Initiate a full library scan
3. View progress in real-time
4. Access all discovered tracks via search after scan completes

**Acceptance Scenarios**:

1. **Given** a user with audio files in a configured directory, **When** they initiate a full library scan, **Then** all audio files are discovered and database records are created with extracted metadata (title, artist, album, genres, track numbers, etc.)

2. **Given** a scan processes thousands of files, **When** the scan is in progress, **Then** the user can view real-time progress (percentage complete, files processed count, elapsed time)

3. **Given** a completed scan, **When** the user searches for a track by artist/title, **Then** all imported tracks matching the query are found

4. **Given** a scan encounters a file with missing metadata, **When** the scan processes that file, **Then** the file is still indexed with available metadata and required fields are populated with defaults/empty values

---

### User Story 2 - Incremental Library Updates (Priority: P1)

A user adds new music files to their library directory and wants OpenPlaylist to detect and index only the new/modified files without re-scanning the entire existing library.

**Why this priority**: Once a library is established, full re-scans become expensive. Incremental updates enable users to grow their library without waiting for full re-indexing. This maintains user engagement and supports the always-growing nature of music collections.

**Independent Test**: User can:
1. Add new files to a previously scanned directory
2. Run an incremental scan
3. Verify only new files were processed (old files untouched)
4. Verify new files are searchable within seconds

**Acceptance Scenarios**:

1. **Given** a user with an existing indexed library, **When** they add 50 new music files to the configured directory and run a scan, **Then** only the new files cause database operations and existing files are skipped

2. **Given** a file that was previously scanned, **When** that file's timestamp hasn't changed, **Then** the file is not re-processed in an incremental scan

3. **Given** a file whose metadata changed (modified timestamp updated), **When** an incremental scan runs, **Then** the file's database record is updated with new metadata extracted from the file

4. **Given** files that were deleted from the directory, **When** an incremental scan runs, **Then** the "missing" flag is set on those files (files remain in DB but marked as unavailable)

---

### User Story 3 - Background Scan Operations (Priority: P1)

A user initiates a library scan while working in the application interface and needs to see progress without blocking their ability to use other features.

**Why this priority**: Scans of large libraries can take several minutes. Without background processing, the entire UI would freeze, providing a poor user experience. Background processing enables responsive UI and allows concurrent operations.

**Independent Test**: User can:
1. Start a library scan
2. Immediately navigate to other sections of the app (search, playlists, settings)
3. Track scan progress from a progress indicator
4. Receive notification when scan completes

**Acceptance Scenarios**:

1. **Given** a scan is initiated, **When** the user navigates away from the scan progress page, **Then** the scan continues processing in the background without interruption

2. **Given** a background scan in progress, **When** the user accesses other application features, **Then** those features remain responsive and don't block on the scan operation

3. **Given** a running scan, **When** the user can query the progress endpoint, **Then** it returns current progress (percent complete, files processed, estimated time remaining)

4. **Given** a completed scan, **When** the scan finishes, **Then** the user receives a notification of completion with summary statistics (files added, files updated, scan duration)

---

### User Story 4 - Automatic Scheduled Scanning (Priority: P2)

A user wants the library to stay current with new files added to their directories without manual scan triggers. They prefer scanning happens during off-peak hours.

**Why this priority**: After initial setup, users want their library to stay fresh automatically. This reduces friction and enables the "always fresh" utility of the product. Lower priority because manual scanning can work as a workaround initially.

**Independent Test**: User can:
1. Configure a scan schedule (e.g., daily at 2 AM)
2. Add new music files to directories
3. Verify those files are discovered by the automatic scan without manual intervention
4. See scan summary in activity logs

**Acceptance Scenarios**:

1. **Given** a user with a configured scan schedule, **When** the scheduled time arrives, **Then** a library scan automatically initiates using the configured parameters (full vs incremental)

2. **Given** an automatic scan that encounters errors, **When** errors occur, **Then** the scan continues processing remaining files and logs details about failures without halting

3. **Given** a completed automatic scan, **When** the scan finishes, **Then** a record is created in the activity/audit log with scan statistics

4. **Given** a user who wants to disable automatic scans, **When** they update sync settings, **Then** they can toggle automatic scanning on/off or modify the schedule

---

### User Story 5 - Metadata Extraction and Storage (Priority: P2)

A user's music files have ID3 tags (MP3, M4A) or Vorbis comments (FLAC, OGG) with complete metadata (artist, album, genre, track numbers). The scanning feature should extract and preserve all this metadata.

**Why this priority**: Metadata is essential for discovery and organization, but the initial launch can work with basic metadata extraction. Advanced metadata handling (cover art, ratings, comments) can be phased in later.

**Independent Test**: User can:
1. Scan files with complete metadata tags
2. View extracted metadata in the application
3. Confirm data like album, artist, genre, track number are correctly extracted
4. Update user-editable fields independently of file metadata

**Acceptance Scenarios**:

1. **Given** an audio file with complete ID3/Vorbis tags, **When** the file is scanned, **Then** metadata (title, artist, album, genres, track number, disc number, year, comments) is extracted and stored

2. **Given** a file with incomplete metadata, **When** the file is scanned, **Then** available metadata is extracted and stored; missing fields are left empty or default

3. **Given** scanned music files, **When** a user views track details, **Then** both "file metadata" (immutable source) and user-editable fields are visible and distinguishable

4. **Given** metadata extracted from a file, **When** a user modifies an editable field (e.g., title/artist), **Then** the user changes are preserved independently of file metadata

---

### User Story 6 - Multi-Format Audio Support (Priority: P2)

A user's music collection includes files in various audio formats (MP3, FLAC, WAV, Ogg Vorbis, M4A/AAC). The scanning feature should handle all these formats transparently.

**Why this priority**: Music collections are diverse. Supporting common formats from day one prevents user frustration. Can expand to additional formats (AIFF, etc.) later based on usage.

**Independent Test**: User can:
1. Configure a directory with mixed format files
2. Run a scan
3. Verify all format types are discovered and indexed
4. Confirm metadata is correctly extracted for each format

**Acceptance Scenarios**:

1. **Given** a directory with MP3, FLAC, WAV, OGG, and M4A files, **When** a scan runs, **Then** all files are discovered and processed successfully

2. **Given** an M4A file with iTunes metadata tags, **When** the file is scanned, **Then** metadata is correctly extracted using appropriate tag readers for M4A format

3. **Given** a FLAC file with Vorbis comments, **When** the file is scanned, **Then** metadata is correctly extracted using appropriate tag readers for FLAC format

4. **Given** an unsupported audio format file, **When** a scan encounters it, **Then** the file is skipped with a log entry; the scan continues processing other files

---

### Edge Cases

- What happens when a scan encounters a file with read permissions errors? (Log error, skip file, continue scan)
- How does the system handle extremely large audio files (1GB+)? (Process normally; metadata extraction is fast regardless of file size)
- What happens if the same file exists at multiple paths? (Each unique path is indexed separately; duplicate detection by content hash can be future feature)
- How does the system handle Unicode characters in filenames and metadata tags? (All filesystems and tag formats should be normalized to UTF-8)
- What happens if a file is deleted while a scan is in progress? (Scan uses filesystem snapshot; already-processed deletions aren't re-checked)
- How does the system handle symbolic links and directory shortcuts? (Should follow links; can be configurable in advanced settings)
- What happens when disk space is exhausted during a scan? (Graceful error; partially indexed data is committed; error is logged)

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST scan configured directories recursively to discover all audio files
- **FR-002**: System MUST support scanning files in MP3, FLAC, WAV, OGG Vorbis, and M4A/AAC formats
- **FR-003**: System MUST extract metadata (title, artist, album, genres, track number, disc number, year, length, comments) from audio file tags using automatic tag format detection (leveraging mutagen library for format compatibility across ID3, Vorbis Comments, and iTunes atoms)
- **FR-004**: System MUST create database records for discovered audio files with extracted metadata
- **FR-005**: System MUST support both full scans (reprocess all files) and incremental scans (process only new/modified files)
- **FR-006**: System MUST detect file modifications using file timestamp comparison and only reprocess changed files during incremental scans (stat-based timestamp check)
- **FR-007**: System MUST support background scanning without blocking UI or other operations
- **FR-008**: System MUST provide real-time progress tracking during ongoing scans with batch updates (every 100 files processed OR every 5 seconds, whichever occurs first) including percentage complete, files processed count, and elapsed time
- **FR-009**: System MUST organize scanned tracks into albums based on extracted album metadata
- **FR-010**: System MUST maintain separate "file metadata" (immutable source from audio tags) and "user-editable metadata" (overridable by users)
- **FR-011**: System MUST mark files as "missing" when they are deleted from disk but keep records in database for historical tracking
- **FR-012**: System MUST handle metadata extraction errors gracefully by skipping failed files and immediately committing successfully extracted metadata, with errors logged for user review and retry in subsequent scans
- **FR-013**: System MUST support job tracking for scan operations with progress, status, and error logging
- **FR-014**: System MUST support configurable scan locations stored in the database as user settings/preferences, accessible and modifiable through the application UI
- **FR-015**: System MUST normalize Unicode in filenames and metadata to ensure consistent searchability
- **FR-016**: System MUST support scheduled/automatic scans using configurable cron expressions (incremental by default for efficiency)
- **FR-017**: System MUST log scan operations (start time, end time, file count, errors) for audit trail

### Key Entities

- **MusicFile**: Digital audio file with extracted metadata (title, artist, album, genres, track number, etc.). Represents the user-editable view of a track.
  - Attributes: title, artist, album, genres, year, track_number, disc_number, length, rating (user-set), comments
  - Relationships: links to LocalFileDB (source file), links to AlbumDB (album grouping)

- **LocalFile**: File system metadata and immutable extraction cache for a physical audio file
  - Attributes: path, file format (MP3/FLAC/WAV/OGG/M4A), size, first_scanned, last_scanned, missing (boolean), file_timestamp
  - Stores immutable file metadata: file_title, file_artist, file_album, file_genres, file_track_number, file_year, etc.
  - Relationships: links to MusicFile (editable record), stores file-level genres

- **Album**: Logical grouping of tracks by album name
  - Attributes: title, artist (album artist), year
  - Relationships: many-to-many with MusicFile via AlbumTrack junction table

- **ScanJob**: Track background scan operation progress and results
  - Attributes: job_id, status (running/completed/failed), progress (0-100%), files_processed, files_added, files_updated, start_time, end_time, error_details (if failed)

---

## Success Criteria

### Measurable Outcomes

- **SC-001**: Users can complete an initial library scan of 5,000 files in under 120 seconds on a standard machine
- **SC-002**: Incremental scans of unchanged libraries complete in under 5 seconds (scan time < file discovery time)
- **SC-003**: Progress endpoint response time is under 100ms during active scans
- **SC-004**: System correctly discovers and indexes at least 99% of audio files in configured directories
- **SC-005**: Metadata extraction accuracy is at least 95% (comparison with known metadata sources)
- **SC-006**: Background scans do not cause measurable UI responsiveness degradation (page load times within 10% of non-scan baseline)
- **SC-007**: 95% of scan operations complete successfully without requiring user intervention
- **SC-008**: Scheduled scans miss no more than 1% of eligible target times (reliability > 99%)
- **SC-009**: Users report a 90% success rate in finding newly added files within 5 minutes of folder addition and incremental scan execution
- **SC-010**: Scan operation provides visibility to users - progress visible and estimated completion time accurate within ±20%

---

## Assumptions

- Users have permission to read all files in configured directories
- Audio file formats use standard tag formats (ID3v2 for MP3, Vorbis Comments for FLAC/OGG, iTunes atoms for M4A)
- File timestamps accurately reflect modification times (no clock skew issues)
- Database is available and responsive during scan operations
- Filesystem is stable during scan (no concurrent file system changes causing race conditions)
- Users understand that incremental scans may temporarily mark recently deleted files as "missing" rather than immediately removing them

---

## Out of Scope

- Cover art extraction and storage (future enhancement)
- Audio fingerprinting for duplicate detection (future enhancement)
- Cross-format consistency checking (e.g., same song in multiple formats)
- Integration with online music databases for metadata enrichment (future enhancement)
- Real-time filesystem watching / inotify-based automatic updates (future enhancement; scheduled scans adequate for MVP)
