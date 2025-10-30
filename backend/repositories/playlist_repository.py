from .base import BaseRepository
from models import (
    PlaylistDB,
    PlaylistEntryDB,
    MusicFileEntryDB,
    MusicFileDB,
    TrackGenreDB,
    BaseNode,
    AlbumDB,
    AlbumTrackDB,
    RequestedAlbumEntryDB,
    SyncTargetDB,
    LocalFileDB
)
from response_models import (
    Playlist,
    PlaylistEntry,
    PlaylistEntryBase,
    MusicFileEntry,
    NestedPlaylistEntry,
    AlbumEntry,
    RequestedAlbumEntry,
    PlaylistEntriesResponse,
    LinkChangeRequest,
    AlbumTrack,
    Album,
    SearchQuery,
    SyncTarget,
    TrackDetails,
    MusicFile
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
from lib.normalize import normalize_title
from lib.match import TrackStub, get_match_score, AlbumStub, get_album_match_score, get_artist_match_score

import dotenv
dotenv.load_dotenv(override=True)

import logging
logger = logging.getLogger(__name__)

def playlist_orm_to_response(playlist_entry: PlaylistEntryDB, order: Optional[int] = None, details: bool = True) -> PlaylistEntry:
    try:
        if playlist_entry.entry_type == "music_file":
            result = MusicFileEntry.from_orm(playlist_entry, details=details)
        elif playlist_entry.entry_type == "nested_playlist":
            result = NestedPlaylistEntry.from_orm(playlist_entry, details=details)
        elif playlist_entry.entry_type == "album":
            result = AlbumEntry.from_orm(playlist_entry, details=details)
        elif playlist_entry.entry_type == "requested_album":
            result = RequestedAlbumEntry.from_orm(playlist_entry, details=details)
        else:
            raise ValueError(f"Unknown entry type: {playlist_entry.entry_type}")
    except Exception as e:
        logging.error(f"Error converting playlist entry: {e}")
        logging.error(f"Playlist entry data: {playlist_entry.__dict__}")
        raise
    
    if order is not None:
        result.order = order
    
    # Add hidden fields
    result.is_hidden = playlist_entry.is_hidden
    result.date_hidden = playlist_entry.date_hidden
    
    return result
    

class PlaylistSortCriteria(IntEnum):
    ORDER = 0
    TITLE = 1
    ARTIST = 2
    ALBUM = 3
    RANDOM = 4  # Add this line

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
        elif s == "random":
            return cls.RANDOM
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
    include_hidden: Optional[bool] = False
    randomSeed: Optional[int] = None  # Add this line

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
                selectinload(PlaylistDB.entries.of_type(RequestedAlbumEntryDB)).selectinload(RequestedAlbumEntryDB.details)
            ])
        else:
            loader_options.extend([
                selectinload(PlaylistDB.entries.of_type(MusicFileEntryDB)),
                selectinload(PlaylistDB.entries.of_type(RequestedAlbumEntryDB))
            ])
        
        # Apply all loader options
        query = query.options(*loader_options)
        
        return query
    
    def get_count(self, playlist_id: int):
        return {"count": self.session.query(PlaylistEntryDB).filter(PlaylistEntryDB.playlist_id == playlist_id).count()}

    def update_links(self, playlist_id: int, details: LinkChangeRequest):
        """Update track links using the new music_files column structure"""
        # Find the playlist entry - could be by entry ID or by music file ID
        entry = None
        
        # First try to find by playlist entry ID (for already linked entries)
        entry = self.session.query(PlaylistEntryDB).filter(
            PlaylistEntryDB.playlist_id == playlist_id,
            PlaylistEntryDB.id == details.track_id
        ).first()
        
        # If not found, try to find by music file ID (for unlinked entries)
        if entry is None:
            entry = self.session.query(MusicFileEntryDB).filter(
                MusicFileEntryDB.playlist_id == playlist_id,
                MusicFileEntryDB.music_file_id == details.track_id
            ).first()

        if entry is None:
            raise ValueError(f"Track with ID {details.track_id} not found in playlist {playlist_id}")

        update_local_path_link = False

        # Only handle music file entries for linking
        if isinstance(entry, MusicFileEntryDB):
            update_local_path_link = True

        # Get or create the music file record
        music_file = entry.details
        if music_file is None:
            raise ValueError(f"No music file details found for entry {details.track_id}")

        # Handle local file linking/unlinking - only if explicitly provided
        if update_local_path_link and 'local_path' in details.updates:
            local_path = details.updates['local_path']
            if local_path is None:
                # Unlink local file - ONLY remove the relationship, preserve LocalFileDB record
                if music_file.local_file:
                    # Store reference to the local file before unlinking
                    local_file_to_preserve = music_file.local_file
                    
                    # Break the relationship in both directions
                    music_file.local_file = None
                    local_file_to_preserve.music_file_id = None
                    
                    logging.info(f"Unlinked local file {local_file_to_preserve.path} from music file {music_file.id}")
            else:
                # Link to local file - find the local file by path
                local_file = self.session.query(LocalFileDB).filter(
                    LocalFileDB.path == local_path
                ).first()
                
                if local_file is None:
                    raise ValueError(f"Local file not found: {local_path}")
                
                # Check if this local file is already linked to another music file
                if local_file.music_file_id is not None:
                    # Unlink from the existing music file first
                    existing_music_file = self.session.query(MusicFileDB).filter(
                        MusicFileDB.id == local_file.music_file_id
                    ).first()
                    
                    if existing_music_file:
                        existing_music_file.local_file = None
                        logging.info(f"Unlinked local file {local_file.path} from existing music file {existing_music_file.id}")
                
                # Now check if the current music file already has a local file linked
                if music_file.local_file is not None:
                    # Unlink the current local file
                    current_local_file = music_file.local_file
                    current_local_file.music_file_id = None
                    music_file.local_file = None
                    logging.info(f"Unlinked existing local file {current_local_file.path} from music file {music_file.id}")
                
                # Now establish the new link
                music_file.local_file = local_file
                local_file.music_file_id = music_file.id
                
                # Sync metadata from the local file to the music file record
                music_file.sync_from_file_metadata()
                
                logging.info(f"Linked local file {local_file.path} to music file {music_file.id} and synced metadata")

        # Handle external source linking/unlinking - directly update music_files columns
        external_source_mappings = {
            'last_fm_url': 'last_fm_url',
            'spotify_uri': 'spotify_uri', 
            'youtube_url': 'youtube_url',
            'mbid': 'mbid',
            'plex_rating_key': 'plex_rating_key'
        }

        for field_name, column_name in external_source_mappings.items():
            # Only process if the field is explicitly provided in the updates
            if field_name in details.updates:
                field_value = details.updates[field_name]
                
                # Update the column directly on the music file
                if field_value is not None and field_value.strip():
                    setattr(music_file, column_name, field_value.strip())
                    logging.info(f"Updated {column_name} to '{field_value.strip()}' for music file {music_file.id}")
                else:
                    # Set to None/empty to clear the field
                    setattr(music_file, column_name, None)
                    logging.info(f"Cleared {column_name} for music file {music_file.id}")

        self.session.commit()
    
    def link_track_with_match(self, playlist_id: int, entry: PlaylistEntry):
        # Get the existing entry in the playlist
        existing_entry = self.session.query(PlaylistEntryDB).filter(
            PlaylistEntryDB.playlist_id == playlist_id,
            PlaylistEntryDB.id == entry.id
        ).first()

        if existing_entry is None:
            raise ValueError(f"Track with ID {entry.id} not found in playlist {playlist_id}")

        # Update the existing entry with the new details
        if isinstance(existing_entry, MusicFileEntryDB):
            existing_entry.music_file_id = entry.music_file_id
            existing_entry.details = entry.details.to_db()
        elif isinstance(existing_entry, RequestedAlbumEntryDB):
            existing_entry.requested_album_id = entry.requested_album_id
            existing_entry.details = entry.details.to_db()
        else:
            raise ValueError(f"Unsupported entry type: {type(existing_entry)}")

        self.session.commit()
    
    def get_without_details(self, playlist_id: int) -> Optional[Playlist]:
        query = self._get_playlist_query(playlist_id, details=False)
        
        result = query.first()
        if result is None:
            return None

        return Playlist.from_orm(result, details=False)

    def get_with_entries(self, playlist_id: int, limit=None, offset=None, include_hidden=False) -> Optional[Playlist]:
        # First, get the basic playlist info without entries
        playlist = self.session.query(PlaylistDB).filter(PlaylistDB.id == playlist_id).first()
        if playlist is None:
            return None
        
        # Get just the paginated entries without loading details yet
        entries_query = (
            self.session.query(PlaylistEntryDB)
            .filter(PlaylistEntryDB.playlist_id == playlist_id)
        )
        
        # Filter out hidden entries unless explicitly requested
        if not include_hidden:
            entries_query = entries_query.filter(PlaylistEntryDB.is_hidden == False)
            
        entries_query = entries_query.order_by(PlaylistEntryDB.order)
        
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
            [MusicFileEntryDB, RequestedAlbumEntryDB]
        )
        
        full_entries = (
            self.session.query(poly_entity)
            .filter(poly_entity.id.in_(entry_ids))
            .order_by(poly_entity.order)
            .options(
                # Load details for each type
                selectinload(poly_entity.MusicFileEntryDB.details).selectinload(MusicFileDB.genres),
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
        requested_entries = []
        album_entries = []
        
        for entry_idx, entry in enumerate(entries):
            if entry.entry_type == "requested_album":
                album_entries.append((entry_idx, entry))
            elif entry.entry_type == "music_file" and hasattr(entry, 'music_file_id') and entry.music_file_id:
                # Skip entries that already reference existing music files
                continue
            elif hasattr(entry, 'details') and entry.details:
                # Only add entries that have details for dependency creation
                requested_entries.append((entry_idx, entry))

        if requested_entries:
            track_keys = [(entry.details.title,entry.details.artist, entry.details.album) for _, entry in requested_entries]
            existing_tracks = {
                (t.title, t.artist, t.album): t for t in self.session.query(MusicFileDB)
                .filter(tuple_(MusicFileDB.title, MusicFileDB.artist, MusicFileDB.album).in_(track_keys)).all()
            }

            for idx, entry in requested_entries:
                key = (entry.details.title, entry.details.artist, entry.details.album)
                if key not in existing_tracks:
                    # If the track doesn't exist, create a new one
                    music_file = entry.to_db()
                    music_file.id = None

                    self.session.add(music_file)
                    self.session.flush()
                    
                    existing_tracks[key] = music_file

                    entries[idx].music_file_id = music_file.id
                else:
                    # If it exists, use its ID
                    entries[idx].music_file_id = existing_tracks[key].id

                    # enrich match with whatever external details we have
                    existing_tracks[key].last_fm_url = entry.details.last_fm_url or existing_tracks[key].last_fm_url
                    existing_tracks[key].spotify_uri = entry.details.spotify_uri or existing_tracks[key].spotify_uri
                    existing_tracks[key].youtube_url = entry.details.youtube_url or existing_tracks[key].youtube_url
                    existing_tracks[key].mbid = entry.details.mbid or existing_tracks[key].mbid
                    existing_tracks[key].plex_rating_key = entry.details.plex_rating_key or existing_tracks[key].plex_rating_key

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

                    # can update this album's metadata if we have it handy
                    if not existing_album.last_fm_url:
                        existing_album.last_fm_url = entry.details.last_fm_url
                    
                    if not existing_album.art_url:
                        existing_album.art_url = entry.details.art_url
                    
                    if not existing_album.mbid:
                        existing_album.mbid = entry.details.mbid
                    
                    if not existing_album.spotify_uri:
                        existing_album.spotify_uri = entry.details.spotify_uri
                    
                    if not existing_album.youtube_url:
                        existing_album.youtube_url = entry.details.youtube_url
                    
                    if not existing_album.plex_rating_key:
                        existing_album.plex_rating_key = entry.details.plex_rating_key
                    
                    self.session.flush()

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
                        new_track = MusicFileDB(
                            artist=artist,
                            title=track.linked_track.title,
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

    def add_entries(self, playlist_id: int, entries: List[PlaylistEntry], undo=False) -> None:
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

    def add_requested_track(self, playlist_id: int, item):
        if not isinstance(item, list):
            item = [item]

        items = [MusicFileEntry(
            details=TrackDetails(
                artist=i.artist,
                title=i.title,
                album=i.album
            ),
        ) for i in item]

        # Add to session and commit
        self.add_entries(playlist_id, items)
        return items
    
    def add_music_file(self, playlist_id: int, item, normalize=False):
        if not isinstance(item, list):
            item = [item]
        
        music_files = []
        for i in item:
            # look up music file by path
            # TODO: refactor to use music_file repo
            matches = (
                self.session.query(MusicFileDB)
                .filter(
                    func.lower(MusicFileDB.title) == normalize_title(i.title) if normalize 
                    else func.lower(MusicFileDB.title) == func.lower(i.title)
                )
                .all()
            )

            match_stub = TrackStub(artist=i.artist, title=i.title, album=i.album)

            for music_file in matches:
                score = get_match_score(match_stub, TrackStub(
                    artist=music_file.artist,
                    title=music_file.title,
                    album=music_file.album
                ))
                music_file.score = score
            
            matches = sorted(matches, key=lambda x: x.score, reverse=True)
            if not matches:
                logging.warning(f"No matching music file found for {i.artist} - {i.album} - {i.title}")

                requested_track = MusicFileEntry(
                    details=MusicFile(
                        artist=i.artist,
                        title=i.title,
                        album=i.album,
                        spotify_uri=i.spotify_uri,
                        youtube_url=i.youtube_url,
                        plex_rating_key=i.plex_rating_key
                    ),
                )
                
                music_files.append(requested_track)
                continue
            
            # enrich the first match with external details if they exist
            matches[0].spotify_uri = i.spotify_uri
            matches[0].youtube_url = i.youtube_url
            matches[0].plex_rating_key = i.plex_rating_key
            
            # Create a new MusicFileEntryDB object
            music_file_entry = MusicFileEntry(
                music_file_id=matches[0].id,
                details=MusicFile.from_orm(matches[0]),
            )

            music_files.append(music_file_entry)
        
        if not music_files:
            return None
        
        logging.info(f"Matched {len(music_files)} music files to add to playlist {playlist_id}")

        # Add to session and commit
        self.add_entries(playlist_id, music_files)
        return music_files

    def remove_music_file(self, playlist_id: int, item, normalize=True):
        # remove any music files in the playlist matching the item title/artist/album
        if not isinstance(item, list):
            item = [item]
        
        for i in item:
            title_to_use = normalize_title(i.title) if normalize else i.title

            # Find the music file entry in the playlist that matches the criteria
            entries = (
                self.session.query(MusicFileEntryDB)
                .join(MusicFileDB, MusicFileEntryDB.music_file_id == MusicFileDB.id)
                .filter(MusicFileEntryDB.playlist_id == playlist_id)
                .filter(func.lower(MusicFileDB.title).startswith(func.lower(title_to_use)))
                .all()
            )

            if not entries:
                logging.warning(f"No matching music file entry found for {i.artist} - {i.album} - {i.title} in playlist {playlist_id}")
                continue

            match_stub = TrackStub(artist=i.artist, title=i.title, album=i.album)

            for entry in entries:
                score = get_match_score(match_stub, TrackStub(
                    artist=entry.details.artist,
                    title=entry.details.title,
                    album=entry.details.album
                ))
                
                if score < 20:
                    continue
                
                logging.info(f"Removing music file entry {entry.id} from playlist {playlist_id}")
                self.session.delete(entry)

            self.session.commit()
                    
    def insert_entry(self, playlist_id: int, entry, new_index: int = -1):
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
            [MusicFileEntryDB, RequestedAlbumEntryDB]
        )

        # Alias the detail tables for explicit joins
        music_file_details = aliased(MusicFileDB)
        requested_album_details = aliased(AlbumDB)

        query = (
            self.session.query(poly_entity)
            .filter(poly_entity.playlist_id == playlist_id)
            # Join to each type of details table
            .outerjoin(music_file_details, poly_entity.MusicFileEntryDB.music_file_id == music_file_details.id)
            .outerjoin(requested_album_details, poly_entity.RequestedAlbumEntryDB.album_id == requested_album_details.id)
            .options(
                selectinload(poly_entity.MusicFileEntryDB.details).selectinload(MusicFileDB.genres),
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
                    # AlbumDB conditions
                    requested_album_details.title.ilike(f"%{filter.filter}%"),
                    requested_album_details.artist.ilike(f"%{filter.filter}%")
                )
            )
        elif filter.criteria is not None:
            conditions = []
            if filter.criteria.title:
                title = filter.criteria.title
                logging.info(f"Filtering by title: {title}")
                conditions.append(
                    or_(
                        music_file_details.title.ilike(f"%{title}%"),
                        requested_album_details.title.ilike(f"%{title}%")
                    )
                )
            
            if filter.criteria.artist:
                artist = filter.criteria.artist
                logging.info(f"Filtering by artist: {artist}")
                conditions.append(
                    or_(
                        music_file_details.artist.ilike(f"%{artist}%"),
                        requested_album_details.artist.ilike(f"%{artist}%")
                    )
                )

            if filter.criteria.album:
                album = filter.criteria.album
                logging.info(f"Filtering by album: {album}")
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
        
        # Add hidden filter
        if not filter.include_hidden:
            query = query.filter(poly_entity.is_hidden == False)
        
        # Apply sorting
        if filter.sortCriteria == PlaylistSortCriteria.TITLE:
            sort_column = case(
                (poly_entity.entry_type == "music_file", music_file_details.title),
                (poly_entity.entry_type == "requested_album", requested_album_details.title),
                else_=None
            )
        elif filter.sortCriteria == PlaylistSortCriteria.ARTIST:
            sort_column = case(
                (poly_entity.entry_type == "music_file", music_file_details.artist),
                (poly_entity.entry_type == "requested_album", requested_album_details.artist),
                else_=None
            )
        elif filter.sortCriteria == PlaylistSortCriteria.ALBUM:
            sort_column = case(
                (poly_entity.entry_type == "music_file", music_file_details.album),
                (poly_entity.entry_type == "requested_album", requested_album_details.title),
                else_=None
            )
        elif filter.sortCriteria == PlaylistSortCriteria.RANDOM:
            # Use a deterministic pseudo-random function with the seed
            from sqlalchemy import func
            if filter.randomSeed is not None:
                # Improved pseudo-random formula that incorporates track metadata to prevent artist grouping
                # Uses simple hash-like operations based on string length for cross-database compatibility
                title_hash = case(
                    (poly_entity.entry_type == "music_file", 
                     func.coalesce(func.length(music_file_details.title), 0) * 31),
                    (poly_entity.entry_type == "requested_album", 
                     func.coalesce(func.length(requested_album_details.title), 0) * 31),
                    else_=0
                )
                artist_hash = case(
                    (poly_entity.entry_type == "music_file", 
                     func.coalesce(func.length(music_file_details.artist), 0) * 37),
                    (poly_entity.entry_type == "requested_album", 
                     func.coalesce(func.length(requested_album_details.artist), 0) * 37),
                    else_=0
                )
                # Combine entry ID with metadata hashes for better distribution
                sort_column = (
                    (poly_entity.id * 1664525 + 
                     title_hash * 2654435761 + 
                     artist_hash * 3266489917 + 
                     filter.randomSeed * 1013904223) % 2147483647
                )
            else:
                sort_column = func.random()
        else:
            # default to order
            sort_column = poly_entity.order
        
        # Handle sort direction (random always uses ASC since it's already randomized)
        if filter.sortCriteria == PlaylistSortCriteria.RANDOM or filter.sortDirection == PlaylistSortDirection.ASC:
            query = query.order_by(sort_column.asc())
        else:
            query = query.order_by(sort_column.desc())
        
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
        converted_entries = [playlist_orm_to_response(e, order=offset_to_use + i) for i, e in enumerate(entries)]
        return PlaylistEntriesResponse(entries=converted_entries)

    def get_details(self, playlist_id):
        query = self.session.query(PlaylistDB).filter(PlaylistDB.id == playlist_id)
        playlist = query.first()
        if playlist is None:
            return None
        
        return Playlist(id=playlist.id, name=playlist.name, entries=[])

    def _update_entity_details(self, orm_model: PlaylistEntryDB, pydantic_model: PlaylistEntryBase):
        """Update ORM model fields from a Pydantic model"""
        if not pydantic_model.details:
            logging.warning("No details provided in pydantic model")
            return orm_model
        
        # Get the details object
        details = orm_model.details
        if not details:
            logging.warning("No details object found in ORM model")
            return orm_model
        
        # Convert pydantic model to dict, excluding None values and complex objects
        update_data = pydantic_model.details.model_dump(exclude={'id'})
        
        # Handle special cases
        for key, value in update_data.items():
            if key == "tracks":
                # Handle nested tracks for albums
                if hasattr(details, 'tracks'):
                    tracks_to_add = []
                    for track_data in value:
                        # Ensure album_id is set
                        track_data["album_id"] = details.id
                        linked_track = AlbumTrack.from_json(track_data).to_db()
                        tracks_to_add.append(linked_track)
                    
                    # Clear existing tracks and add new ones
                    details.tracks.clear()
                    details.tracks.extend(tracks_to_add)
                    logging.info(f"Updated tracks for album {details.id}")
                continue
            
            if key == "genres":
                # Handle genres specially for MusicFileDB
                if hasattr(details, 'genres') and isinstance(value, list):
                    # Clear existing genres
                    for genre in details.genres:
                        self.session.delete(genre)
                    details.genres.clear()
                    
                    # Add new genres
                    for genre_name in value:
                        new_genre = TrackGenreDB(
                            parent_type="music_file",
                            music_file_id=details.id,
                            genre=genre_name
                        )
                        details.genres.append(new_genre)
                    logging.info(f"Updated genres for music file {details.id}")
                continue
            
            # Handle regular fields
            if hasattr(details, key):
                current_value = getattr(details, key)
                if current_value != value:
                    logging.info(f"Updating {key} from {current_value} to {value}")
                    setattr(details, key, value)
            else:
                logging.warning(f"Key {key} not found in details model {details.__class__.__name__}")
        
        # Flush changes to ensure they're applied
        self.session.flush()
        
        logging.info(f"Updated {details} with {pydantic_model.details}")
        return orm_model

    def replace_track(self, playlist_id, existing_entry_id, new_entry: PlaylistEntryBase):
        # Get the existing entry
        existing_entry = self.session.get(PlaylistEntryDB, existing_entry_id)
        if existing_entry is None:
            return None
        
        existing_is_track = existing_entry.entry_type in ("music_file", "requested")
        new_is_track = new_entry.entry_type in ("music_file", "requested")
        
        # Check if the new entry is of the same type
        if existing_is_track and new_is_track:
            # If the entry types are the same, we can just update the existing entry
            self._update_entity_details(existing_entry, new_entry)

            self.session.commit()
            return new_entry
                
        if new_entry.entry_type == "requested_album":
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
            if not e.details.album:
                continue

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
            criteria = SearchQuery(artist=entry.get_artist(), album=entry.get_album())
            if not entry.is_album():
                criteria.title = entry.get_title()

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

    def get_sync_targets(self, playlist_id: int) -> List[SyncTarget]:
        """Get all sync targets for a playlist"""
        # Check if playlist exists
        playlist = self.session.query(PlaylistDB).filter(PlaylistDB.id == playlist_id).first()
        if not playlist:
            raise ValueError(f"Playlist with ID {playlist_id} not found")
        
        # Get sync targets from the database
        targets = self.session.query(SyncTargetDB).filter(SyncTargetDB.playlist_id == playlist_id).all()
        
        # Convert to Pydantic models
        return [SyncTarget(
            id=target.id,
            service=target.service,
            config=json.loads(target.config),
            enabled=target.enabled,
            sendEntryAdds=target.send_entry_adds,
            sendEntryRemovals=target.send_entry_removals,
            receiveEntryAdds=target.receive_entry_adds,
            receiveEntryRemovals=target.receive_entry_removals
        ) for target in targets]

    def create_sync_target(self, playlist_id: int, target: SyncTarget) -> SyncTarget:
        """Create a new sync target for a playlist"""
        try:
            # Check if playlist exists
            playlist = self.session.query(PlaylistDB).filter(PlaylistDB.id == playlist_id).first()
            if not playlist:
                raise ValueError(f"Playlist with ID {playlist_id} not found")
            
            # Validate service
            if target.service not in ['plex', 'spotify', 'youtube']:
                raise ValueError(f"Invalid service: {target.service}")
            
            # Create new sync target
            new_target = SyncTargetDB(
                playlist_id=playlist_id,
                service=target.service,
                config=json.dumps(target.config),
                enabled=target.enabled,
                send_entry_adds=target.sendEntryAdds,
                send_entry_removals=target.sendEntryRemovals,
                receive_entry_adds=target.receiveEntryAdds,
                receive_entry_removals=target.receiveEntryRemovals
            )
            
            self.session.add(new_target)
            self.session.commit()
            
            # Set the ID and return
            target.id = new_target.id
            return target
        except Exception as e:
            self.session.rollback()
            raise e
        finally:
            self.session.close()

    def update_sync_target(self, playlist_id: int, target: SyncTarget) -> SyncTarget:
        """Update an existing sync target"""
        try:
            # Check if sync target exists and belongs to this playlist
            db_target = self.session.query(SyncTargetDB).filter(
                SyncTargetDB.id == target.id,
                SyncTargetDB.playlist_id == playlist_id
            ).first()
            
            if not db_target:
                raise ValueError(f"Sync target with ID {target.id} not found for playlist {playlist_id}")
            
            # Update fields
            db_target.service = target.service
            db_target.config = json.dumps(target.config)
            db_target.enabled = target.enabled
            db_target.send_entry_adds = target.sendEntryAdds
            db_target.send_entry_removals = target.sendEntryRemovals
            db_target.receive_entry_adds = target.receiveEntryAdds
            db_target.receive_entry_removals = target.receiveEntryRemovals

            self.session.commit()
            return target
        except Exception as e:
            self.session.rollback()
            raise e
        finally:
            self.session.close()

    def delete_sync_target(self, playlist_id: int, target_id: int) -> None:
        """Delete a sync target"""
        try:
            # Check if sync target exists and belongs to this playlist
            db_target = self.session.query(SyncTargetDB).filter(
                SyncTargetDB.id == target_id,
                SyncTargetDB.playlist_id == playlist_id
            ).first()
            
            if not db_target:
                raise ValueError(f"Sync target with ID {target_id} not found for playlist {playlist_id}")

            self.session.delete(db_target)
            self.session.commit()
        except Exception as e:
            self.session.rollback()
            raise e
        finally:
            self.session.close()

    # Add new method to hide entries
    def hide_entries(self, playlist_id: int, entry_ids: List[int], hide: bool = True) -> None:
        """Hide or unhide playlist entries"""
        entries = (
            self.session.query(PlaylistEntryDB)
            .filter(PlaylistEntryDB.playlist_id == playlist_id)
            .filter(PlaylistEntryDB.id.in_(entry_ids))
            .all()
        )
        
        for entry in entries:
            entry.is_hidden = hide
            if hide:
                entry.date_hidden = datetime.now()
            else:
                entry.date_hidden = None
        
        # Update playlist timestamp
        playlist = self.session.get(PlaylistDB, playlist_id)
        playlist.updated_at = datetime.now()
        
        self.session.commit()
        logging.info(f"{'Hidden' if hide else 'Unhidden'} {len(entries)} entries in playlist {playlist_id}")