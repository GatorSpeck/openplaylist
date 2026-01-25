# OpenPlaylist

[![CI](https://github.com/GatorSpeck/openplaylist/actions/workflows/ci.yml/badge.svg)](https://github.com/GatorSpeck/openplaylist/actions/workflows/ci.yml)
[![Backend Tests](https://github.com/GatorSpeck/openplaylist/actions/workflows/backend-tests.yml/badge.svg)](https://github.com/GatorSpeck/openplaylist/actions/workflows/backend-tests.yml)

## Overview
OpenPlaylist is a music playlist management portal that indexes your local music files and allows you to organize them into playlists.

Playlists can be synced with Plex, Spotify, and Youtube - or exported in various formats.

In addition to local music, your playlists can be augmented with search results from Last.FM, as well as suggestions from Last.FM and OpenAI.

**DISCLAIMER: This is a hobby project! Much of it was developed with assistance from Copilot, including sections that were primarily vibecoded. Please expect instability on the develop branch, and take regular backups regardless of which release you use!**

## Additional Features
- **Advanced Playlist Management**
  - "Matching" tracks from external providers (e.g. Spotify, Youtube, Plex) with local files
  - Drag-and-drop reordering within playlists
  - Bulk selection and operations (add, remove, edit multiple tracks)
  - Playlist pinning and custom ordering for quick access
  - Smart pagination with server-side sorting and filtering for large playlists (tens of thousands of entries)

- **Rich Track Metadata & Linking**
  - Comprehensive track metadata (ID3 tags, file info, playlist associations)
  - External service integration (Spotify, YouTube, Last.fm, MusicBrainz, Plex)
  - Link tracks to multiple external sources

- **Search & Discovery**
  - Advanced search
  - Find similar tracks using Last.FM or OpenAI integrations
  - Album art fetch and display via Last.FM

- **Import & Export**
  - Export to .m3u and JSON formats
  - Import from .m3u, JSON, Youtube, and Spotify playlists
  - Flexible sync to/from external services:
    - Plex
    - Spotify
    - Youtube

## Screenshots
### Basic Interface
![image](https://github.com/user-attachments/assets/261a57b1-773e-480a-8842-250b77c9d25b)

### Add Songs
![image](https://github.com/user-attachments/assets/361570f9-766b-4fdc-94cf-b1bdfd484723)

### Find Similar Songs Using OpenAI
![image](https://github.com/user-attachments/assets/3fc0cc80-1f2f-4b70-ac2b-500649dffcf9)

## Future Features
- Smart playlists
- More export options, including a "share page" for a playlist
- Auth/Support for multiple users
- More integrations
  - Suggestions/metadata APIs
  - Streaming services

## Running with docker-compose
- Create .env file:
```
# Required settings
OPENPLAYLIST_TAG=latest  # https://github.com/GatorSpeck/openplaylist/pkgs/container/openplaylist
CONFIG_PATH=./config  # needs read/write access, the dir to store the config
PORT=5173  # the port used to access the web app
DATA_DIR=./data  # dir to store the SQLite DB (needs read/write access)
TZ="America/Chicago"  # not strictly required, but highly recommended
ALLOW_ORIGINS=localhost  # for CORS

## MariaDB configuration (recommended, defaults to sqlite otherwise)
# MARIADB_ROOT_PASSWORD=replaceme
# MARIADB_USER=replaceme
# MARIADB_PASSWORD=replaceme
# DB_TYPE=mysql
# DB_HOST=openplaylist_db
# DB_PORT=3306
# DB_NAME=openplaylist

## Other optional settings

## Plex configuration for playlist syncing
# PLEX_ENDPOINT=https://your.plex.server
# PLEX_TOKEN=foo
# PLEX_LIBRARY=Music  # change this if it doesn't match your library name

## Library file mapping (needed if there is a discrepancy between where Plex/OpenPlaylist are mounting your library)
# PLEX_MAP_SOURCE=/open/playlist/path/to/my/music
# PLEX_MAP_TARGET=/plex/path/to/my/music

## Playlist file mapping (source and target must be read/writable)
# PLEX_M3U_DROP_SOURCE=/path/to/playlists  # temporary location to playlist exports for import into Plex
# PLEX_M3U_DROP_TARGET=/playlist/  # this is where we will tell the Plex API to look for updated playlists

## Last.fm configuration (for album art, track/album search, and suggestions)
# LASTFM_API_KEY=foo
# LASTFM_SHARED_SECRET=foo

## OpenAI configuration (for suggestions)
# OPENAI_API_KEY=foo

## Redis configuration (for caching of OpenAI and Last.FM queries)
# REDIS_HOST=localhost
# REDIS_PORT=6379

## Spotify configuration (for playlist import)
# SPOTIFY_CLIENT_ID=foo  # https://developer.spotify.com/documentation/web-api/tutorials/getting-started
# SPOTIFY_CLIENT_SECRET=foo

## Youtube Music configuration
## Must use browser-based auth! https://ytmusicapi.readthedocs.io/en/stable/setup/browser.html
# YTMUSIC_OAUTH_PATH="path to browser.json"
```

- Run with `docker-compose up -d`

## SQLite support
If you prefer to run using SQLite, simply omit the MariaDB section of your .env file, as well as the `openplaylist_db` section of your compose.yml.

Note that this not recommended for large libraries and playlists. There is a (flaky) migration tool included in `backend/scripts` that can help migrate an existing SQLite DB to a new MariaDB instance.

## Applying Migrations
If there is a breaking DB change, migrations can be run automatically from the Databases tab of the Settings page.

If the missing migration is preventing app startup (this really shouldn't happen, but still), you can apply migrations manually:
```
docker exec -it openplaylist bash -c "cd backend && alembic upgrade head"
```

## Development

### Quick Start for New Developers

```bash
# One-time setup
./scripts/setup.sh

# Daily development
./scripts/dev.sh

# Run tests
./scripts/test.sh

# Check code quality
./scripts/lint.sh
```

### Detailed Development Guide

For comprehensive development instructions including:
- Environment setup and configuration
- Running tests and builds  
- Database migrations
- Docker development
- Troubleshooting common issues
- Contributing guidelines

**See [DEVELOPMENT.md](DEVELOPMENT.md) for complete development documentation.**

### Manual Setup (if you prefer not to use scripts)

#### Backend

1. Navigate to the `backend` directory and set up virtual environment:
    ```sh
    cd backend
    python3 -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    pip install -r requirements.txt
    ```

2. Run database migrations:
    ```sh
    alembic upgrade head
    ```

3. Start the backend server:
    ```sh
    uvicorn main:app --reload --host 0.0.0.0 --port 8000
    ```

#### Frontend

1. Navigate to the `frontend/` directory and install dependencies:
    ```sh
    cd frontend
    npm install
    ```

2. Start the frontend development server:
    ```sh
    npm run dev
    ```

## License

This project is licensed under the MIT License.
