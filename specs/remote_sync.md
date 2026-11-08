# Remote Sync

This spec documents the remote sync feature **as currently implemented**, to lock in the feature set before behavior changes. Section 10 lists known bugs/inconsistencies found while documenting — treat those as candidates for the fix pass, not as intended behavior.

## 1. Scope

- a playlist can have multiple sync targets, one per remote service (`plex`, `spotify`, `youtube`)
- each target independently controls direction of sync via four flags: `sendEntryAdds`, `sendEntryRemovals`, `receiveEntryAdds`, `receiveEntryRemovals`
- only `music_file` playlist entries participate in sync (album/requested-album/nested-playlist entries are excluded); entries missing `artist` or `title` are also excluded
- sync can run on-demand (button in UI) or via scheduled task
- every sync run produces a persisted run record + per-change event log, viewable per playlist

## 2. Sync targets (per-playlist config)

- CRUD via `/api/playlists/{id}/syncconfig` (`GET`/`POST`/`PUT /{targetId}`/`DELETE /{id}`)
- each target: `service`, `config` (untyped JSON blob), `enabled`, plus the four direction flags
- `config` contents differ per service:
    - Plex: `playlist_id` (rating key) or `playlist_name`, optionally `endpoint`/`token`/`library` overrides
    - Spotify: `playlist_id` or legacy `playlist_uri`, optionally client credential overrides
    - YouTube: `playlist_id`/`playlist_uri`, or `playlist_name`
- creating/updating a YouTube target auto-fills `config.playlist_name` from the local playlist name if not provided; no equivalent auto-fill exists for Spotify or Plex
- no client-side or server-side validation of `config` contents beyond `service` being one of the three known values
- a target with an unresolvable playlist reference (e.g. blank Spotify URI) results in a *new* remote playlist being created on next sync rather than an error

## 3. Matching local tracks to remote items

- match scoring (`get_match_score`) is additive over title (0–50) and artist (0–30), max 80:
    - title: exact case-insensitive = 50, normalized match = 40, startswith = 30, substring = 20, else 0
    - artist: exact = 30, normalized match = 20, startswith = 15, substring = 10, else 0
- normalization strips remaster/remix year patterns, bracketed qualifiers, and stopwords (`edition`, `deluxe`, `remix`, `mono`, `stereo`, etc. for titles; `the`, `and`, `band`, `orchestra`, etc. for artists); if normalization empties the string, the original untouched string is used
- there is no single global "is this a match" threshold — each service picks its own acceptance behavior:
    - **Spotify**: searches, scores top 10 results, always accepts the highest-scoring candidate regardless of score
    - **YouTube**: searches, scores top 10, accepts the top result even if its score is 0
    - **Plex**: two-pass — filtered search (artist+album) accepts immediately at score ≥ 80, or accepts at score ≥ 30; falls back to a broader title-only search (up to 50 results) and accepts the top result with no floor
- **Plex artist**: Plex stores the album artist in `grandparentTitle` and the track artist in `originalTitle` (only set when it differs). Matching, snapshots, and the track-details Plex search use the track artist, falling back to the album artist; scoring takes the better of the two. Plex's `artist.title` search filter only matches album artist, so the manual search also runs a title-only search and ranks by score
- **match confidence**: every track a service resolves while pushing (adds and initial playlist creation) gets a `get_match_confidence` result comparing requested vs resolved title/artist/album (title 55%, artist 35%, album 10%; album ignored when blank on either side). Levels: `high` ≥ 85, `medium` ≥ 65, else `low`; a title or artist below 60 forces `low` (catches covers by other artists). `low` and unresolved tracks set `needs_review`. Remote → local adds get the same comparison against the linked local track
- on a successful match, Spotify/YouTube/Plex repositories write the resolved remote id (`spotify_uri`/`youtube_url`/`plex_rating_key`) back onto the local `MusicFileDB` row as a side effect of matching, not just of syncing
- Plex additionally supports bulk lookup by known rating key (chunks of 100), falling back to per-item fuzzy search only for chunks that fail
- unmatched items (no resolvable remote id) are skipped when pushing to a remote service — no placeholder is created on the remote side for any service; they are logged as `failed_match` events (not successful adds)
- unmatched items arriving *from* a remote (i.e. remote has a track with no local match) become a bare local track entry with no `music_file_id` ("requested" style placeholder), carrying just title/artist/album

## 4. Sync plan / diff engine

- each sync compares three snapshots: last-known-remote (stored), current-remote (live fetch), current-local (live)
- an item's identity for snapshot membership (`match_keys`) is checked in priority order: `spotify:<uri>`, `youtube:<url>`, `plex:<rating_key>`, `music_file:<id>`, `path:<local_path>`, then a normalized `title_artist` fallback — a match on any one key counts as "present"
- **initial sync** (no stored remote snapshot yet): if a remote playlist already exists, adds are computed both directions per the direction flags but no removals are ever emitted; if no remote playlist exists, every local item is pushed as an add
- **subsequent syncs**: local/remote sides are each considered "changed since last sync" by comparing `updated_at` timestamps against the stored snapshot's timestamp; changes are only computed for the side(s) that changed
    - Plex reports a real remote-side `updatedAt`
    - Spotify and YouTube do not provide one — their remote side is stamped with the fetch-time timestamp, which is by construction always newer than the stored snapshot, so remote-side changes are effectively always considered "new" for these two services
- if both local and remote changed since the last sync, both sets of changes are applied — no conflict-resolution beyond normal dedup
- **force push**: requires both `sendEntryAdds` and `sendEntryRemovals` enabled on the target; clears the remote playlist first, then pushes every local item as an add
- **removal guardrail** (local side only): if the local playlist has at least 10 entries and a remote-driven sync would remove more than 25 items or more than 30% of the playlist, all remote-driven removals are dropped from the plan for that run (adds still apply); this is configurable per-target via `config` keys (`allow_bulk_receive_removals`, `max_receive_removal_percent`, `max_receive_removal_count`, `min_local_size_for_removal_guard`). There is no equivalent guardrail protecting the remote side from a bulk local deletion.
- when multiple targets are synced together, their individual plans are merged into one plan, deduped by track identity, before being applied

### Per-track push state and repairs
- after every push (adds, initial creation, repairs) each track's outcome is stored per target in `sync_track_states`: `matched` (with the resolved remote id) or `unmatched`, plus a hash of its artist/title/album (`repositories/sync_track_state_repository.py`)
- on every non-force-push sync, before flushing, `plan_track_repairs` checks each stored state against the current local and remote snapshots. Repairs only affect the target the state belongs to; they don't fan out to every target like ordinary local adds:
    - **unmatched** track whose details changed, or that now has a remote link for this service → retried as an add. Unchanged unmatched tracks are not retried, so there are no repeated failing searches
    - **matched** track that was relinked locally to a different remote id (ids compared after normalizing Spotify URI/URL and YouTube URL/id forms), or that has no link and whose details changed → old remote match removed, track re-added. If the new id is already on the remote, only the old one is removed. Needs `sendEntryRemovals`; otherwise a `skip` event is logged and nothing changes, to avoid duplicates
    - a matched track whose old match is no longer on the remote (removed there) is left alone, so remote removals are respected even with `receiveEntryRemovals` off
    - states whose track left the local playlist (or an unmatched track now on the remote) are deleted
- **manual resync**: `POST /api/playlists/{id}/sync/resync-track` `{music_file_id}` marks the track `resync` on every enabled target with `sendEntryAdds`, then starts the normal sync job (returns `job_id`). That sync removes the track's current remote match (by stored id, else by snapshot match keys; requires `sendEntryRemovals` when one exists) and re-adds it. Going through the full sync keeps the stored snapshots consistent, so the remove/re-add isn't later read as a remote-side change
- force push skips repairs (it re-pushes everything) but still records fresh state

## 5. Sync execution (on-demand, per run)

1. load enabled sync targets for the playlist; 404 if none exist/enabled
2. create a running sync-run record immediately (visible mid-sync)
3. build the local snapshot
4. per target (isolated failure — one target failing doesn't stop others): check auth, fetch stored + live remote snapshots, create the remote playlist if it doesn't exist yet, persist any newly-resolved playlist id back into the target config
5. if every target failed to initialize, the whole sync fails
6. build per-target sync plans (or force-push plans), filter by receive flags, apply removal guardrails, merge into one plan
7. remote-originated changes are applied to the local playlist immediately (adds/removes); local-originated changes are queued per target
8. per-target track repairs run (see "Per-track push state and repairs"), then queued remote-bound changes are flushed in batches of 100 per target
9. after flushing, each target's live remote snapshot is re-fetched and stored as the new baseline; a local snapshot is stored as well
10. overall status: `success` if no target failed, `partial` if some did, `failed` for total pipeline failure (no targets configured/authenticated, or unhandled error)
11. response includes per-target results plus a change log

## 6. Per-service behavior

### Plex
- auth via server endpoint + token (env-var fallback), fails fast (constructor raises) if misconfigured
- playlist resolution: rating key first, then normalized-name match across all server playlists (first match wins on collision), then direct name query
- **cannot create an empty playlist** — if zero items resolve, playlist creation is skipped entirely
- removal has no separate score floor at the call site; relies on the resolution logic in section 3

### Spotify
- OAuth2 (client id/secret/redirect uri via env or config), token cached to disk, optionally per-username
- accepts `playlist_id` or legacy `playlist_uri`, or resolves by exact name match against the user's playlists
- can create playlists with zero items
- removal only works via exact `spotify_uri`; items without one fall back to an in-memory snapshot cache from earlier in the same request, otherwise removal silently no-ops

### YouTube Music
- auth via OAuth JSON file path (env var), no client-id/secret flow currently wired up
- accepts `playlist_id`/`playlist_uri`, or `playlist_name` (resolved to id by exact title match)
- mutating operations are gated by a permission check requiring the playlist be private and owned by the authenticated user
- handles a known pagination quirk by retrying with a larger limit if the first fetch returns zero tracks
- removal only removes the first matching track found, even if duplicates exist

## 7. Scheduled sync / auto-sync

- two separate mechanisms exist:
    - **`ScheduledTaskDB`** — generic cron-scheduled tasks (`library_scan` or `playlist_sync` type), CRUD'd via `/api/scheduled-tasks/`, executed by an in-process APScheduler instance that reloads all tasks from the DB on process start
    - **per-playlist `auto_sync_enabled`/`auto_sync_schedule`** — a flag + cron string on the playlist itself, edited via `/api/playlists/{id}/auto-sync`
- a `playlist_sync` scheduled task's `config.playlist_ids`, if non-empty, limits the run to those playlists; if empty/omitted, the task instead syncs every playlist with `auto_sync_enabled = true`
- the per-playlist `auto_sync_schedule` field is not read by the scheduler — timing is controlled entirely by the owning `ScheduledTaskDB.cron_expression`; enabling auto-sync on a playlist with no matching scheduled task means it simply never runs
- scheduled syncs always run as a normal sync (never force-push)
- a manual "run now" triggers an immediate one-off run of a scheduled task without altering its stored schedule
- task-level stats track total/successful/failed run counts and last run status/error, updated after each scheduled execution
- per-invocation detail is tracked independently of the scheduler, in the sync-run/event log described in section 8, for both scheduled and on-demand runs

## 8. Sync history / logging

- every `/sync` invocation (manual or scheduled) creates one run record: `started_at`, `completed_at`, `status` (`running`/`success`/`partial`/`failed`), `force_push`, summary, error
- each individual change within a run is logged as an event: kind (`change`/`system`/`failed_match`/`error`), action (`add`/`remove`/`create`/`force_push`/`failed_match`), track, target service, target name, reason, success flag, error
- add and failed-match events carry `metadata.match` (the match-confidence payload from section 3) when the track was resolved during that run
- run/event history is queryable per playlist (`GET /api/playlists/{id}/sync-log`), paginated, filterable by run id and by success/failure

## 9. Frontend

### Sync config modal (`SyncConfig.tsx`)
- lists existing targets, allows add/edit/delete/enable-toggle per target
- per-target form: service selector, one config text field (name/URI depending on service), enabled checkbox, four direction checkboxes
- "Sync" and "Force Push" buttons act across all enabled targets at once, not a single service; force push requires an extra confirmation dialog
- both buttons are disabled when there are no enabled targets
- also exposes a bare auto-sync enable/disable checkbox for the playlist (schedule value itself is not editable here)
- sync runs as a background job; the UI polls job status every 2 seconds for up to 5 minutes

### Sync log modal (`SyncLogModal.tsx`)
- event history with All / Errors Only / Needs Review filters; Needs Review shows events with `metadata.match.needs_review` or `failed_match`
- each matched event shows a confidence badge; medium/low matches also show a requested-vs-synced comparison table
- flagged remote events (which carry `metadata.music_file_id`) have a "Resync track" button that calls the manual resync and reloads the log when the job finishes; the track details modal has the same action ("Resync to sync targets")
- the post-sync summary includes a Needs Review count for that run

### Scheduled tasks panel (`ScheduledTasksPanel.tsx`)
- generic CRUD list for all scheduled tasks (`library_scan` and `playlist_sync`)
- cron entry via preset buttons or free-text, validated live against the backend as it's typed
- for `playlist_sync` tasks: checklist of playlists to include, or "all playlists with auto-sync enabled" when none are explicitly selected
- "Run Now" per task, disabled while its own request is in flight
- table shows schedule, status, last/next run, and run counts with failure count highlighted

### Playlist auto-sync dialog (`PlaylistAutoSyncDialog.tsx`)
- separate surface for the same `auto_sync_enabled`/`auto_sync_schedule` fields
- shows whether any scheduled task actually covers this playlist, and warns explicitly if auto-sync is enabled but no scheduled task will ever run it
- lets the user create a matching scheduled task directly from this warning

## 10. Known issues / inconsistencies (found while documenting, not yet fixed)

- per-playlist `auto_sync_schedule` has no effect on scheduling — only a `ScheduledTaskDB`'s own cron expression does. Enabling auto-sync via `SyncConfig.tsx`'s checkbox alone will silently never run.
- `SyncConfig.tsx` and `PlaylistAutoSyncDialog.tsx` edit the same auto-sync fields with inconsistent UX; only the dialog warns about the gap above or lets you fix it
- stored remote snapshots are keyed by playlist name only (truncated to 50 chars), not by service/target — two targets that resolve to the same remote name can overwrite each other's stored snapshot
- Spotify/YouTube remote-side "changed since last sync" is effectively always true, since neither provides a real remote-updated timestamp
- plan-merge dedup uses raw (non-normalized) track string, while snapshot membership checks use normalized artist/title — the two can disagree on what counts as "the same track" within a single run
- a batch failure when pushing to a remote service marks the whole 100-item batch as failed in the log, even when only one item actually failed
- scheduled task run stats can report "success" even when the underlying playlist sync actually failed, because failures inside the sync job are caught and recorded on the job tracker rather than propagated back to the scheduler's own accounting
- scheduled syncs are hardcoded to never force-push; there's no way to schedule a recurring force-push
- no auto-fill of Spotify `playlist_id`/`playlist_uri` on target creation (unlike YouTube's `playlist_name` auto-fill) — a blank Spotify target field means a new Spotify playlist gets created on every sync run
- `SpotifyRepository.get_current_user()` has an inverted auth check (`if self.sp: raise 401`) — 401s exactly when authenticated
- the "Syncing..." button state in `SyncConfig.tsx` reflects only the initial POST completing, not the background job finishing — it's not a reliable "is sync still running" indicator
