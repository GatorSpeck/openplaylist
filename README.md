# Music Playlist Application

This project is a music playlist management application with a React frontend and a FastAPI backend.

## Running with docker-compose
- Create .env file with `MUSIC_PATH` variable set
- Run with `docker-compose up --build -d`

## Other Configuration
- Plex Playlist Syncing
    - `PLEX_ENDPOINT`
    - `PLEX_TOKEN`
    - `PLEX_LIBRARY`
    - `PLEX_MAP_SOURCE`
    - `PLEX_MAP_TARGET`
    - `PLEX_M3U_DROP`

## Dev Setup

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
    ```

5. Create a `.env` file in the `backend/` directory and add the following environment variables:

    ```env
    HOST=127.0.0.1
    PORT=8000
    MUSIC_PATH=path/to/your/music/directory
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
    VITE_API_URL=http://127.0.0.1:8000
    ```

4. Start the frontend development server:

    ```sh
    npm run dev
    ```

## Usage

- Open your browser and navigate to `http://localhost:5173` to access the frontend.
- The backend API will be available at `http://localhost:3005`.

## Project Structure

- `backend/`: Contains the FastAPI backend code.
- `frontend/`: Contains the React frontend code.

## License

This project is licensed under the MIT License.