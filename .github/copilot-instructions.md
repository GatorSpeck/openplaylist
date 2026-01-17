# OpenPlaylist AI Agent Instructions

## Project Architecture

OpenPlaylist is a **music library management system** with a **FastAPI backend** and **React frontend**. The core pattern is a **repository-based architecture** where external music services (Spotify, YouTube, Last.fm, Plex) are abstracted through repository interfaces for playlist synchronization and metadata enrichment.

### Key Components
- **Backend**: FastAPI + SQLAlchemy with both SQLite and MariaDB support
- **Frontend**: React + Vite with Material-UI components
- **Database**: Dual-model approach - file metadata vs. user-editable track data
- **External Integrations**: Repository pattern for Spotify, YouTube Music, Last.fm, Plex, OpenAI

## Critical Architecture Patterns

### File vs. Track Separation
The system maintains **two distinct data layers**:
- **LocalFileDB**: Immutable file metadata from ID3 tags (`backend/models.py:LocalFileDB`)
- **MusicFileDB**: User-editable track data that can override file metadata
- **Key Method**: `sync_from_file_metadata()` propagates file data to editable fields

### Repository Pattern for External Services
All external integrations follow a consistent interface in `backend/repositories/`:
- `spotify_repository.py` - Playlist import/export  
- `youtube_repository.py` - YouTube Music integration
- `plex_repository.py` - Plex server sync
- `last_fm_repository.py` - Album art and track suggestions
- Pattern: Each repo implements `get_playlist_snapshot()` for import operations

### Request Caching Strategy
- **Redis integration** for expensive API calls (OpenAI, Last.fm)
- **Session-based caching** via `requests_cache_session.py`
- Critical for rate-limited services like Last.fm and OpenAI

## Development Workflow

### Essential Scripts (Use Instead of Manual Commands)
```bash
./scripts/setup.sh    # One-time developer setup
./scripts/dev.sh      # Start both frontend & backend
./scripts/test.sh     # Run all tests  
./scripts/lint.sh     # Code quality checks
```

### Database Migrations
```bash
cd backend && source venv/bin/activate
alembic revision --autogenerate -m "Description"
alembic upgrade head
```

### Testing Strategy
- **Backend**: pytest with async support (`python -m pytest`)
- **Frontend**: Vitest (`npm test`)
- **Integration**: Test against running backend on port 8001

## Project-Specific Conventions

### Music File Scanning
- **Full vs. Incremental**: `scan_directory()` in `main.py` supports both modes
- **File Type Support**: `.mp3, .flac, .wav, .ogg, .m4a` via Mutagen library
- **Background Processing**: Uses FastAPI BackgroundTasks for non-blocking scans

### Playlist Entry Polymorphism
Complex inheritance in `backend/models.py`:
- **Base**: `PlaylistEntryDB` 
- **Types**: `MusicFileEntryDB`, `RequestedAlbumEntryDB`, `AlbumEntryDB`
- **Critical**: Always use `with_polymorphic()` in queries to load correct types

### Frontend State Management
- **No Redux**: Uses React hooks and component state
- **API Layer**: Repository classes in `frontend/src/repositories/`
- **Infinite Scroll**: React-window for large playlist performance

### Configuration Management
- **Environment Variables**: Extensive use for API keys and service configs
- **Config Directory**: `CONFIG_DIR` env var points to persistent config storage
- **Music Paths**: JSON config file for multiple library locations

## External Service Integration Patterns

### Authentication Flows
- **Spotify**: OAuth2 client credentials flow
- **YouTube Music**: Browser-based OAuth with stored JSON credentials
- **Plex**: Token-based authentication
- **Last.fm**: API key + shared secret

### Import/Export Patterns
When adding new service integrations:
1. Implement repository with `get_playlist_snapshot()` method
2. Add route in `main.py` following `/import` pattern  
3. Handle track matching via `lib/normalize.py` and `lib/match.py`
4. Support both exact matches and "requested tracks" for unmatched items

### Metadata Enhancement
- **Album Art**: Primary source is Last.fm via `get_album_art()`
- **Track Suggestions**: Both Last.fm and OpenAI integration
- **Normalization**: `lib/normalize.py` handles title/artist cleanup for matching

## Database Schema Insights

### Performance Considerations
- **Indexes**: Heavy indexing on search fields (title, artist, album)
- **Genre Storage**: Separate `TrackGenreDB` table for multiple genres per track
- **Album Relationships**: Complex many-to-many via `AlbumTrackDB`

### Migration Patterns
- **Polymorphic Changes**: Be careful with PlaylistEntry inheritance changes
- **Data Migrations**: Use both schema and data migration scripts
- **Testing**: Always test migrations against production-size datasets

## Common Integration Points

### Adding New External Services
1. Create repository in `backend/repositories/` implementing standard interface
2. Add configuration validation in `/settings` endpoint
3. Add import route following existing patterns in `main.py`
4. Update frontend status checking in service repositories

### Performance Optimization
- **Large Libraries**: Use pagination in `PlaylistRepository.get_playlist_entries()`
- **Caching**: Implement Redis caching for expensive operations
- **Database**: Consider MariaDB over SQLite for production scale

### Frontend Component Patterns
- **Infinite Scroll**: Use `react-window-infinite-loader` for large lists
- **Drag & Drop**: `react-beautiful-dnd` for playlist reordering
- **Material-UI**: Consistent component library usage throughout

## Performance Profiling

### Backend Profiling
- **Profiling Module**: `backend/profiling.py` provides decorators for function profiling
- **Usage**: Add `@profile_function("profile_name")` decorator to any function
- **Reports**: Stored in `profiles/` directory as both `.prof` and `.txt` files
- **API Access**: View reports via `/api/playlists/profiling/` endpoints

### Key Profiled Functions
- **sync_playlist**: Complex playlist synchronization with external services
- **Access Reports**: GET `/api/playlists/profiling/latest` for most recent sync profile