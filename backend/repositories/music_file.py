from .base import BaseRepository
from models import MusicFileDB, TrackGenreDB
from typing import Optional
from response_models import MusicFile, SearchQuery, RequestedTrack, TrackDetails, Playlist, MusicFileEntry, try_parse_int
from sqlalchemy import text, or_, func
import time
import urllib
import logging
from repositories.playlist import PlaylistRepository

def to_music_file(music_file_db: MusicFileDB) -> MusicFile:
    return MusicFile(
        id=music_file_db.id,
        path=music_file_db.path,
        title=music_file_db.title,
        artist=music_file_db.artist,
        album_artist=music_file_db.album_artist,
        album=music_file_db.album,
        year=music_file_db.year,
        length=music_file_db.length,
        publisher=music_file_db.publisher,
        kind=music_file_db.kind,
        genres=[g.genre for g in music_file_db.genres] or [],
        last_scanned=music_file_db.last_scanned,
        missing=music_file_db.missing,
        track_number=try_parse_int(music_file_db.track_number),
        disc_number=try_parse_int(music_file_db.disc_number),
    )


class MusicFileRepository(BaseRepository[MusicFileDB]):
    def __init__(self, session):
        super().__init__(session, MusicFileDB)

    def search(self, query: str, limit: int = 50, offset: int = 0) -> list[MusicFile]:
        query_package = SearchQuery(full_search=query, limit=limit, offset=offset)
        start_time = time.time()

        search_query = urllib.parse.unquote(query_package.full_search or "")
        tokens = search_query.split()

        # Build scoring expression
        scoring = """
            CASE
                -- Exact title match (highest priority)
                WHEN lower(title) = lower(:token) THEN 100
                -- Title starts with token
                WHEN lower(title) LIKE lower(:token || '%') THEN 75
                -- Title contains token
                WHEN lower(title) LIKE lower('%' || :token || '%') THEN 50
                -- Artist exact match
                WHEN lower(artist) = lower(:token) THEN 40
                -- Artist contains token
                WHEN lower(artist) LIKE lower('%' || :token || '%') THEN 30
                -- Album exact match
                WHEN lower(album) = lower(:token) THEN 20
                -- Album contains token
                WHEN lower(album) LIKE lower('%' || :token || '%') THEN 10
                ELSE 0
            END
        """

        # Add score for each token
        score_sum = "+".join(
            [scoring.replace(":token", f":token{i}") for i in range(len(tokens))]
        )

        # Build query with scoring
        query = self.session.query(MusicFileDB, text(f"({score_sum}) as relevance"))

        # Add token parameters
        for i, token in enumerate(tokens):
            query = query.params({f"token{i}": token})

            # Filter to only include results matching at least one token
            query = query.filter(
                or_(
                    MusicFileDB.title.ilike(f"%{token}%"),
                    MusicFileDB.artist.ilike(f"%{token}%"),
                    MusicFileDB.album.ilike(f"%{token}%"),
                )
            )

        # Order by relevance score
        results = (
            query.order_by(text("relevance DESC"))
                .order_by(MusicFileDB.artist, MusicFileDB.album, MusicFileDB.title)
                .limit(query_package.limit).offset(query_package.offset).all()
        )

        logging.info(
            f"Search query: {search_query} returned {len(results)} results in {time.time() - start_time:.2f} seconds"
        )

        # Extract just the MusicFileDB objects from results
        return [to_music_file(r.MusicFileDB) for r in results]

    def filter(
        self,
        title: Optional[str] = None,
        artist: Optional[str] = None,
        album: Optional[str] = None,
        genre: Optional[str] = None,
        path: Optional[str] = None,
        exact=False,
        limit: int = 50,
        offset: int = 0,
        include_missing: bool = False,
    ) -> list[MusicFile]:
        query = self.session.query(MusicFileDB)

        title = title.lower() if title else None
        artist = artist.lower() if artist else None
        album = album.lower() if album else None

        if not include_missing:
            query = query.filter(MusicFileDB.missing == False)

        if title:
            if exact:
                query = query.filter(func.lower(MusicFileDB.title) == title)
            else:
                query = query.filter(func.lower(MusicFileDB.title).ilike(f"%{title}%"))
        if artist:
            if exact:
                query = query.filter(func.lower(MusicFileDB.artist) == artist)
            else:
                query = query.filter(func.lower(MusicFileDB.artist).ilike(f"%{artist}%"))
        if album:
            if exact:
                query = query.filter(func.lower(MusicFileDB.album) == album)
            else:
                query = query.filter(func.lower(MusicFileDB.album).ilike(f"%{album}%"))
        if genre:
            query = query.filter(func.lower(MusicFileDB.genres).any(genre))
        
        if path:
            query = query.filter(MusicFileDB.path == path)

        results = (
            query
                .order_by(MusicFileDB.artist, MusicFileDB.album, MusicFileDB.title)
                .limit(limit).offset(offset).all()
        )

        return [to_music_file(music_file) for music_file in results]

    def add_music_file(self, music_file: MusicFile) -> MusicFile:
        music_file_db = MusicFileDB(
            path=music_file.path,
            title=music_file.title,
            artist=music_file.artist,
            album_artist=music_file.album_artist,
            album=music_file.album,
            year=music_file.year,
            length=music_file.length,
            publisher=music_file.publisher,
            kind=music_file.kind,
            last_scanned=music_file.last_scanned,
            track_number=music_file.track_number,
            disc_number=music_file.disc_number,
        )

        self.session.add(music_file_db)
        self.session.commit()

        # Add genres
        for genre in music_file.genres:
            music_file_db.genres.append(TrackGenreDB(parent_type="music_file", genre=genre))

        self.session.commit()
        self.session.refresh(music_file_db)

        return to_music_file(music_file_db)

    def delete(self, music_file_id: int):
        music_file = self.session.query(MusicFileDB).get(music_file_id)

        if music_file is None:
            return

        self.session.delete(music_file)
        self.session.commit()

    def mark_music_file_missing(self, music_file_id: int):
        music_file = self.session.query(MusicFileDB).get(music_file_id)

        if music_file is None:
            return

        music_file.missing = True

        self.session.commit()
    
    def mark_music_file_found(self, music_file_id: int):
        music_file = self.session.query(MusicFileDB).get(music_file_id)

        if music_file is None:
            return

        music_file.missing = False

        self.session.commit()
    
    def find_local_files(self, tracks: list[TrackDetails]):
        results = []

        for t in tracks:
            logging.debug(f"Searching for {t.title} by {t.artist}")
            existing_files = self.filter(title=t.title, artist=t.artist, exact=True)
            if existing_files:
                results.append(existing_files[0])
            else:
                results.append(t)

        return results
    
    def contains(self, tracks: list[TrackDetails]):
        filters = or_([MusicFileDB.title == track.title and MusicFileDB.artist == track.artist for track in tracks])
        existing_tracks = self.session.query(MusicFileDB).filter(filters).all()

        results = []

        for track in tracks:
            found = False
            if track.title in [t.title for t in existing_tracks]:
                if track.artist in [t.artist for t in existing_tracks]:
                    found = True
            
            results.append({"exists": found, "title": track.title, "artist": track.artist})

        return results
    
    def get_artist_list(self):
        query = self.session.query(MusicFileDB.artist).filter(MusicFileDB.artist != None).distinct()
        results = query.all()
        return [r[0] for r in results]
    
    def get_album_list(self, artist: Optional[str] = None):
        query = self.session.query(MusicFileDB.album).filter(MusicFileDB.album != None)

        if artist:
            artist = f"%{artist}%"
            query = query.filter(or_(MusicFileDB.artist.ilike(artist), MusicFileDB.album_artist.ilike(artist)))
        
        query = query.distinct()

        results = query.all()
        return [r[0] for r in results]

    def dump_library_to_playlist(self, playlist: Playlist, repo: PlaylistRepository) -> Playlist:
        try:
            logging.info("Dumping library to playlist")
            
            # Get total count for progress reporting
            total_count = self.session.query(MusicFileDB).count()
            logging.info(f"Total music files to add: {total_count}")
            
            # Use pagination to avoid loading everything into memory at once
            chunk_size = 1000
            offset = 0
            
            while True:
                # Fetch only the chunk we need using pagination
                music_files_chunk = self.session.query(MusicFileDB).limit(chunk_size).offset(offset).all()
                
                if not music_files_chunk:
                    break  # No more files to process
                    
                # Create entries without unnecessary details objects
                entries = [
                    MusicFileEntry(
                        entry_type="music_file", 
                        order=offset + i, 
                        music_file_id=music_file.id
                    ) 
                    for i, music_file in enumerate(music_files_chunk)
                ]
                
                # Add the chunk to the playlist
                repo.add_entries(playlist.id, entries)
                
                logging.info(f"Added chunk {offset//chunk_size + 1}, progress: {min(offset + len(music_files_chunk), total_count)}/{total_count}")
                
                offset += len(music_files_chunk)
                
                # Break if we've processed all files or received fewer than requested
                if len(music_files_chunk) < chunk_size:
                    break
                    
            logging.info(f"Successfully added {offset} tracks to playlist {playlist.id}")
            return playlist

        except Exception as e:
            logging.error(f"Failed to dump library to playlist: {e}")
            raise e