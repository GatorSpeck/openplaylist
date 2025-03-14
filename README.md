# Music Playlist Application

This project is a music playlist management application with a React frontend and a FastAPI backend.

## Running with docker-compose
- Create .env file:
```
CONFIG_PATH=./config  # Required, needs read/write access
PORT=5173  # Required, the port to use to access the web app

# Optional Plex configuration for playlist syncing
PLEX_ENDPOINT=https://your.plex.server
PLEX_TOKEN=foo
PLEX_LIBRARY=Music  # change this if it doesn't match your library name

# Library file mapping (needed if there is a discrepancy between where Plex/OpenPlaylist are mounting your library)
PLEX_MAP_SOURCE=/open/playlist/path/to/my/music
PLEX_MAP_TARGET=/plex/path/to/my/music

# Playlist file mapping (source and target must be read/writable)
PLEX_M3U_DROP_SOURCE=/path/to/playlists  # temporary location to playlist exports for import into Plex
PLEX_M3U_DROP_TARGET=/playlist/  # this is where we will tell the Plex API to look for updated playlists

# Optional Last.fm configuration (for album art, track/album search, and suggestions)
LASTFM_API_KEY=foo
LASTFM_SHARED_SECRET=foo

# Optional OpenAI configuration (for suggestions)
OPENAI_API_KEY=foo

# Optional Redis configuration (for caching of OpenAI and Last.FM queries)
REDIS_HOST=localhost
REDIS_PORT=6379
```

- Run with `docker-compose up --build -d`
```
version: '3.8'

networks:
  playlist:
    driver: bridge

services:
  backend:
    build: ./backend
    volumes:
      - /path/to/music:/music:ro  # only read-only access is needed
      - ./data:/data:rw  # path to store SQLite database
      # - ${PLEX_M3U_DROP_SOURCE}:/playlists:rw
    restart: unless-stopped
    networks:
      - playlist
    expose:
      - 3000
    environment:
      # Last.fm configuration
      # - LASTFM_API_KEY=${LASTFM_API_KEY}
      # - LASTFM_SHARED_SECRET=${LASTFM_SHARED_SECRET}

      # Plex configuration
      # - PLEX_ENDPOINT=${PLEX_ENDPOINT}
      # - PLEX_TOKEN=${PLEX_TOKEN}
      # - PLEX_LIBRARY=${PLEX_LIBRARY}
      # - PLEX_MAP_SOURCE=${PLEX_MAP_SOURCE}
      # - PLEX_MAP_TARGET=${PLEX_MAP_TARGET}

      # Plex playlist sync configuration
      # - PLEX_M3U_DROP_SOURCE=${PLEX_M3U_DROP_SOURCE}
      # - PLEX_M3U_DROP_TARGET=${PLEX_M3U_DROP_TARGET}

      # OpenAI configuration
      # - OPENAI_API_KEY=${OPENAI_API_KEY}

      # Redis configuration
      # REDIS_HOST=${REDIS_HOST}
      # REDIS_PORT=${REDIS_PORT}

  frontend:
    build: ./frontend
    ports:
      - "${PORT}:80"
    volumes:
      - /app/node_modules
    depends_on:
      - backend
    restart: unless-stopped
    networks:
      - playlist
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