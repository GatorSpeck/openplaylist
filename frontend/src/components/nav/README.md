# Navigation And Settings Screens

This folder contains the navigation shell and the app's settings-oriented screens.

## Scope

These components cover:

- playlist navigation and sidebar actions
- import flows and rename dialogs
- application settings and service configuration
- scheduled tasks and background job settings
- path configuration and operational logs

## Primary Components

- `PlaylistSidebar.tsx`: primary sidebar for playlist browsing and playlist-level menus
- `SettingsModal.tsx`: multi-tab settings screen
- `ScheduledTasksPanel.tsx`: scheduled library scan and playlist sync management
- `PathSelector.tsx`: music library path configuration
- `ImportPlaylistModal.tsx`: importing external or file-based playlists
- `LogsPanel.tsx`: operational logs surfaced in settings
- `RenameDialog.tsx`: playlist renaming flow

## Key User Flows

- Users browse playlists from the sidebar and open playlist-specific actions there.
- Settings is the central place for advanced configuration, including scheduled jobs and detailed auto-sync configuration.
- External service linking and configuration should remain discoverable from `SettingsModal.tsx`.

## Editing Guidelines

- Keep settings discoverable without duplicating advanced configuration in multiple places.
- Sidebar interactions should stay quick and consistent with the main playlist screen.
- Prefer theme-aware controls and surfaces over browser-default styling.
