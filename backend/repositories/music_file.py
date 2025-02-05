from .base import BaseRepository
from models import MusicFileDB
from typing import Optional
from response_models import MusicFile, SearchQuery
from sqlalchemy import text, or_
import time
import urllib
import logging

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
        last_scanned=music_file_db.last_scanned
    )

class MusicFileRepository(BaseRepository[MusicFileDB]):
    def __init__(self, session):
        super().__init__(session, MusicFileDB)

    def search(self, query: str, limit: int = 50) -> list[MusicFile]:
        query_package = SearchQuery(full_search=query, limit=limit)
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
        score_sum = "+".join([scoring.replace(":token", f":token{i}") 
                            for i in range(len(tokens))])
        
        # Build query with scoring
        query = self.session.query(
            MusicFileDB,
            text(f"({score_sum}) as relevance")
        )
        
        # Add token parameters
        for i, token in enumerate(tokens):
            query = query.params({f"token{i}": token})
            
            # Filter to only include results matching at least one token
            query = query.filter(or_(
                MusicFileDB.title.ilike(f"%{token}%"),
                MusicFileDB.artist.ilike(f"%{token}%"), 
                MusicFileDB.album.ilike(f"%{token}%")
            ))
        
        # Order by relevance score
        results = query.order_by(text("relevance DESC")).limit(query_package.limit).all()
        
        logging.info(f"Search query: {search_query} returned {len(results)} results in {time.time() - start_time:.2f} seconds")
        
        # Extract just the MusicFileDB objects from results
        return [to_music_file(r.MusicFileDB) for r in results]
    
    def filter(
        self,
        title: Optional[str] = None,
        artist: Optional[str] = None,
        album: Optional[str] = None,
        genre: Optional[str] = None,
        limit: int = 50
    ) -> list[MusicFile]:
        query = self.session.query(MusicFileDB)

        if title:
            query = query.filter(MusicFileDB.title.ilike(f"%{title}%"))
        if artist:
            query = query.filter(MusicFileDB.artist.ilike(f"%{artist}%"))
        if album:
            query = query.filter(MusicFileDB.album.ilike(f"%{album}%"))
        if genre:
            query = query.filter(MusicFileDB.genres.any(genre))

        results = query.limit(limit).all()
        
        return [to_music_file(music_file) for music_file in results]