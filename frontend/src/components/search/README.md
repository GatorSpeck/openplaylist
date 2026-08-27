# Search And Discovery

This folder contains the search and discovery flows used to find tracks and add them into playlists.

## Scope

These components cover:

- searching the local library
- integrating Last.fm-backed discovery workflows
- contextual actions on search results
- adding matched or discovered items into playlists

## Main Components

- `SearchResultsGrid.tsx`: primary search results surface
- `SearchResultContextMenu.tsx`: result-level actions
- `LastFMSearch.tsx`: Last.fm-assisted discovery and search flows

## Key Behaviors

- Search UI needs to stay responsive with large result sets.
- Result actions should align with playlist add flows and duplicate handling.
- Discovery logic may depend on backend matching and normalization helpers.

## Editing Guidelines

- Preserve search performance and incremental rendering patterns.
- Keep action labels and result interactions aligned with playlist workflows.
- When changing data contracts, verify search results still map correctly into playlist entry models.
