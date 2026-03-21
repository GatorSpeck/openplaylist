# Feature Specification: Remote Playlist Sync

**Feature Branch**: `001-remote-playlist-sync`
**Created**: 2026-03-21
**Status**: Draft
**Input**: User description: "Can you help me specify my existing remote playlist sync logic?"

## Clarifications

### Session 2026-03-21

- Q: When sync runs, how should the system obtain the remote state used for diffing — trust the stored snapshot or fetch the live remote playlist? → A: Always fetch the live remote playlist before computing the diff; the stored snapshot is a write-cache only, not the diff baseline.
- Q: When correlating tracks, should service-specific identifiers or text matching take precedence? → A: Service-specific identifier match takes priority; normalised text matching is fallback when no identifier is available.
- Q: For large playlists and multiple targets, should sync run in-request or as a background job? → A: Run sync asynchronously as a background job and return a sync_run_id immediately.
- Q: Should sync targets be bound to a specific external account identity? → A: No for now. Sync uses currently configured credentials and does not enforce account fingerprint binding.
- Q: What scale target should be used for this feature version, and is it a hard cap? → A: Target playlist scale is up to 50,000 tracks, and this is not a hard cap; performance may degrade beyond this point.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Push Local Changes to a Remote Service (Priority: P1)

A user has organised a playlist in OpenPlaylist and wants those tracks to appear
in their Spotify, YouTube Music, or Plex library. They trigger a sync and the
remote playlist reflects the current local state — new tracks are added and
removed tracks are removed, without touching tracks the user added directly on
the remote service (if bidirectional sync is enabled).

**Why this priority**: This is the primary reason the feature exists. Most users
will have OpenPlaylist as their master library; keeping remotes in sync is the
core value proposition.

**Independent Test**: Configure a sync target for an existing playlist, add a
track, trigger sync, and confirm the track appears in the remote playlist.

**Acceptance Scenarios**:

1. **Given** a playlist with a configured enabled sync target, **When** the user triggers sync, **Then** tracks present locally but absent on the remote are added to the remote playlist.
2. **Given** a playlist with one track removed since the last sync, **When** the user triggers sync, **Then** that track is removed from the remote playlist.
3. **Given** a sync target configured with "send additions" disabled, **When** the user triggers sync, **Then** no new tracks are pushed — only removals (if enabled) are processed.
4. **Given** a sync target configured with `force_push`, **When** sync is triggered, **Then** all local tracks are pushed regardless of the last-known snapshot.
5. **Given** no changes since the last sync, **When** sync is triggered, **Then** no remote mutations are made and the result reports zero changes.

---

### User Story 2 - Pull Remote Changes into Local Playlist (Priority: P2)

A user has added tracks to a Spotify playlist from their phone and wants those
additions reflected in OpenPlaylist. They trigger sync and the new remote tracks
appear in their local playlist as matched local tracks, or as "requested" entries
when no local match exists.

**Why this priority**: Bidirectional sync lets OpenPlaylist act as a central hub
rather than a one-way push target, increasing long-term utility.

**Independent Test**: Add a track directly on Spotify, trigger sync from
OpenPlaylist, and confirm the track appears in the local playlist (matched or
as a requested entry).

**Acceptance Scenarios**:

1. **Given** a track added on the remote service since the last sync, **When** sync is triggered with "receive additions" enabled, **Then** the track appears in the local playlist.
2. **Given** a track deleted from the remote service since the last sync, **When** sync is triggered with "receive removals" enabled, **Then** the track is removed from the local playlist.
3. **Given** a remote track with no matching local file, **When** it is pulled in, **Then** it appears as a "requested" entry retaining artist/title/album metadata — it is not silently dropped.
4. **Given** a sync target with "receive additions" disabled, **When** sync is triggered, **Then** no remote additions are pulled into the local playlist.

---

### User Story 3 - Configure Sync Targets per Playlist (Priority: P2)

A user wants to sync a single playlist to both Spotify and Plex simultaneously,
with different directional settings for each. They configure two sync targets
on the playlist and both are processed in a single sync run.

**Why this priority**: Per-playlist, per-service configuration is what makes the
sync system flexible and non-destructive for users with diverse setups.

**Independent Test**: Create two sync targets (e.g., Plex + Spotify) for the
same playlist, trigger sync, and verify both remote playlists are updated
independently.

**Acceptance Scenarios**:

1. **Given** a playlist with no sync targets, **When** the user creates a sync target specifying service, remote playlist identifier, and directional settings, **Then** the target is saved and processed during future syncs.
2. **Given** a playlist with multiple sync targets, **When** sync is triggered, **Then** all enabled targets are processed and results are reported per-target.
3. **Given** a sync target that is disabled, **When** sync is triggered, **Then** the disabled target is skipped and no remote mutations occur for that service.
4. **Given** a sync target update (e.g., change remote playlist name), **When** the next sync runs, **Then** the updated configuration is used.

---

### User Story 4 - Import a Remote Playlist as a New Local Playlist (Priority: P3)

A user has an existing Spotify, YouTube Music, or Plex playlist they want to
bring into OpenPlaylist as a new local playlist. They provide the remote
playlist identifier, choose a local name, and all tracks are imported — matched
against local files where possible, added as requested entries otherwise.

**Why this priority**: Import is a one-time bootstrap action. Essential for
onboarding but less critical to ongoing operation than ongoing sync.

**Independent Test**: Provide a Spotify playlist ID, import it, and confirm the
resulting local playlist contains all tracks from the remote (matched and
unmatched).

**Acceptance Scenarios**:

1. **Given** a valid remote playlist identifier, **When** the user imports it with a chosen local name, **Then** a new playlist is created containing all remote tracks.
2. **Given** a remote track that matches a local file, **When** importing, **Then** the entry links to the local file.
3. **Given** a remote track with no local file match, **When** importing, **Then** it is added as a "requested" entry retaining artist/title/album metadata.
4. **Given** an invalid or inaccessible remote playlist ID, **When** the user attempts import, **Then** a clear error is returned and no partial playlist is created.

---

### User Story 5 - Review Sync History for a Playlist (Priority: P3)

A user wants to understand what changed during the last sync run — which tracks
were added or removed, which succeeded, which failed, and why.

**Why this priority**: Observability into sync operations builds user trust and
helps diagnose matching or connectivity problems.

**Independent Test**: Trigger a sync, then retrieve the sync log and confirm it
contains one entry per attempted change with action, outcome, and error reason.

**Acceptance Scenarios**:

1. **Given** a completed sync run, **When** the user views the sync log, **Then** each change is listed with: the track, the target service, the action (add/remove), and success or failure status.
2. **Given** a partially failed sync (e.g., one track unmatched on remote), **When** the user views the log, **Then** the failure reason is visible for that entry.
3. **Given** a sync run with no changes, **When** the user views the log, **Then** zero mutations are recorded and the status reflects up-to-date state.

---

### Edge Cases

- A remote playlist does not yet exist on the target service — it must be created automatically when the first batch of tracks is sent.
- Duplicate playlist names on Plex — the system must detect and use the existing playlist rather than creating another duplicate.
- A remote service is temporarily unavailable during sync — the run must fail gracefully for that target, report the error, and not corrupt the local playlist or stored snapshot.
- A track has no matchable identifier for a given service (no Spotify URI, no Plex rating key) — it must be skipped with an explicit log entry rather than aborting the entire sync.
- The remote service returns rate-limit or transient errors — changes must be submitted in batches and handled without data loss.
- A very large playlist (over 50,000 tracks) — sync should still run without data corruption, but degraded performance is acceptable beyond the 50,000-track target.
- All tracks are removed from the local playlist — the sync must send removals for all previously-synced tracks and treat this as a valid operation, not an error.
- Service credentials may be re-linked between runs — sync uses the currently configured account in this version.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to configure one or more sync targets per playlist, each specifying the remote service (Spotify, YouTube Music, or Plex), the remote playlist identifier, and independent directional flags for additions and removals in each direction.
- **FR-002**: Each sync target MUST have an enabled/disabled state that can be toggled without deleting the configuration.
- **FR-003**: When sync is triggered, the system MUST fetch the current live state of the remote playlist, compute a diff between the local playlist and that live remote state, and apply only the delta. The stored snapshot MUST NOT be used as the diff baseline.
- **FR-004**: When `force_push` is requested, the system MUST push the full current playlist contents to the remote regardless of the stored snapshot.
- **FR-005**: Track matching MUST prioritize exact service-specific identifiers (Spotify URI, YouTube URL, Plex rating key) when present. If no service identifier is available, matching MUST fall back to normalised artist, title, and album fields.
- **FR-006**: Remote tracks that cannot be matched to a local file MUST be added to the local playlist as "requested" entries retaining all available metadata; they MUST NOT be silently dropped.
- **FR-007**: After a successful sync, the system MUST persist an updated snapshot of the playlist state for each target as a write-cache (used for audit/history purposes), not as the authoritative diff baseline for future syncs.
- **FR-008**: Remote mutations MUST be submitted in batches; the default batch size is 100 tracks per batch.
- **FR-009**: Every sync run MUST produce a structured log recording: each attempted change, the affected track, the target service, the action (add/remove), and success or failure with an error reason where applicable.
- **FR-010**: Triggering sync MUST start an asynchronous background job and immediately return a sync_run_id that can be used to poll status and retrieve logs/results.
- **FR-011**: The system MUST expose sync-run status states that include at least queued, running, completed, partial, and failed.
- **FR-012**: Failure of one sync target MUST NOT prevent other targets from being processed in the same sync run.
- **FR-013**: The import operation MUST create a new local playlist containing all tracks from the specified remote playlist (matched and unmatched), and MUST abort cleanly without creating a partial playlist if the remote cannot be accessed.
- **FR-014**: The system MUST detect and handle duplicate remote playlist names (specifically on Plex) by selecting the existing playlist rather than creating a new one.
- **FR-015**: Sync targets MUST use the currently configured credentials for their service at run time and MUST NOT enforce account fingerprint binding in this feature version.
- **FR-016**: The system MUST target robust sync behavior for playlists up to 50,000 tracks, and MUST continue to attempt sync beyond that size without treating size alone as a hard failure condition.

### Key Entities

- **SyncTarget**: Associates a playlist with a remote service; holds the remote playlist identifier, directional flags (send/receive adds/removals), and enabled state. A playlist can have many sync targets.
- **PlaylistSnapshot**: Records the last-known contents of a playlist — a point-in-time list of track identifiers (artist/title/album + service-specific keys) used for write-cache, audit, and history (not as the authoritative diff baseline).
- **SyncRun**: Represents a single execution of the sync operation for a playlist; holds start time, completion status, and is the parent of all sync events for that run.
- **SyncEvent**: An individual log entry within a sync run recording the action taken (add/remove), the track involved, the target service, and the outcome (success/failure with reason).
- **PlaylistItem**: A normalised, service-agnostic representation of a track used within the sync system, carrying artist, title, album, and whichever service-specific identifiers are available.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can trigger a sync for a playlist with one or more sync targets and receive a sync_run_id response in under 2 seconds for playlists of up to 50,000 tracks.
- **SC-002**: After a successful sync run, re-triggering sync with no intervening changes produces zero mutations on any remote service.
- **SC-003**: All tracks successfully processed in a sync run are present in (or absent from) the corresponding remote playlist with no silent data loss.
- **SC-004**: When a remote service is unavailable, the sync result clearly identifies the failed target and reason; all other configured targets complete normally.
- **SC-005**: Unmatched remote tracks pulled into a local playlist are retained as requested entries — no remote track is silently omitted from an import or inbound sync.
- **SC-006**: The full sync log for a completed run is retrievable and contains one entry per attempted change, each with action, outcome, and error reason where applicable.
- **SC-007**: A playlist import completes with the resulting local playlist containing the same number of entries as the remote playlist (matched + unmatched combined).
- **SC-008**: For playlists larger than 50,000 tracks, sync still starts and can complete without data corruption, while longer runtimes are acceptable.

## Assumptions

- Authentication with each remote service is pre-established before sync is triggered; this feature does not manage OAuth flows or credential entry.
- Track deduplication within a single playlist is handled upstream; sync operates on the playlist as presented.
- The remote service APIs are available and responsive; the system handles transient errors gracefully but does not implement offline queueing.
- Live remote state is fetched at the start of each sync run; the stored snapshot serves as a write-cache for audit and history, not as the diff baseline.
- `force_push` is an advanced recovery option; normal usage relies on delta sync from live remote state.
- 50,000 tracks is a target performance envelope, not a hard operational cap.

## Out of Scope

- Scheduled or automated periodic sync (separate scheduled-tasks feature).
- Conflict-resolution UI for simultaneous edits on both sides; the system applies a defined precedence (outbound: local wins; inbound: remote wins) without user prompting.
- Adding new remote service integrations beyond Spotify, YouTube Music, and Plex.
- Syncing playlist metadata (name, description, cover art) — only track membership is synchronised.
