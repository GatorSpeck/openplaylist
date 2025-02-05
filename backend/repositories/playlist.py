from .base import BaseRepository
from models import PlaylistDB, PlaylistEntryDB, LastFMEntryDB, LastFMTrackDB
from response_models import Playlist, PlaylistEntry, MusicFileEntry, NestedPlaylistEntry, LastFMEntry, RequestedTrackEntry
from sqlalchemy.orm import joinedload
from typing import List

def playlist_orm_to_response(playlist: PlaylistEntryDB):
    if playlist.entry_type == "music_file":
        return MusicFileEntry.from_orm(playlist)
    elif playlist.entry_type == "nested_playlist":
        return NestedPlaylistEntry.from_orm(playlist)
    elif playlist.entry_type == "lastfm":
        return LastFMEntry.from_orm(playlist)
    elif playlist.entry_type == "requested":
        return RequestedTrackEntry.from_orm(playlist)
    else:
        raise ValueError(f"Unknown entry type: {playlist.entry_type}")

class PlaylistRepository(BaseRepository[PlaylistDB]):
    def __init__(self, session):
        super().__init__(session, PlaylistDB)

    def get_with_entries(self, playlist_id: int) -> Playlist:
        result = self.session.query(self.model)\
            .options(
                joinedload(self.model.entries),
                joinedload(PlaylistDB.entries.of_type(LastFMEntryDB)).joinedload(LastFMEntryDB.details))\
            .filter(self.model.id == playlist_id)\
            .first()
        
        if result is None:
            return None
        
        entries = [playlist_orm_to_response(e) for e in result.entries]

        return Playlist(
            id=result.id,
            name=result.name,
            entries=entries
        )
    
    def get_all(self):
        results = self.session.query(self.model).all()

        return [Playlist(id=r.id, name=r.name, entries=[]) for r in results]
    
    def create(self, playlist: Playlist):
        playlist_db = PlaylistDB(
            name=playlist.name,
            entries=[]
        )
        self.session.add(playlist_db)
        self.session.commit()

        for entry in playlist.entries:
            self.add_entry(playlist_db.id, entry)

        self.session.commit()
        self.session.refresh(playlist_db)
        return playlist_db
    
    def add_entry(self, playlist_id: int, entry: PlaylistEntry) -> Playlist:
        if entry.entry_type == "lastfm":
            track = self.session.query(LastFMTrackDB).filter(LastFMTrackDB.url == entry.url).first()
            if not track:
                track = entry.to_db()
                self.session.add(track)
                self.session.commit()
                
            entry.details = track
        
        this_playlist = self.session.query(PlaylistDB).filter(PlaylistDB.id == playlist_id).first()
        this_playlist.entries.append(entry.to_playlist(playlist_id))

        self.session.commit()

        self.session.refresh(this_playlist)
        return this_playlist
    
    def add_entries(self, playlist_id: int, entries: List[PlaylistEntry]) -> Playlist:
        if not entries:
            return Playlist(id=playlist_id, name="", entries=[])
        

        for entry in entries:
            result = self.add_entry(playlist_id, entry)
        
        return self.get_with_entries(playlist_id)
    
    def replace_entries(self, playlist_id: int, entries: List[PlaylistEntry]) -> Playlist:
        current_records = self.session.query(PlaylistEntryDB).filter(PlaylistEntryDB.playlist_id == playlist_id).all()
        for record in current_records:
            self.session.delete(record)
        self.session.commit()
        
        return self.add_entries(playlist_id, entries)
