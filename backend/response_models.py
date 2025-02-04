from pydantic import BaseModel
from typing import List, Optional, Union
from enum import Enum
from datetime import datetime

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

class NestedPlaylistEntry(PlaylistEntryBase):
    entry_type: EntryType = EntryType.NESTED_PLAYLIST
    playlist_id: int
    details: Optional[PlaylistBase] = None

class LastFMTrack(TrackDetails):
    url: str

class LastFMEntry(PlaylistEntryBase):
    entry_type: EntryType = EntryType.LASTFM
    url: str
    details: Optional[LastFMTrack] = None

class RequestedTrackEntry(PlaylistEntryBase):
    entry_type: EntryType = EntryType.REQUESTED
    details: Optional[TrackDetails] = None

PlaylistEntry = Union[MusicFileEntry, NestedPlaylistEntry, LastFMEntry, RequestedTrackEntry]

class Playlist(PlaylistBase):
    entries: List[PlaylistEntry] = []

class SearchQuery(BaseModel):
    full_search: Optional[str] = None  # title, artist, and album are scored
    album: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    limit: Optional[int] = 50