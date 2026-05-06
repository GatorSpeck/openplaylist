# Backend Repositories And External Integrations

This folder is the backend integration boundary for both local and remote data operations.

## Scope

Repositories in this folder handle:

- playlist persistence and playlist business logic
- remote playlist snapshots and sync workflows
- Spotify, YouTube Music, Plex, Last.fm, and OpenAI integrations
- cached external API access patterns

## Notable Modules

- `playlist_repository.py`: local playlist operations and core playlist behavior
- `spotify_repository.py`: Spotify playlist integration
- `youtube_repository.py`: YouTube Music playlist integration
- `plex_repository.py`: Plex playlist sync behavior
- `last_fm_repository.py`: Last.fm album art and suggestion workflows
- `open_ai_repository.py`: OpenAI-backed suggestion or enrichment flows
- `requests_cache_session.py`: request caching support for expensive or rate-limited APIs

## Editing Guidelines

- Keep each external service behind a repository abstraction.
- Follow existing snapshot and import/export patterns when adding services.
- Respect caching behavior for rate-limited APIs.
- Keep matching and normalization concerns in shared helpers when possible.
