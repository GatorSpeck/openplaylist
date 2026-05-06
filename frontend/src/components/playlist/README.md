# Playlist Screen And Editing

This folder contains the primary playlist experience for OpenPlaylist.

## Scope

These components cover:

- viewing a playlist and its entries
- editing track metadata and notes
- drag-and-drop reordering
- duplicate handling and matching workflows
- sync configuration, sync logs, and playlist-level actions
- album art views and anniversary surfaces tied to playlists

## Primary Entry Points

- `PlaylistGrid.tsx`: main playlist screen for a selected playlist
- `PlaylistEntryRow.tsx`: row-level rendering and per-entry actions
- `AlbumArtGrid.tsx`: compact album-art summary used in the playlist header
- `SyncConfig.tsx`: per-playlist remote sync target configuration
- `SyncLogModal.tsx`: result and history surface for sync runs
- `PlaylistAutoSyncDialog.tsx`: detailed auto-sync configuration for a playlist

## Important Supporting Flows

- `EditItemModal.tsx`: manual metadata edits
- `MatchTrackModal.tsx` and `MatchAlbumModal.tsx`: matching and relinking flows
- `DuplicateSelectionModal.tsx`: duplicate filtering before adding tracks
- `SelectPlaylistModal.tsx`: add selected items to another playlist
- `AnniversaryTimeline.tsx`: date-based album anniversary surface

## Key Behaviors

- The playlist screen is performance-sensitive and uses virtualization for large libraries.
- Reordering behavior assumes stable entry ordering and should stay consistent with backend reorder APIs.
- Playlist actions split into three categories: local editing, remote sync, and background job integration.
- Auto-sync eligibility is playlist-level, while scheduled execution is managed from Settings.

## When Editing This Area

- Preserve virtualization and incremental loading behavior.
- Keep drag-and-drop interactions lightweight.
- Verify frontend payloads still match playlist and sync endpoints.
- Maintain dark-mode styling on dialogs, menus, tables, and form controls.
