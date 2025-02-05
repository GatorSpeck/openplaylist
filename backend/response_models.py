from pydantic import BaseModel
from typing import List, Optional, Union
from enum import Enum
from datetime import datetime
from models import (    MusicFileDB,    NestedPlaylistDB,   LastFMTrackDB,    RequestedTrackDB,    PlaylistEntryDB,    MusicFileEntryDB,    NestedPlaylistEntryDB,    LastFMEntryDB,    RequestedTrackEntryDB)

class EntryType(str, Enum):
    MUSIC_FILE = "music_file"
    NESTED_PLAYLIST = "nested_playlist"
    LASTFM = "lastfm"
    REQUESTED = "requested"

class TrackDetails(BaseModel):
    title: Optional[str] = None
    artist: Optional[str] = None
    album_artist: Optional[str] = None
    album: Optional[str] = None
    year: Optional[str] = None
    length: Optional[int] = None
    publisher: Optional[str] = None
    genres: List[str] = []

class MusicFile(TrackDetails):
    id: int
    path: str
    kind: Optional[str] = None
    last_scanned: Optional[datetime] = None

class PlaylistBase(BaseModel):
    id: Optional[int] = None
    name: str

class PlaylistEntryBase(BaseModel):
    id: Optional[int] = None
    order: int
    entry_type: EntryType

class MusicFileEntry(PlaylistEntryBase):
    entry_type: EntryType = EntryType.MUSIC_FILE
    music_file_id: int
    details: Optional[MusicFile] = None

    def to_playlist(self, playlist_id) -> PlaylistEntryDB:
        return MusicFileEntryDB(
            playlist_id=playlist_id,
            entry_type=self.entry_type,
            order=self.order,
            music_file_id=self.music_file_id,
        )

    def to_db(self) -> MusicFileDB:
        return MusicFileDB(
            id=self.music_file_id,
            path=self.details.path,
            kind=self.details.kind,
            last_scanned=self.details.last_scanned,
        )
    
    @classmethod
    def from_orm(cls, obj: MusicFileEntryDB):
        return cls(
            id=obj.id, order=obj.order, music_file_id=obj.music_file_id, details=MusicFile(
                id=obj.details.id,
                path=obj.details.path,
                kind=obj.details.kind,
                last_scanned=obj.details.last_scanned,
                title=obj.details.title,
                artist=obj.details.artist,
                album_artist=obj.details.album_artist,
                album=obj.details.album,
                year=obj.details.year,
                length=obj.details.length,
                publisher=obj.details.publisher,
                genres=[s.genre for s in obj.details.genres]
            )
        )

class NestedPlaylistEntry(PlaylistEntryBase):
    entry_type: EntryType = EntryType.NESTED_PLAYLIST
    playlist_id: int
    details: Optional[PlaylistBase] = None

    def to_playlist(self, playlist_id) -> NestedPlaylistEntryDB:
        return NestedPlaylistEntryDB(
            entry_type=self.entry_type,
            playlist_id=playlist_id,
            order=self.order,
        )

    def to_db(self) -> NestedPlaylistDB:
        return NestedPlaylistDB(
            playlist_id=self.playlist_id,
        )

class LastFMTrack(TrackDetails):
    url: str

class LastFMEntry(PlaylistEntryBase):
    entry_type: EntryType = EntryType.LASTFM
    url: str
    details: Optional[LastFMTrack] = None

    def to_playlist(self, playlist_id) -> PlaylistEntryDB:
        return LastFMEntryDB(
            playlist_id=playlist_id,
            entry_type=self.entry_type,
            order=self.order,
            lastfm_track_url=self.url,
            details=self.details
        )

    def to_db(self) -> LastFMTrackDB:
        return LastFMTrackDB(
            url=self.url,
            title=self.details.title,
            artist=self.details.artist,
            album_artist=self.details.album_artist,
            album=self.details.album,
            year=self.details.year,
            length=self.details.length,
            publisher=self.details.publisher,
        )
    
    @classmethod
    def from_orm(cls, obj: LastFMEntryDB):
        if obj.details is not None:
            pass
        return cls(
            id=obj.id, order=obj.order, url=obj.details.url, details=LastFMTrack(
                url=obj.details.url,
                title=obj.details.title,
                artist=obj.details.artist,
                album=obj.details.album
            )
        )

class RequestedTrackEntry(PlaylistEntryBase):
    entry_type: EntryType = EntryType.REQUESTED
    details: Optional[TrackDetails] = None

    def to_playlist(self, playlist_id) -> PlaylistEntryDB:
        return RequestedTrackEntryDB(
            playlist_id=playlist_id,
            entry_type=self.entry_type,
            order=self.order,
        )

    def to_db(self) -> RequestedTrackDB:
        return RequestedTrackDB(
            title=self.details.title,
            artist=self.details.artist,
            album_artist=self.details.album_artist,
            album=self.details.album,
            year=self.details.year,
            length=self.details.length,
            publisher=self.details.publisher,
        )

PlaylistEntry = Union[MusicFileEntry, NestedPlaylistEntry, LastFMEntry, RequestedTrackEntry]

class Playlist(PlaylistBase):
    entries: List[PlaylistEntry] = []

class SearchQuery(BaseModel):
    full_search: Optional[str] = None  # title, artist, and album are scored
    album: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    limit: Optional[int] = 50