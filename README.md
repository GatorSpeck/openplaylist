# Music Playlist Application

This project is a music playlist management application with a React frontend and a FastAPI backend.

## Running with docker-compose
- Create .env file:
```
# Required settings
CONFIG_PATH=./config  # needs read/write access, the dir to store the config
PORT=5173  # the port to use to access the web app
DATA_DIR=./data  # needs read/write access, the dir to store the SQLite DB

# Optional settings
## Plex configuration for playlist syncing
PLEX_ENDPOINT=https://your.plex.server
PLEX_TOKEN=foo
PLEX_LIBRARY=Music  # change this if it doesn't match your library name

## Library file mapping (needed if there is a discrepancy between where Plex/OpenPlaylist are mounting your library)
PLEX_MAP_SOURCE=/open/playlist/path/to/my/music
PLEX_MAP_TARGET=/plex/path/to/my/music

## Playlist file mapping (source and target must be read/writable)
PLEX_M3U_DROP_SOURCE=/path/to/playlists  # temporary location to playlist exports for import into Plex
PLEX_M3U_DROP_TARGET=/playlist/  # this is where we will tell the Plex API to look for updated playlists

## Last.fm configuration (for album art, track/album search, and suggestions)
LASTFM_API_KEY=foo
LASTFM_SHARED_SECRET=foo

## OpenAI configuration (for suggestions)
OPENAI_API_KEY=foo

## Redis configuration (for caching of OpenAI and Last.FM queries)
REDIS_HOST=localhost
REDIS_PORT=6379
```

- Run with `docker-compose up --build -d`
```
services:
  openplaylist:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "${PORT}:80"
    volumes:
      - ${MUSIC_PATH}:/music:ro
      - ${DATA_DIR}:/data:rw
      - ${CONFIG_PATH}:/config:rw
      # - ${PLEX_M3U_DROP_SOURCE}:/playlist:rw
    restart: unless-stopped
    environment:
      # - LASTFM_API_KEY=${LASTFM_API_KEY}
      # - LASTFM_SHARED_SECRET=${LASTFM_SHARED_SECRET}
      # - PLEX_ENDPOINT=${PLEX_ENDPOINT}
      # - PLEX_TOKEN=${PLEX_TOKEN}
      # - PLEX_LIBRARY=${PLEX_LIBRARY}
      # - PLEX_MAP_SOURCE=${PLEX_MAP_SOURCE}
      # - PLEX_MAP_TARGET=${PLEX_MAP_TARGET}
      # - PLEX_M3U_DROP_SOURCE=${PLEX_M3U_DROP_SOURCE}
      # - PLEX_M3U_DROP_TARGET=${PLEX_M3U_DROP_TARGET}
      # - OPENAI_API_KEY=${OPENAI_API_KEY}
    healthcheck:
      test: ["CMD", "/app/healthcheck.sh"]
      interval: 10s
      timeout: 5s
      retries: 5
```

## Local Dev Setup

### Backend

1. Navigate to the `backend` directory:

    ```sh
    cd backend
    ```

2. Create a virtual environment:

    ```sh
    python3 -m venv .venv
    ```

3. Activate the virtual environment:

    - On Windows:

        ```sh
        .venv\Scripts\activate
        ```

    - On macOS/Linux:

        ```sh
        source .venv/bin/activate
        ```

4. Install the required dependencies:

    ```sh
    pip install -r requirements.txt
    pip install -r requirements-dev.txt
    ```

5. Create a `.env` file in the `backend/` directory and add the following environment variables:

    ```env
    HOST=127.0.0.1
    PORT=3000
    ```

6. Start the backend server:

    ```sh
    python main.py
    ```

### Frontend

1. Navigate to the `frontend/` directory:

    ```sh
    cd frontend
    ```

2. Install the required dependencies:

    ```sh
    npm install
    ```

3. Create a `.env` file in the `frontend/` directory and add the following environment variables:

    ```env
    VITE_API_URL=http://127.0.0.1:3000
    VITE_PORT=3009
    ```

4. Start the frontend development server:

    ```sh
    npm run dev
    ```

## Usage

- Open your browser and navigate to `http://localhost:3009` to access the frontend.
- The backend API will be available at `http://localhost:3000`.

## License

This project is licensed under the MIT License.