from .base import BaseRepository
from models import MusicFileDB, TrackGenreDB, LocalFileDB
from typing import Optional, List
from response_models import MusicFile, SearchQuery, TrackDetails, Playlist, MusicFileEntry, try_parse_int, PlaylistItem
from sqlalchemy import text, or_, func
import time
import urllib
import logging
from repositories.playlist import PlaylistRepository
from lib.normalize import normalize_title

def to_music_file(music_file_db: MusicFileDB) -> MusicFile:
    return MusicFile(
        id=music_file_db.id,
        path=music_file_db.path,  # Uses the property
        title=music_file_db.title,
        artist=music_file_db.artist,
        album_artist=music_file_db.album_artist,
        album=music_file_db.album,
        year=music_file_db.year,
        length=music_file_db.length,
        publisher=music_file_db.publisher,
        kind=music_file_db.kind,  # Uses the property
        genres=[g.genre for g in music_file_db.genres] or [],
        last_scanned=music_file_db.last_scanned,  # Uses the property
        missing=music_file_db.missing,  # Uses the property
        track_number=try_parse_int(music_file_db.track_number),
        disc_number=try_parse_int(music_file_db.disc_number),
        size=music_file_db.size,  # Uses the property
        first_scanned=music_file_db.first_scanned,  # Uses the property
        last_fm_url=music_file_db.last_fm_url,  # Uses the property
        spotify_uri=music_file_db.spotify_uri,  # Uses the property
        youtube_url=music_file_db.youtube_url,  # Uses the property
        mbid=music_file_db.mbid,  # Uses the property
        plex_rating_key=music_file_db.plex_rating_key,  # Uses the property
        comments=music_file_db.comments,
        rating=music_file_db.rating,
        exact_release_date=music_file_db.exact_release_date,
        release_year=music_file_db.release_year,
        playlists=[]
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
                WHEN lower(file_title) = lower(:token) THEN 100
                -- Title starts with token
                WHEN lower(file_title) LIKE lower(:token || '%') THEN 75
                -- Title contains token
                WHEN lower(file_title) LIKE lower('%' || :token || '%') THEN 50
                -- Artist exact match
                WHEN lower(file_artist) = lower(:token) THEN 40
                -- Artist contains token
                WHEN lower(file_artist) LIKE lower('%' || :token || '%') THEN 30
                -- Album exact match
                WHEN lower(file_album) = lower(:token) THEN 20
                -- Album contains token
                WHEN lower(file_album) LIKE lower('%' || :token || '%') THEN 10
                ELSE 0
            END
        """

        # Add score for each token
        score_sum = "+".join(
            [scoring.replace(":token", f":token{i}") for i in range(len(tokens))]
        )

        # Build query with scoring
        query = self.session.query(LocalFileDB, text(f"({score_sum}) as relevance"))

        # Add token parameters
        for i, token in enumerate(tokens):
            query = query.params({f"token{i}": token})

            # Filter to only include results matching at least one token
            query = query.filter(
                or_(
                    LocalFileDB.file_title.ilike(f"%{token}%"),
                    LocalFileDB.file_artist.ilike(f"%{token}%"),
                    LocalFileDB.file_album.ilike(f"%{token}%"),
                )
            )

        # Order by relevance score
        results = (
            query.order_by(text("relevance DESC"))
                .order_by(LocalFileDB.file_artist, LocalFileDB.file_album, LocalFileDB.file_title)
                .limit(query_package.limit).offset(query_package.offset).all()
        )

        logging.info(
            f"Search query: {search_query} returned {len(results)} results in {time.time() - start_time:.2f} seconds"
        )

        # Extract just the LocalFileDB objects from results (first element of each tuple)
        local_files = [result[0] for result in results]
        return [MusicFile.from_local_file(local_file) for local_file in local_files]

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
            query = query.join(LocalFileDB).filter(LocalFileDB.missing == False)

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
            query = query.join(TrackGenreDB).filter(func.lower(TrackGenreDB.genre) == genre)

        if path:
            query = query.join(LocalFileDB).filter(LocalFileDB.path == path)

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
    
    def find_local_files(self, tracks: list[MusicFile]) -> list[Optional[MusicFile]]:
        results = []

        for t in tracks:
            logging.debug(f"Searching for {t.title} by {t.artist}")
            match = self.search_by_playlist_item(PlaylistItem(title=t.title, artist=t.artist))
            if match:
                logging.debug(f"Found match for {t.title} by {t.artist}: {match.id}")

                # enrich match with whatever external details we have
                match.last_fm_url = t.last_fm_url
                match.spotify_uri = t.spotify_uri
                match.youtube_url = t.youtube_url
                match.mbid = t.mbid
                match.plex_rating_key = t.plex_rating_key

                results.append(to_music_file(match))
            else:
                # Return None or a placeholder to maintain array indexing
                results.append(None)

        return results

    def contains(self, tracks: list[MusicFile]) -> list[dict]:
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
    
    def sync_metadata_from_file(self, music_file_id: int):
        """Sync metadata from file tags to the music file record"""
        music_file = self.session.query(MusicFileDB).get(music_file_id)
        if music_file:
            music_file.sync_from_file_metadata()
            self.session.commit()
    
    def get_metadata_differences(self, music_file_id: int) -> dict:
        """Get differences between current metadata and file metadata"""
        music_file = self.session.query(MusicFileDB).get(music_file_id)
        if music_file:
            return music_file.get_file_metadata_differences()
        return {}
    
    def get_files_with_metadata_differences(self, limit: int = 50, offset: int = 0):
        """Get files where the current metadata differs from file metadata"""
        # This would require a more complex query - you might want to implement
        # this as a background job that periodically checks for differences
        pass
    
    def search_by_playlist_item(self, item: PlaylistItem) -> Optional[MusicFileDB]:
        if item.music_file_id:
            query = self.session.query(MusicFileDB).filter(MusicFileDB.id == item.music_file_id)
            result = query.first()
            if result:
                return result
        
        if item.local_path:
            file_part = item.local_path.split("/")[-1]
            matches = (
                self.session.query(MusicFileDB)
                .join(LocalFileDB)
                .filter(LocalFileDB.path.like(f"%{file_part}%"))
                .all()
            )
            
            for m in matches:
                if normalize_title(m.title) == normalize_title(item.title):
                    return m

        matches = (
            self.session.query(MusicFileDB)
            .filter(
                func.lower(MusicFileDB.title) == normalize_title(item.title)
            )
            .all()
        )

        for music_file in matches:
            score = 0

            if music_file.get_artist().lower() == item.artist.lower():
                score += 10
            elif normalize_title(music_file.get_artist().lower()) == normalize_title(item.artist.lower()):
                score += 5
            
            if (music_file.album and item.album) and (music_file.album.lower() == item.album.lower()):
                score += 10
            elif (music_file.album and item.album) and normalize_title(music_file.album.lower()) == normalize_title(item.album.lower()):
                score += 5
            
            music_file._score = score  # Use a temporary attribute (not persisted)
        
        matches = sorted(matches, key=lambda x: getattr(x, "_score", 0), reverse=True)
        
        return matches[0] if matches else None
    
    def get_anniversaries_in_date_range(self, start_date, end_date) -> List[MusicFile]:
        """
        Get albums with anniversaries within the specified absolute date range.
        
        :param start_date: Start date (date object)
        :param end_date: End date (date object)
        :return: List of music files representing albums with anniversaries in the date range
        """
        from datetime import datetime, timedelta
        import calendar
        
        current_year = datetime.now().year
        
        # Query for distinct albums with exact release dates using subquery approach
        subquery = self.session.query(
            func.min(MusicFileDB.id).label('min_id')
        ).filter(
            MusicFileDB.exact_release_date.isnot(None)
        ).group_by(
            MusicFileDB.album, 
            MusicFileDB.album_artist
        ).subquery()
        
        query = self.session.query(MusicFileDB).filter(
            MusicFileDB.id.in_(
                self.session.query(subquery.c.min_id)
            )
        )
        
        albums_with_dates = query.all()
        anniversary_albums = []
        
        for album in albums_with_dates:
            if not album.exact_release_date:
                continue
                
            try:
                # Parse the exact release date
                release_date = album.exact_release_date.date()
                
                # We need to check multiple years because the date range might span years
                years_to_check = []
                
                # Add current year and surrounding years based on the date range
                start_year = start_date.year
                end_year = end_date.year
                
                # Check all years that might have anniversaries in our date range
                for year in range(start_year, end_year + 1):
                    if year >= release_date.year:  # Can't have anniversary before release
                        years_to_check.append(year)
                
                for year in years_to_check:
                    try:
                        # Calculate anniversary date for this year
                        anniversary_date = release_date.replace(year=year)
                    except ValueError:
                        # Handle leap year edge case (Feb 29)
                        if release_date.month == 2 and release_date.day == 29:
                            anniversary_date = release_date.replace(year=year, day=28)
                        else:
                            continue
                    
                    # Check if anniversary falls within our date range
                    if start_date <= anniversary_date <= end_date:
                        # Calculate years since release
                        years_since = year - release_date.year
                        
                        # Create a copy of the album object for this anniversary
                        album_copy = album
                        album_copy.anniversary_date = anniversary_date
                        album_copy.years_since_release = years_since
                        album_copy.original_release_date = release_date
                        
                        anniversary_albums.append(album_copy)
                        break  # Only add once per album (first anniversary found in range)
                        
            except (ValueError, TypeError):
                # Skip albums with invalid date formats
                continue

        # Sort by anniversary date
        anniversary_albums.sort(key=lambda x: x.anniversary_date)

        return anniversary_albums

    # Keep the old method for backward compatibility, but mark it as deprecated
    def get_upcoming_anniversaries(self, days_ahead: int = 30, days_behind: int = 7) -> List[MusicFile]:
        """
        DEPRECATED: Use get_anniversaries_in_date_range instead.
        Get albums with upcoming anniversaries within the specified date range.
        """
        from datetime import datetime, timedelta
        
        today = datetime.now().date()
        start_date = today - timedelta(days=days_behind)
        end_date = today + timedelta(days=days_ahead)
        
        return self.get_anniversaries_in_date_range(start_date, end_date)
