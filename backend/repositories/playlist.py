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
    RequestedAlbumEntry
)
from sqlalchemy.orm import joinedload, aliased, contains_eager, selectin_polymorphic, selectinload, with_polymorphic
from sqlalchemy import select
from typing import List, Optional
import warnings
import os
import json
from datetime import datetime

import dotenv
dotenv.load_dotenv(override=True)

import logging
logger = logging.getLogger(__name__)

def playlist_orm_to_response(playlist: PlaylistEntryDB, details: bool = True):
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

class PlaylistRepository(BaseRepository[PlaylistDB]):
    def __init__(self, session):
        super().__init__(session, PlaylistDB)
    
    def _get_playlist_query(self, playlist_id: int, details=False, limit=None, offset=None):
        query = (self.session.query(PlaylistDB)
            .filter(PlaylistDB.id == playlist_id)
        )

        if limit is not None and offset is not None:
            subquery = (
                self.session.query(PlaylistEntryDB.id)
                    .filter(PlaylistEntryDB.playlist_id == playlist_id)
                    .order_by(PlaylistEntryDB.order)
                    .limit(limit).offset(offset)
            )
            
            subquery = subquery.subquery("subquery")

            query = query.outerjoin(PlaylistEntryDB, PlaylistDB.entries.any() & (PlaylistEntryDB.id.in_(select(subquery.c.id))))
        
        if details:
            query = query.options(
                # Load RequestedAlbumEntry details and tracks
                selectinload(PlaylistDB.entries.of_type(RequestedAlbumEntryDB))
                .joinedload(RequestedAlbumEntryDB.details)
                .joinedload(AlbumDB.tracks)
                .joinedload(AlbumTrackDB.linked_track),

                selectinload(PlaylistDB.entries.of_type(MusicFileEntryDB))
                .joinedload(MusicFileEntryDB.details),

                selectinload(PlaylistDB.entries.of_type(RequestedTrackEntryDB))
                .joinedload(RequestedTrackEntryDB.details),

                selectinload(PlaylistDB.entries.of_type(LastFMEntryDB))
                .joinedload(LastFMEntryDB.details)
            )

        return query
    
    def get_count(self, playlist_id: int):
        return {"count": self.session.query(PlaylistEntryDB).filter(PlaylistEntryDB.playlist_id == playlist_id).count()}
    
    def get_without_details(self, playlist_id: int) -> Optional[Playlist]:
        result = self.session.query(self.model).filter(self.model.id == playlist_id).first()

        if result is None:
            return None

        entries = [playlist_orm_to_response(e, details=False) for e in result.entries]
        return Playlist(id=result.id, name=result.name, entries=entries)

    def get_with_entries(self, playlist_id: int, limit=None, offset=None) -> Optional[Playlist]:
        query = self._get_playlist_query(playlist_id, details=True, limit=limit, offset=offset)
        result = query.first()
        
        if result is None:
            return None
        
        results_to_use = result.entries if (limit is None and offset is None) else result.entries[offset:offset+limit]

        return Playlist(
            id=result.id,
            name=result.name,
            entries=[playlist_orm_to_response(e) for e in results_to_use]
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
        for entry_idx, entry in enumerate(entries):
            if entry.entry_type == "lastfm":
                track = (
                    self.session.query(LastFMTrackDB)
                    .filter(LastFMTrackDB.url == entry.details.url)
                    .first()
                )
                
                if not track:
                    track = entry.to_db()
                    self.session.add(track)
                    self.session.flush()

                entries[entry_idx].lastfm_track_id = track.id
            elif entry.entry_type == "requested":
                track = (
                    self.session.query(RequestedTrackDB).filter(RequestedTrackDB.artist == entry.details.artist, RequestedTrackDB.title == entry.details.title).first()
                )
                if not track:
                    track = entry.to_db()
                    self.session.add(track)
                    self.session.flush()
                
                entries[entry_idx].requested_track_id = track.id
            elif entry.entry_type == "requested_album":
                this_album = AlbumDB(artist=entry.details.artist, title=entry.details.title, art_url=entry.details.art_url)
                self.session.add(this_album)
                self.session.flush()

                if entry.details.tracks:
                    for i, track in enumerate(entry.details.tracks):
                        # add new requested track
                        artist = track.linked_track.artist if track.linked_track.artist else track.linked_track.album_artist
                        new_track = RequestedTrackDB(artist=artist, title=track.linked_track.title, entry_type="requested_track")
                        self.session.add(new_track)
                        self.session.flush()

                        this_album.tracks.append(AlbumTrackDB(
                            order=i,
                            linked_track_id = new_track.id,
                            linked_track=new_track,
                            album_id=this_album.id
                        ))
                    
                    self.session.flush()
                
                entries[entry_idx].requested_album_id = this_album.id
            else:
                pass  # no need to hook up any new data

        self.session.commit()
        
        return entries

    def add_entries(
        self, playlist_id: int, entries: List[PlaylistEntryBase], undo=False
    ) -> None:
        if undo:
            return self.undo_add_entries(playlist_id, entries)
        
        if not entries:
            return Playlist(id=playlist_id, name="", entries=[])

        entries = self.create_entry_dependencies(entries)

        playlist = self.session.query(PlaylistDB).filter(PlaylistDB.id == playlist_id).first()

        playlist_entries = []
        for entry in entries:
            playlist_entry = entry.to_playlist(playlist_id)
            playlist_entry.date_added = datetime.now()
            playlist.entries.append(playlist_entry)
        
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
            .filter(PlaylistEntryDB.order.in_(entry_ids))
            .first()
        )
        
        if playlist is None:
            return []

        entries = [entry for entry in playlist.entries if entry.order in entry_ids]

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
