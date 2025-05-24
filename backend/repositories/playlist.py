from .base import BaseRepository
from models import (
    PlaylistDB,
    PlaylistEntryDB,
    LastFMEntryDB,
    LastFMTrackDB,
    MusicFileEntryDB,
    RequestedTrackEntryDB,
    RequestedTrackDB,
    MusicFileDB,
    TrackGenreDB,
    BaseNode,
    AlbumDB,
    AlbumTrackDB,
    RequestedAlbumEntryDB
)
from response_models import (
    Playlist,
    PlaylistEntry,
    PlaylistEntryBase,
    MusicFileEntry,
    NestedPlaylistEntry,
    LastFMEntry,
    RequestedTrackEntry,
    AlbumEntry,
    RequestedAlbumEntry,
    PlaylistEntriesResponse,
    LastFMTrack,
    AlbumTrack,
    Album,
    RequestedAlbumEntry,
    SearchQuery
)
from sqlalchemy.orm import joinedload, aliased, contains_eager, selectin_polymorphic, selectinload, with_polymorphic
from sqlalchemy import select, tuple_, and_, func, or_, case
from typing import List, Optional
import warnings
import os
import json
from datetime import datetime, timezone
from pydantic import BaseModel
from enum import IntEnum

import dotenv
dotenv.load_dotenv(override=True)

import logging
logger = logging.getLogger(__name__)

def playlist_orm_to_response(playlist: PlaylistEntryDB, order: Optional[int] = None, details: bool = True):
    if playlist.entry_type == "music_file":
        result = MusicFileEntry.from_orm(playlist, details=details)
    elif playlist.entry_type == "nested_playlist":
        result = NestedPlaylistEntry.from_orm(playlist, details=details)
    elif playlist.entry_type == "lastfm":
        result = LastFMEntry.from_orm(playlist, details=details)
    elif playlist.entry_type == "requested":
        result = RequestedTrackEntry.from_orm(playlist, details=details)
    elif playlist.entry_type == "album":
        result = AlbumEntry.from_orm(playlist, details=details)
    elif playlist.entry_type == "requested_album":
        result = RequestedAlbumEntry.from_orm(playlist, details=details)
    else:
        raise ValueError(f"Unknown entry type: {playlist.entry_type}")

    result.db_order = result.order
    
    if order is not None:
        result.order = order
    
    return result
    

class PlaylistSortCriteria(IntEnum):
    ORDER = 0
    TITLE = 1
    ARTIST = 2
    ALBUM = 3

    @classmethod
    def from_str(cls, s):
        if s is None:
            s = "order"
        s = s.lower()
        if s == "order":
            return cls.ORDER
        elif s == "title":
            return cls.TITLE
        elif s == "artist":
            return cls.ARTIST
        elif s == "album":
            return cls.ALBUM
        else:
            return cls.ORDER

class PlaylistSortDirection(IntEnum):
    ASC = 0
    DESC = 1

    @classmethod
    def from_str(cls, s):
        if s is None:
            s = "asc"
        s = s.lower()
        if s == "asc":
            return cls.ASC
        elif s == "desc":
            return cls.DESC
        else:
            return cls.ASC

class PlaylistFilter(BaseModel):
    filter: Optional[str] = None  # overall filter for string fields
    criteria: Optional[SearchQuery] = None  # specific criteria for filtering
    sortCriteria: PlaylistSortCriteria = PlaylistSortCriteria.ORDER
    sortDirection: PlaylistSortDirection = PlaylistSortDirection.ASC
    limit: Optional[int] = None
    offset: Optional[int] = None

class PlaylistRepository(BaseRepository[PlaylistDB]):
    def __init__(self, session):
        super().__init__(session, PlaylistDB)
    
    def _get_playlist_query(self, playlist_id: int, details=False, limit=None, offset=None):
        # Start with a simple query for the playlist
        query = (
            self.session.query(PlaylistDB)
            .filter(PlaylistDB.id == playlist_id)
        )
        
        # Create a list for loader options
        loader_options = []
        
        # First add the selectinload for the entries relationship
        entry_loader = selectinload(PlaylistDB.entries)
        loader_options.append(entry_loader)
        
        if details:
            # Add detail loaders for each type separately
            loader_options.extend([
                selectinload(PlaylistDB.entries.of_type(MusicFileEntryDB)).selectinload(MusicFileEntryDB.details).selectinload(MusicFileDB.genres),
                selectinload(PlaylistDB.entries.of_type(RequestedTrackEntryDB)).selectinload(RequestedTrackEntryDB.details),
                selectinload(PlaylistDB.entries.of_type(LastFMEntryDB)).selectinload(LastFMEntryDB.details),
                selectinload(PlaylistDB.entries.of_type(RequestedAlbumEntryDB)).selectinload(RequestedAlbumEntryDB.details)
            ])
        else:
            loader_options.extend([
                selectinload(PlaylistDB.entries.of_type(MusicFileEntryDB)),
                selectinload(PlaylistDB.entries.of_type(RequestedTrackEntryDB)),
                selectinload(PlaylistDB.entries.of_type(LastFMEntryDB)),
                selectinload(PlaylistDB.entries.of_type(RequestedAlbumEntryDB))
            ])
        
        # Apply all loader options
        query = query.options(*loader_options)
        
        return query
    
    def get_count(self, playlist_id: int):
        return {"count": self.session.query(PlaylistEntryDB).filter(PlaylistEntryDB.playlist_id == playlist_id).count()}
    
    def get_without_details(self, playlist_id: int) -> Optional[Playlist]:
        query = self._get_playlist_query(playlist_id, details=False)
        
        result = query.first()
        if result is None:
            return None

        return Playlist.from_orm(result, details=False)

    def get_with_entries(self, playlist_id: int, limit=None, offset=None) -> Optional[Playlist]:
        # First, get the basic playlist info without entries
        playlist = self.session.query(PlaylistDB).filter(PlaylistDB.id == playlist_id).first()
        if playlist is None:
            return None
        
        # Get just the paginated entries without loading details yet
        entries_query = (
            self.session.query(PlaylistEntryDB)
            .filter(PlaylistEntryDB.playlist_id == playlist_id)
            .order_by(PlaylistEntryDB.order)
        )
        
        # Apply pagination at the database level
        if limit is not None and offset is not None:
            entries_query = entries_query.limit(limit).offset(offset)
        
        # Get the basic entries first
        entry_ids = [entry.id for entry in entries_query.all()]
        
        if not entry_ids:
            # Return empty playlist if no entries found
            return Playlist(id=playlist.id, name=playlist.name, entries=[])
        
        # Now load the full entries with details in one efficient query
        poly_entity = with_polymorphic(
            PlaylistEntryDB,
            [MusicFileEntryDB, RequestedTrackEntryDB, LastFMEntryDB, RequestedAlbumEntryDB]
        )
        
        full_entries = (
            self.session.query(poly_entity)
            .filter(poly_entity.id.in_(entry_ids))
            .order_by(poly_entity.order)
            .options(
                # Load details for each type
                selectinload(poly_entity.MusicFileEntryDB.details).selectinload(MusicFileDB.genres),
                selectinload(poly_entity.RequestedTrackEntryDB.details),
                selectinload(poly_entity.LastFMEntryDB.details),
                selectinload(poly_entity.RequestedAlbumEntryDB.details)
            )
        ).all()

        order_offset = 0 if offset is None else offset
        
        # Create the response object
        return Playlist(
            id=playlist.id,
            name=playlist.name,
            entries=[playlist_orm_to_response(e, order=i + order_offset) for i, e in enumerate(full_entries)]
        )

    def get_all(self):
        results = self.session.query(self.model).all()

        return [
            Playlist(
                id=r.id, name=r.name, entries=[],
                updated_at=r.updated_at, pinned=r.pinned, pinned_order=r.pinned_order
            ) for r in results
        ]

    def create(self, playlist: Playlist):
        playlist_db = PlaylistDB(name=playlist.name, entries=[])
        self.session.add(playlist_db)
        self.session.commit()

        self.add_entries(playlist_db.id, entries=playlist.entries)

        self.session.commit()
        self.session.refresh(playlist_db)
        return Playlist.from_orm(playlist_db, details=True)

    def create_entry_dependencies(self, entries: List[PlaylistEntryBase]):
        # Group entries by type for bulk processing
        lastfm_entries = []
        requested_entries = []
        album_entries = []
        
        for entry_idx, entry in enumerate(entries):
            if entry.entry_type == "lastfm":
                lastfm_entries.append((entry_idx, entry))
            elif entry.entry_type == "requested":
                requested_entries.append((entry_idx, entry))
            elif entry.entry_type == "requested_album":
                album_entries.append((entry_idx, entry))

        # Bulk process LastFM tracks
        if lastfm_entries:
            urls = [e.details.url for _, e in lastfm_entries]
            existing_tracks = {
                t.url: t for t in self.session.query(LastFMTrackDB)
                .filter(LastFMTrackDB.url.in_(urls)).all()
            }
            
            tracks_to_add = []
            for idx, entry in lastfm_entries:
                if entry.details.url not in existing_tracks:
                    track = entry.to_db()
                    self.session.add(track)
                    self.session.flush()
                    existing_tracks[entry.details.url] = track
                entries[idx].lastfm_track_id = existing_tracks[entry.details.url].id

        # Similar bulk processing for requested tracks
        if requested_entries:
            track_keys = [(e.details.artist, e.details.title) for _, e in requested_entries]
            existing_tracks = {
                (t.artist, t.title): t for t in self.session.query(RequestedTrackDB)
                .filter(tuple_(RequestedTrackDB.artist, RequestedTrackDB.title).in_(track_keys)).all()
            }
            
            tracks_to_add = []
            for idx, entry in requested_entries:
                key = (entry.details.artist, entry.details.title)
                if key not in existing_tracks:
                    track = entry.to_db()
                    self.session.add(track)
                    self.session.flush()
                    existing_tracks[key] = track
                entries[idx].requested_track_id = existing_tracks[key].id

        # Bulk create albums and their tracks
        if album_entries:
            albums_to_add = []
            tracks_to_add = []
            album_tracks_to_add = []
            
            for idx, entry in album_entries:
                # Check if the album already exists
                existing_album = self.session.query(AlbumDB).filter(
                    AlbumDB.artist == entry.details.artist,
                    AlbumDB.title == entry.details.title
                ).first()

                if existing_album:
                    # If it exists, use its ID
                    entries[idx].requested_album_id = existing_album.id
                    continue

                album = AlbumDB(
                    artist=entry.details.artist,
                    title=entry.details.title,
                    art_url=entry.details.art_url,
                    last_fm_url=entry.details.last_fm_url,
                )
                
                # Add album to session to get its ID
                self.session.add(album)
                self.session.flush()
                
                albums_to_add.append(album)
                entries[idx].requested_album_id = album.id
                    
                if entry.details.tracks:
                    for i, track in enumerate(entry.details.tracks):
                        artist = track.linked_track.artist or track.linked_track.album_artist
                        new_track = RequestedTrackDB(
                            artist=artist,
                            title=track.linked_track.title,
                            entry_type="requested_track"
                        )
                        # Add track to session to get its ID
                        self.session.add(new_track)
                        self.session.flush()
                        
                        tracks_to_add.append(new_track)
                        
                        # Create album track with valid IDs
                        album_track = AlbumTrackDB(
                            order=i,
                            linked_track_id=new_track.id,
                            album_id=album.id
                        )
                        album.tracks.append(album_track)

            # No need for bulk_save_objects since we're adding to session directly
            self.session.flush()

        return entries

    def add_entries(self, playlist_id: int, entries: List[PlaylistEntryBase], undo=False) -> None:
        if undo:
            return self.undo_add_entries(playlist_id, entries)
        
        if not entries:
            return Playlist(id=playlist_id, name="", entries=[])

        entries = self.create_entry_dependencies(entries)

        this_playlist = self.session.get(PlaylistDB, playlist_id)
        if this_playlist is None:
            raise ValueError(f"Playlist with ID {playlist_id} not found")
        
        def get_current_order():
            # get max order
            current_order = self.session.query(func.max(PlaylistEntryDB.order)).filter(PlaylistEntryDB.playlist_id == playlist_id).scalar() or 0

            while True:
                current_order += 100
                yield current_order

        order_generator = get_current_order()

        # Batch process entries in chunks
        CHUNK_SIZE = 1000
        for i in range(0, len(entries), CHUNK_SIZE):
            chunk = entries[i:i + CHUNK_SIZE]
            
            # Create all entries for this chunk
            playlist_entries = [
                entry.to_playlist(playlist_id, order=next(order_generator))
                for entry in chunk
            ]
            
            this_playlist.entries.extend(playlist_entries)
        
        this_playlist.updated_at = datetime.now()
                
        self.session.commit()
    
    def remove_entries(
        self, playlist_id: int, entries: List[int], undo=False
    ) -> None:
        if undo:
            return self.undo_remove_entries(playlist_id, entries)
        
        playlist_entries = (
            self._get_playlist_query(playlist_id, details=False)
            .filter(self.model.id == playlist_id)
            .first()
        ).entries

        entry_ids = set([e.id for e in entries])

        count = 0
        for entry in playlist_entries:
            if entry.id in entry_ids:
                count += 1
                logging.info(f"Removing entry {entry.id} from playlist {playlist_id}")
                self.session.delete(entry)
        
        playlist = self.session.get(PlaylistDB, playlist_id)
        playlist.updated_at = datetime.now()

        self.session.commit()
        logger.info(f"Removed {count} entries from playlist {playlist_id}")

    def replace_entries(
        self, playlist_id: int, entries: List[PlaylistEntryBase]
    ) -> None:
        warnings.warn("use add/remove/reorder entries instead", DeprecationWarning)
        current_records = (
            self.session.query(PlaylistEntryDB)
            .filter(PlaylistEntryDB.playlist_id == playlist_id)
            .all()
        )
        for record in current_records: 
            self.session.delete(record)

        self.session.commit()

        return self.add_entries(playlist_id, entries)

    def export_to_m3u(self, playlist_id: int, mapping_source = None, mapping_target = None):
        # yield "#EXTM3U\n"
        CHUNK_SIZE = 10000
        fetched = 0
        while True:
            logging.info(f"Fetching chunk starting at {fetched}")
            chunk = self.filter_playlist(playlist_id, PlaylistFilter(offset=fetched, limit=CHUNK_SIZE), count_only=False)
            if not chunk.entries:
                break

            for entry in chunk.entries:
                if entry.entry_type == "music_file":
                    path = entry.details.path
                    if mapping_source and mapping_target:
                        path = path.replace(mapping_source, mapping_target)

                    # yield f"#EXTINF:{entry.details.length},{entry.details.artist} - {entry.details.title}\n"
                    yield f"{path}\n"
                else:
                    continue
            
            fetched += CHUNK_SIZE
        
        logging.info("Finished exporting playlist to M3U")

    def export_to_json(self, playlist_id: int):
        playlist = self.session.query(PlaylistDB).filter(PlaylistDB.id == playlist_id).first()
        if playlist is None:
            raise ValueError(f"Playlist with ID {playlist_id} not found")

        yield "{\"playlist\":"
        yield "{\"id\":" + str(playlist.id) + ","
        yield "\"name\": \"" + playlist.name + "\","
        yield "\"entries\":["
        
        CHUNK_SIZE = 10000
        fetched = 0
        need_comma = False
        while True:
            logging.info(f"Fetching chunk starting at {fetched}")
            chunk = self.filter_playlist(playlist_id, PlaylistFilter(offset=fetched, limit=CHUNK_SIZE), count_only=False)
            if not chunk.entries:
                break
            for entry in chunk.entries:
                if entry.details:
                    comma_str = "," if need_comma else ""
                    need_comma = True
                    yield comma_str + json.dumps(entry.details.to_json())
            
            fetched += CHUNK_SIZE

        yield "]}}"
    
    def get_playlist_entry_details(self, playlist_id: int, entry_ids: List[int]):
        playlist = (
            self._get_playlist_query(playlist_id, details=False)
            .filter(PlaylistDB.id == playlist_id)
            .join(PlaylistDB.entries)
            .first()
        )
        
        if playlist is None:
            return []

        entries = [entry for i, entry in enumerate(playlist.entries) if i in entry_ids]

        return [playlist_orm_to_response(e) for e in entries]
    
    def undo_reorder_entries(self, playlist_id: int, indices_to_reorder: List[int], new_index: int):
        logging.info("starting undo reorder")
        # Use a no_autoflush block to prevent premature flushing
        with self.session.no_autoflush:
            range_start = min([min(indices_to_reorder), new_index])
            range_end = max([max(indices_to_reorder), new_index]) + len(indices_to_reorder)

            new_index -= range_start

            playlist_entries = self.session.query(PlaylistEntryDB).filter(
                PlaylistEntryDB.playlist_id == playlist_id
            ).order_by(PlaylistEntryDB.order).slice(range_start, range_end).all()

            indices_to_reorder = [i - range_start for i in indices_to_reorder]
            
            # Get entries to move from new position (the entries we previously moved)
            entries_to_move = []
            for i in range(len(indices_to_reorder)):
                if new_index + i < len(playlist_entries):
                    entries_to_move.append(playlist_entries[new_index + i])
            
            # Convert to response models
            converted_entries = [playlist_orm_to_response(e, details=True) for e in entries_to_move]

            # Delete entries from their current positions
            for entry in entries_to_move:
                self.session.delete(entry)
            
            # Flush to ensure deletions take effect
            self.session.flush()
            
            # Now remove from the in-memory list
            for i in range(len(entries_to_move)):
                if new_index < len(playlist_entries):
                    playlist_entries.pop(new_index)
            
            # Insert entries at their original positions
            # Sort to ensure we insert in the correct order
            pairs = list(zip(indices_to_reorder, converted_entries))
            sorted_pairs = sorted(pairs, key=lambda x: x[0])
            
            for original_index, entry in sorted_pairs:
                playlist_entries = self.insert_entry(
                    playlist_id, 
                    entry, 
                    new_index=original_index
                )
                self.session.flush()
        
        # Commit outside of no_autoflush block
        self.session.commit()
    
    def add_music_file(self, playlist_id: int, item):
        if not isinstance(item, list):
            item = [item]

        music_files = []
        for i in item:
            # look up music file by path
            music_file = (
                self.session.query(MusicFileDB)
                .filter(MusicFileDB.title == i.title)
                .filter(or_(MusicFileDB.artist == i.artist, MusicFileDB.album_artist == i.artist))
                .filter(MusicFileDB.album == i.album)
                .first()
            )

            if music_file is None:
                logging.warning(f"Music file {i.artist} - {i.album} - {i.title} not found")
                continue
            
            # Create a new MusicFileEntryDB object
            music_file_entry = MusicFileEntry(
                music_file_id=music_file.id,
                entry_type="music_file"
            )

            music_files.append(music_file_entry)
        
        logging.info(f"Matched {len(music_files)} music files to add to playlist {playlist_id}")

        # Add to session and commit
        self.add_entries(playlist_id, music_files)

    def remove_music_file(self, playlist_id: int, item):
        music_file = (
            self.session.query(MusicFileDB)
            .filter(MusicFileDB.title == item.title)
            .filter(MusicFileDB.artist == item.artist)
            .filter(MusicFileDB.album == item.album)
            .first()
        )

        if music_file is None:
            logging.error(f"Music file not found")
            return None
        
        entry = (
            self.session.query(MusicFileEntryDB)
            .filter(MusicFileEntryDB.playlist_id == playlist_id)
            .filter(MusicFileEntryDB.music_file_id == music_file.id)
            .first()
        )

        if entry:
            self.session.delete(entry)
            self.session.commit()
        else:
            logging.warning(f"Entry not found in playlist {playlist_id}")

    def insert_entry(self, playlist_id: int, entry, new_index: int = -1):
        logging.info(f"Adding entry {entry} to playlist {playlist_id} at index {new_index}")
        def get_insert_location():
            query = (
                self.session.query(PlaylistEntryDB)
                .filter(PlaylistEntryDB.playlist_id == playlist_id)
                .order_by(PlaylistEntryDB.order)
            )

            if new_index > 0:
                query = query.slice(new_index - 1, new_index + 1).all()
                lower_bound = query[0].order
                upper_bound = query[1].order
                result = lower_bound + ((upper_bound - lower_bound) // 2)
                if (result == lower_bound) or (result == upper_bound):
                    return None
                return result
            elif new_index == 0:
                query = query.limit(1).all()
                lower_bound = None
                upper_bound = query[0].order
                result = upper_bound // 2
                if result == upper_bound:
                    return None
                return result
            else:
                # get current count
                count = self.session.query(PlaylistEntryDB).filter(PlaylistEntryDB.playlist_id == playlist_id).count()
                query = query.slice(count - 1, count).all()
                lower_bound = query[0].order
                upper_bound = None
                result = lower_bound + 100
                return result
        
        new_loc = get_insert_location()
        if new_loc is None:
            # need to rebalance
            self.rebalance_playlist(playlist_id)
            new_loc = get_insert_location()
        
        self.create_entry_dependencies([entry])
    
        new_entry_db = entry.to_playlist(playlist_id)
        new_entry_db.order = new_loc
        logging.info(f"New entry order: {new_entry_db.order}")
        self.session.add(new_entry_db)  # Add to session
        
        return new_entry_db

    def reorder_entries(self, playlist_id: int, indices_to_reorder: List[int], new_index: int):
        logging.info(f"reordering {indices_to_reorder} to {new_index}")
        # Use a no_autoflush block to prevent premature flushing
        with self.session.no_autoflush:
            logging.info("gathering existing entries")
            range_start = min([min(indices_to_reorder), new_index])
            range_end = max([max(indices_to_reorder), new_index])

            playlist_entries = (
                self.session.query(PlaylistEntryDB)
                .filter(PlaylistEntryDB.playlist_id == playlist_id)
                .order_by(PlaylistEntryDB.order)
                .offset(range_start)
                .limit(range_end - range_start + 1)
                .all()
            )

            indices_to_reorder = [i - range_start for i in indices_to_reorder]
            
            # Get entries to move
            entries_to_move = [playlist_entries[i] for i in sorted(indices_to_reorder, reverse=True)]
            
            # Convert to response models
            converted_entries = [playlist_orm_to_response(e, details=True) for e in entries_to_move]

            # Before deletion
            album_ids = [getattr(entry, 'album_id', None) for entry in entries_to_move]
            album_records = self.session.query(AlbumDB).filter(AlbumDB.id.in_(album_ids)).all()
            logging.info(f"Albums before deletion: {album_ids}, Found records: {[a.id for a in album_records]}")
            
            # Delete original entries from database
            for entry in entries_to_move:
                self.session.delete(entry)
            
            # Flush to ensure deletions take effect
            self.session.flush()

            album_records_after = self.session.query(AlbumDB).filter(AlbumDB.id.in_(album_ids)).all()
            logging.info(f"Albums after deletion: {[a.id for a in album_records_after]}")
            
            # Now remove from the in-memory list
            for i in sorted(indices_to_reorder, reverse=True):
                playlist_entries.pop(i)
            
            # Insert entries at new position
            for e in converted_entries:
                playlist_entries = self.insert_entry(playlist_id, e, new_index=new_index)
                self.session.flush()
        
        # Commit outside of no_autoflush block
        logging.info("reorder complete - committing")
        self.session.commit()

    def undo_add_entries(self, playlist_id: int, entries: List[PlaylistEntryBase]):
        playlist = self._get_playlist_query(playlist_id).first()
        if playlist is None:
            return None
        
        num_entries_to_remove = len(entries)
        entries_to_remove = playlist.entries[-num_entries_to_remove:]

        for e in entries_to_remove:
            self.session.delete(e)
        
        playlist.updated_at = datetime.now()

        self.session.commit()
    
    def undo_remove_entries(self, playlist_id: int, entries: List[PlaylistEntryBase]):
        self.add_entries(playlist_id, entries)
    
    def filter_playlist(self, playlist_id, filter: PlaylistFilter, count_only=False):
        # Define the polymorphic entity
        poly_entity = with_polymorphic(
            PlaylistEntryDB,
            [MusicFileEntryDB, RequestedTrackEntryDB, LastFMEntryDB, RequestedAlbumEntryDB]
        )

        # Alias the detail tables for explicit joins
        music_file_details = aliased(MusicFileDB)
        requested_track_details = aliased(RequestedTrackDB)
        lastfm_details = aliased(LastFMTrackDB)
        requested_album_details = aliased(AlbumDB)

        query = (
            self.session.query(poly_entity)
            .filter(poly_entity.playlist_id == playlist_id)
            # Join to each type of details table
            .outerjoin(music_file_details, poly_entity.MusicFileEntryDB.details)
            .options(
                selectinload(poly_entity.MusicFileEntryDB.details).selectinload(MusicFileDB.genres)
            )
            .outerjoin(requested_track_details, poly_entity.RequestedTrackEntryDB.details)
            .outerjoin(lastfm_details, poly_entity.LastFMEntryDB.details)
            .outerjoin(requested_album_details, poly_entity.RequestedAlbumEntryDB.details)
            .options(
                # Add this line to load RequestedAlbumEntryDB details
                selectinload(poly_entity.RequestedAlbumEntryDB.details)
            )
        )

        # Apply text filter if provided
        if filter.filter is not None:
            query = query.filter(
                or_(
                    # MusicFileDB conditions
                    music_file_details.title.ilike(f"%{filter.filter}%"),
                    music_file_details.artist.ilike(f"%{filter.filter}%"),
                    music_file_details.album.ilike(f"%{filter.filter}%"),
                    # RequestedTrackDB conditions
                    requested_track_details.title.ilike(f"%{filter.filter}%"),
                    requested_track_details.artist.ilike(f"%{filter.filter}%"),
                    # LastFMTrackDB conditions
                    lastfm_details.title.ilike(f"%{filter.filter}%"),
                    lastfm_details.artist.ilike(f"%{filter.filter}%"),
                    # AlbumDB conditions
                    requested_album_details.title.ilike(f"%{filter.filter}%"),
                    requested_album_details.artist.ilike(f"%{filter.filter}%")
                )
            )
        elif filter.criteria is not None:
            conditions = []
            if filter.criteria.title:
                title = filter.criteria.title
                conditions.append(
                    or_(
                        music_file_details.title.ilike(f"%{title}%"),
                        requested_track_details.title.ilike(f"%{title}%"),
                        lastfm_details.title.ilike(f"%{title}%"),
                    )
                )
            
            if filter.criteria.artist:
                artist = filter.criteria.artist
                conditions.append(
                    or_(
                        music_file_details.artist.ilike(f"%{artist}%"),
                        requested_track_details.artist.ilike(f"%{artist}%"),
                        lastfm_details.artist.ilike(f"%{artist}%"),
                    )
                )

            if filter.criteria.album:
                album = filter.criteria.album
                conditions.append(
                    or_(
                        music_file_details.album.ilike(f"%{album}%"),
                        requested_album_details.title.ilike(f"%{album}%"),
                    )
                )
            
            query = query.filter(
                and_(
                    *conditions
                )
            )
        
        # Apply sorting
        if filter.sortCriteria == PlaylistSortCriteria.TITLE:
            sort_column = case(
                (poly_entity.entry_type == "music_file", music_file_details.title),
                (poly_entity.entry_type == "requested", requested_track_details.title),
                (poly_entity.entry_type == "lastfm", lastfm_details.title),
                (poly_entity.entry_type == "requested_album", requested_album_details.title),
                else_=None
            )
        elif filter.sortCriteria == PlaylistSortCriteria.ARTIST:
            sort_column = case(
                (poly_entity.entry_type == "music_file", music_file_details.artist),
                (poly_entity.entry_type == "requested", requested_track_details.artist),
                (poly_entity.entry_type == "lastfm", lastfm_details.artist),
                (poly_entity.entry_type == "requested_album", requested_album_details.artist),
                else_=None
            )
        elif filter.sortCriteria == PlaylistSortCriteria.ALBUM:
            sort_column = case(
                (poly_entity.entry_type == "music_file", music_file_details.album),
                else_=None
            )
        else:
            # default to order
            sort_column = poly_entity.order
        
        # Handle sort direction
        if filter.sortDirection == PlaylistSortDirection.ASC:
            query = query.order_by(sort_column.asc())
        elif filter.sortDirection == PlaylistSortDirection.DESC:
            query = query.order_by(sort_column.desc())
        else:
            query = query.order_by(sort_column.asc())
        
        if count_only:
            count = query.count()
            return PlaylistEntriesResponse(total=count, entries=[])
        
        # Apply pagination
        if filter.offset:
            query = query.offset(filter.offset)
        
        if filter.limit:
            query = query.limit(filter.limit)
        
        entries = query.all()

        offset_to_use = filter.offset or 0

        # convert to response models
        entries = [playlist_orm_to_response(e, order=offset_to_use + i) for i, e in enumerate(entries)]
        return PlaylistEntriesResponse(entries=entries)

    def get_details(self, playlist_id):
        query = self.session.query(PlaylistDB).filter(PlaylistDB.id == playlist_id)
        playlist = query.first()
        if playlist is None:
            return None
        
        return Playlist(id=playlist.id, name=playlist.name, entries=[])
    
    def _update_entity_details(self, orm_model, pydantic_model):
        """Update ORM model fields from a Pydantic model"""
        logging.info(pydantic_model.to_json())
        for key, value in pydantic_model.details.dict().items():
            if key == "id":
                continue
            if key == "tracks":
                # handle nested tracks
                tracks_to_add = []
                for t in value:
                    t["album_id"] = orm_model.details.id
                    logging.info(orm_model.details.id)
                    linked_track = AlbumTrack.from_json(t).to_db()
                    tracks_to_add.append(linked_track)

                setattr(orm_model.details, key, tracks_to_add)
                continue
            if hasattr(orm_model.details, key):
                setattr(orm_model.details, key, value)
        
        logging.info(Album.from_orm(orm_model.details).to_json())

        return orm_model

    def replace_track(self, playlist_id, existing_entry_id, new_entry: PlaylistEntryBase):
        # Get the existing entry
        existing_entry = self.session.get(PlaylistEntryDB, existing_entry_id)
        if existing_entry is None:
            return None
        
        # Check if the new entry is of the same type
        if existing_entry.entry_type == new_entry.entry_type:
            # If the entry types are the same, we can just update the existing entry
            if existing_entry.entry_type == "requested_album":
                existing_entry.details = new_entry.details.to_db()
            else:
                self._update_entity_details(existing_entry, new_entry)

            self.session.commit()
            return new_entry
                
        # register requested track if applicable
        if new_entry.entry_type == "requested":
            track = new_entry.to_db()
            self.session.add(track)
            self.session.flush()
            new_entry.requested_track_id = track.id
        elif new_entry.entry_type == "requested_album":
            album = new_entry.details.to_db()
            self.session.add(album)
            self.session.flush()
            new_entry.requested_album_id = album.id
        
        # Create the new entry
        new_entry_db = new_entry.to_playlist(playlist_id)
        
        # Copy the order from the existing entry
        new_entry_db.order = None

        original_order = existing_entry.order
        
        # Replace the existing entry with the new one
        self.session.delete(existing_entry)
        self.session.flush()
        self.session.add(new_entry_db)
        new_entry_db.order = original_order

        this_playlist = self.session.get(PlaylistDB, playlist_id)
        this_playlist.updated_at = datetime.now()
        
        self.session.commit()

        new_entry.order = new_entry_db.order
        return new_entry
        
    def get_art_grid(self, playlist_id, lastfm_repo):
        poly_entity = with_polymorphic(
            PlaylistEntryDB,
            [MusicFileEntryDB]
        )
        
        query = (
            self.session.query(PlaylistEntryDB)
            .filter(poly_entity.playlist_id == playlist_id)
            .filter(poly_entity.entry_type == "music_file")
            .join(MusicFileDB, poly_entity.MusicFileEntryDB.details)
            .order_by(poly_entity.order)
            .group_by(MusicFileDB.album, MusicFileDB.album_artist, MusicFileDB.artist)
            .limit(50)
        )
        
        entries = query.all()

        results = []

        album_artists = set()

        for e in entries:
            artist_to_use = e.details.album_artist or e.details.artist
            album_artist = artist_to_use + " - " + e.details.album
            if album_artist in album_artists:
                # need to filter these out - can't rely on the group by clause unfortunately
                continue
            album_artists.add(album_artist)

            logging.info(f"Getting album art for {artist_to_use} - {e.details.album}")
            album_art = lastfm_repo.get_album_art(artist_to_use, e.details.album)
            if album_art:
                results.append(album_art)
                if len(results) >= 4:
                    # TODO: increase to 9
                    break
        
        if not results:
            return None

        num_results = 0
        if len(results) >= 9:
            num_results = 9
        elif len(results) >= 4:
            num_results = 4
        elif len(results) >= 1:
            num_results = 1

        return results[:num_results]

    def get_playlists_by_track(self, track_id):
        poly_entity = with_polymorphic(
            PlaylistEntryDB,
            [MusicFileEntryDB]
        )

        query = (
            self.session.query(PlaylistDB)
            .join(poly_entity, PlaylistDB.entries)
            .filter(poly_entity.entry_type == "music_file")
            .filter(poly_entity.MusicFileEntryDB.music_file_id == track_id)
        )

        return [Playlist(id=p.id, name=p.name, entries=[]) for p in query.all()]
    
    def update_pin(self, playlist_id, pinned):
        logging.info(f"Updating pinned status for playlist {playlist_id} to {pinned}")
        playlist = self.session.query(PlaylistDB).get(playlist_id)
        if playlist is None:
            return None
        
        playlist.pinned = pinned
        self.session.commit()
    
    def update_pinned_order(self, playlist_id, pinned_order):
        logging.info(f"Updating pinned order for playlist {playlist_id} to {pinned_order}")
        # reorder pinned playlists to account for the new order
        pinned_playlists = self.session.query(PlaylistDB).filter(PlaylistDB.pinned == True).order_by(PlaylistDB.pinned_order).all()
        if not pinned_playlists:
            return None
        
        # remove the playlist from the list
        playlist = None
        for i, p in enumerate(pinned_playlists):
            if p.id == playlist_id:
                playlist = pinned_playlists.pop(i)
                break
        
        if playlist is None:
            return None
        
        # insert the playlist at the new index
        pinned_playlists.insert(pinned_order, playlist)

        # update the pinned order for all playlists
        for i, p in enumerate(pinned_playlists):
            p.pinned_order = i
        
        self.session.commit()

    def check_for_duplicates(self, playlist_id, new_entries: List[PlaylistEntryBase]):
        results = []

        for entry in new_entries:
            # search for existing entries with the same details
            criteria = SearchQuery(title=entry.get_title(), artist=entry.get_artist(), album=entry.get_album())
            filter = PlaylistFilter(criteria=criteria)
            existing_entries = self.filter_playlist(playlist_id, filter)

            for e in existing_entries.entries:
                logging.info(f"Found dup: {e.details.to_json()}")

            if existing_entries.entries:
                results.append(entry)
        
        return results

    def rebalance_playlist(self, playlist_id):
        """Rebalance the order of entries in a playlist to ensure they are unique and sequential, leaving space for sparse ordering."""
        logging.info("rebalancing")
        entries = self.session.query(PlaylistEntryDB).filter(PlaylistEntryDB.playlist_id == playlist_id).order_by(PlaylistEntryDB.order).all()

        if not entries:
            return
        
        # logging.info(list([e.order for e in entries]))
        
        # Reorder the entries in the playlist (starting from the back)
        idx = len(entries)
        for entry in entries[::-1]:
            entry.order = idx * 100
            idx -= 1

        # logging.info(list([e.order for e in entries]))
        
        self.session.commit()