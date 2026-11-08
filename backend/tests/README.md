# Backend Tests

This folder contains backend unit and integration tests.

## Layout

- `conftest.py`: shared fixtures and pytest setup
- `test_api.py`: API behavior checks
- `test_playlist_repository.py`: playlist repository behavior
- `test_remote_playlist_repository.py`: remote service repository behavior
- `test_playlist_performance.py`: performance-sensitive playlist checks
- `test_lib_normalize.py`, `test_normalize_title.py`, `test_match.py`: normalization/matching logic
- `test_remote_sync.py`: playlist sync route behavior against faked Plex/Spotify/YouTube services
- `test_sync_match_confidence.py`: match-confidence metadata on sync log entries
- `test_sync_track_repairs.py`: retrying fixed tracks, replacing relinked matches, manual resync
- `test_plex_track_artist.py`: Plex search/matching prefers track artist over album artist

## Running

From `backend/`:

```bash
python -m pytest
```

Run a specific file:

```bash
python -m pytest tests/test_playlist_repository.py
```
