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
    PlaylistEntryBase,
    MusicFileEntry,
    NestedPlaylistEntry,
    LastFMEntry,
    RequestedTrackEntry,
    AlbumEntry,
    RequestedAlbumEntry,
    PlaylistEntriesResponse
)
from sqlalchemy.orm import joinedload, aliased, contains_eager, selectin_polymorphic, selectinload, with_polymorphic
from sqlalchemy import select, tuple_, and_, func, or_, case
from typing import List, Optional
import warnings
import os
import json
from datetime import datetime
from pydantic import BaseModel
from enum import IntEnum

import dotenv
dotenv.load_dotenv(override=True)

import logging
logger = logging.getLogger(__name__)

def playlist_orm_to_response(playlist: PlaylistEntryDB, order=0, details: bool = True):
    playlist.order = order
    if playlist.entry_type == "music_file":
        return MusicFileEntry.from_orm(playlist, details=details)
    elif playlist.entry_type == "nested_playlist":
        return NestedPlaylistEntry.from_orm(playlist, details=details)
    elif playlist.entry_type == "lastfm":
        return LastFMEntry.from_orm(playlist, details=details)
    elif playlist.entry_type == "requested":
        return RequestedTrackEntry.from_orm(playlist, details=details)
    elif playlist.entry_type == "album":
        return AlbumEntry.from_orm(playlist, details=details)
    elif playlist.entry_type == "requested_album":
        return RequestedAlbumEntry.from_orm(playlist, details=details)
    else:
        raise ValueError(f"Unknown entry type: {playlist.entry_type}")
    

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

        return [Playlist(id=r.id, name=r.name, entries=[]) for r in results]

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
                album = AlbumDB(
                    artist=entry.details.artist,
                    title=entry.details.title,
                    art_url=entry.details.art_url
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

        this_playlist = self.session.query(PlaylistDB).get(playlist_id)
        if this_playlist is None:
            raise ValueError(f"Playlist with ID {playlist_id} not found")

        # Batch process entries in chunks
        CHUNK_SIZE = 1000
        for i in range(0, len(entries), CHUNK_SIZE):
            chunk = entries[i:i + CHUNK_SIZE]
            
            # Create all entries for this chunk
            playlist_entries = [
                entry.to_playlist(playlist_id)
                for entry in chunk
            ]
            
            this_playlist.entries.extend(playlist_entries)
                
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

        entry_ids = set([e.order for e in entries])

        count = 0
        for entry in playlist_entries:
            if entry.order in entry_ids:
                count += 1
                self.session.delete(entry)

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
        playlist = self.get_with_entries(playlist_id)
        if playlist is None:
            return None

        #m3u = "#EXTM3U\n"
        m3u = ""
        for entry in playlist.entries:
            if entry.entry_type == "music_file":
                #m3u += f"#EXTINF:{entry.details.length},{entry.details.artist} - {entry.details.title}\n"
                path = entry.details.path.replace(mapping_source, mapping_target)
                m3u += path + "\n"
            else:
                continue

        return m3u

    def export_to_json(self, playlist_id: int):
        playlist = self.get_with_entries(playlist_id)
        if playlist is None:
            return None

        return json.dumps({
            "id": playlist.id,
            "name": playlist.name,
            "entries": [e.model_dump() for e in playlist.entries]
        }, indent=4, default=str, sort_keys=True)
    
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
        playlist_entries = (
            self._get_playlist_query(playlist_id, details=False)
            .filter(self.model.id == playlist_id)
            .first()
        ).entries

        entries_to_move = []
        for _ in indices_to_reorder:
            entries_to_move.append(playlist_entries.pop(new_index))
        
        reversed_list = sorted(indices_to_reorder)

        for i in reversed_list:
            entry = entries_to_move.pop(0)
            playlist_entries.insert(i, entry)

        self.session.commit()

    def reorder_entries(self, playlist_id: int, indices_to_reorder: List[int], new_index: int):
        playlist = (
            self._get_playlist_query(playlist_id, details=False)
            .filter(self.model.id == playlist_id)
            .first()
        )

        playlist_entries = playlist.entries

        reversed_list = sorted(indices_to_reorder, reverse=True)

        entries_to_move = [playlist_entries.pop(i) for i in reversed_list]

        # move block of entries to new index
        for entry in entries_to_move:
            playlist_entries.insert(new_index, entry)
        
        self.session.commit()

    def undo_add_entries(self, playlist_id: int, entries: List[PlaylistEntryBase]):
        playlist = self._get_playlist_query(playlist_id).first()
        if playlist is None:
            return None
        
        num_entries_to_remove = len(entries)
        entries_to_remove = playlist.entries[-num_entries_to_remove:]

        for e in entries_to_remove:
            self.session.delete(e)

        self.session.commit()
    
    def undo_remove_entries(self, playlist_id: int, entries: List[PlaylistEntryBase]):
        self.add_entries(playlist_id, entries)
    
    def filter_playlist(self, playlist_id, filter: PlaylistFilter, include_count=False):
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

        # Start the base query
        query = (
            self.session.query(poly_entity)
            .filter(poly_entity.playlist_id == playlist_id)
            # Join to each type of details table
            .outerjoin(music_file_details, poly_entity.MusicFileEntryDB.details)
            .outerjoin(requested_track_details, poly_entity.RequestedTrackEntryDB.details)
            .outerjoin(lastfm_details, poly_entity.LastFMEntryDB.details)
            .outerjoin(requested_album_details, poly_entity.RequestedAlbumEntryDB.details)
        )

        # Apply text filter if provided
        if filter.filter:
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
        
        # Apply sorting
        if filter.sortCriteria == PlaylistSortCriteria.ORDER:
            sort_column = poly_entity.order
        elif filter.sortCriteria == PlaylistSortCriteria.TITLE:
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
        
        # Handle sort direction
        if sort_column is not None:
            if filter.sortDirection == PlaylistSortDirection.ASC:
                query = query.order_by(sort_column.asc())
            elif filter.sortDirection == PlaylistSortDirection.DESC:
                query = query.order_by(sort_column.desc())
        
        count = query.count() if include_count else None
        
        # Apply pagination
        if filter.offset:
            query = query.offset(filter.offset)
        
        if filter.limit:
            query = query.limit(filter.limit)
        
        entries = query.all()

        offset_to_use = filter.offset or 0

        # convert to response models
        entries = [playlist_orm_to_response(e, order=(i + offset_to_use)) for i, e in enumerate(entries)]
        return PlaylistEntriesResponse(total=count, entries=entries)

    def get_details(self, playlist_id):
        query = self.session.query(PlaylistDB).filter(PlaylistDB.id == playlist_id)
        playlist = query.first()
        if playlist is None:
            return None
        
        return Playlist(id=playlist.id, name=playlist.name, entries=[])