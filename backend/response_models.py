from pydantic import BaseModel, Field
from typing import List, Optional, Union, Literal, Dict
from enum import Enum
from datetime import datetime
from models import (
    TrackGenreDB,
    MusicFileDB,
    PlaylistDB,
    NestedPlaylistDB,
    PlaylistEntryDB,
    MusicFileEntryDB,
    NestedPlaylistEntryDB,
    AlbumDB,
    AlbumTrackDB,
    AlbumEntryDB,
    RequestedAlbumEntryDB,
    LocalFileDB
)
from abc import ABC, abstractmethod
import logging
import difflib
from lib.normalize import normalize_title, normalize_artist


class TrackDetails(BaseModel):
    title: Optional[str] = None
    artist: Optional[str] = None
    album_artist: Optional[str] = None
    album: Optional[str] = None
    year: Optional[str] = None
    length: Optional[int] = None
    publisher: Optional[str] = None
    genres: List[str] = []
    exact_release_date: Optional[datetime] = None
    release_year: Optional[int] = None
    rating: Optional[int] = None
    track_number: Optional[int] = None
    disc_number: Optional[int] = None
    comments: Optional[str] = None

    @classmethod
    def from_orm(cls, music_file: MusicFileDB):
        return cls(
            title=music_file.title,
            artist=music_file.artist,
            album_artist=music_file.album_artist,
            album=music_file.album,
            year=music_file.year,
            length=music_file.length,
            publisher=music_file.publisher,
            genres=[s.genre for s in music_file.genres],
            exact_release_date=music_file.exact_release_date,
            release_year=music_file.release_year,
            rating=music_file.rating,
            track_number=try_parse_int(music_file.track_number),
            disc_number=try_parse_int(music_file.disc_number),
            comments=music_file.comments
        )

class MusicEntity(BaseModel):
    id: Optional[int] = None

def try_parse_int(value):
    if value is None:
        return None
    try:
        return int(value)
    except ValueError:
        return None

class LocalTrackDetails(BaseModel):
    path: Optional[str] = None
    kind: Optional[str] = None
    first_scanned: Optional[datetime] = None
    last_scanned: Optional[datetime] = None
    missing: Optional[bool] = False  # True if the track was previously scanned and is now missing from the index
    size: Optional[int] = None

class ExternalTrackDetails(BaseModel):
    last_fm_url: Optional[str] = None
    spotify_uri: Optional[str] = None
    youtube_url: Optional[str] = None
    mbid: Optional[str] = None
    plex_rating_key: Optional[str] = None

class MusicFile(MusicEntity, TrackDetails, LocalTrackDetails, ExternalTrackDetails):
    rating: Optional[int] = None
    exact_release_date: Optional[datetime] = None
    release_year: Optional[int] = None
    playlists: List[int] = []
    entry_type: Literal["music_file"] = "music_file"

    def to_json(self) -> dict:
        return {
            "title": self.title,
            "artist": self.artist or self.album_artist,
            "album": self.album,
        }

    def get_album_artist(self):
        if self.album_artist:
            return self.album_artist
        return self.artist

    @classmethod
    def from_orm(cls, obj: MusicFileDB):
        return cls(
            id=obj.id,
            path=obj.path,
            kind=obj.kind,
            first_scanned=obj.first_scanned,
            last_scanned=obj.last_scanned,
            title=obj.title,
            artist=obj.artist,
            album_artist=obj.album_artist,
            album=obj.album,
            year=obj.year,
            length=obj.length,
            publisher=obj.publisher,
            genres=[str(s.genre) for s in obj.genres],
            missing=obj.missing,
            rating=obj.rating,
            exact_release_date=obj.exact_release_date,
            release_year=obj.release_year,
            size=obj.size,
            track_number=try_parse_int(obj.track_number),
            disc_number=try_parse_int(obj.disc_number),
            comments=obj.comments,
            last_fm_url=obj.last_fm_url,
            spotify_uri=obj.spotify_uri,
            youtube_url=obj.youtube_url,
            mbid=obj.mbid,
            plex_rating_key=obj.plex_rating_key,
            playlists=[]
        )
    
    @classmethod
    def from_local_file(cls, obj: LocalFileDB) -> "MusicFile":
        return cls(
            id=obj.id,  # Add this line
            path=obj.path,
            kind=obj.kind,
            first_scanned=obj.first_scanned,
            last_scanned=obj.last_scanned,
            size=obj.size,
            missing=obj.missing,
            # Use file metadata, not MusicFileDB metadata
            title=obj.file_title,
            artist=obj.file_artist,
            album_artist=obj.file_album_artist,
            album=obj.file_album,
            year=obj.file_year,
            length=obj.file_length,
            publisher=obj.file_publisher,
            rating=obj.file_rating,
            comments=obj.file_comments,
            disc_number=obj.file_disc_number,
            track_number=obj.file_track_number,
            # External sources should be None for unlinked local files
            last_fm_url=None,
            spotify_uri=None,
            youtube_url=None,
            mbid=None,
            plex_rating_key=None,
            genres=[]  # Add this too - local file genres if needed
        )
    
    def to_db(self) -> MusicFileDB:
        music_file = MusicFileDB(
            id=self.id,
            title=self.title,
            artist=self.artist,
            album_artist=self.album_artist,
            album=self.album,
            year=self.year,
            length=self.length,
            publisher=self.publisher,
            genres=[TrackGenreDB(parent_type="music_file", genre=g) for g in self.genres],
            rating=self.rating,
            exact_release_date=self.exact_release_date,
            release_year=self.release_year,
            track_number=self.track_number,
            disc_number=self.disc_number,
            comments=self.comments,
            last_fm_url=self.last_fm_url,
            spotify_uri=self.spotify_uri,
            youtube_url=self.youtube_url,
            mbid=self.mbid,
            plex_rating_key=self.plex_rating_key
        )
        
        # Add local file if path exists
        if self.path:
            music_file.local_file = LocalFileDB(
                path=self.path,
                kind=self.kind,
                first_scanned=self.first_scanned,
                last_scanned=self.last_scanned,
                size=self.size,
                missing=self.missing or False
            )
        
        return music_file
    
    def get_title(self):
        return self.title
    
    def get_artist(self):
        return self.artist
    
    def get_album(self):
        return self.album

class AlbumTrack(MusicEntity):
    id: Optional[int] = None
    order: int
    linked_track: Optional[MusicFile] = None
    album_id: Optional[int] = None
    
    @classmethod
    def from_orm(cls, obj: AlbumTrackDB):
        this_track = None

        if obj.linked_track is not None:
            this_track = MusicFile.from_orm(obj.linked_track)

        return cls(
            id=obj.id,
            order=obj.order,
            linked_track=this_track,
            album_id=obj.album_id
        )
    
    @classmethod
    def from_json(cls, obj: dict):
        if obj is None:
            return None
        this_track = None

        if obj.get("linked_track") is not None:
            this_track = MusicFile.from_json(obj["linked_track"])

        return cls(
            id=obj.get("id"),
            order=obj.get("order"),
            linked_track=this_track,
            album_id=obj.get("album_id")
        )

    def to_json(self) -> dict:
        return {
            "album_id": self.album_id,
            "order": self.order,
            "id": self.id,
            "linked_track": self.linked_track.to_json() if self.linked_track else None,
        }

    def to_db(self) -> AlbumTrackDB:
        return AlbumTrackDB(
            id=self.id,
            order=self.order,
            album_id=self.album_id,
            linked_track=self.linked_track.to_db() if self.linked_track else None
        )

    def get_title(self):
        return self.linked_track.get_title() if self.linked_track else None
    
    def get_artist(self):
        return self.linked_track.get_artist() if self.linked_track else None
    
    def get_album(self):
        return self.linked_track.get_album() if self.linked_track else None


class Album(MusicEntity, ExternalTrackDetails):
    id: Optional[int] =  None
    title: str
    artist: str
    year: Optional[str] = None
    publisher: Optional[str] = None
    tracks: Optional[List[AlbumTrack]] = None
    art_url: Optional[str] = None

    @classmethod
    def from_orm(cls, obj: AlbumDB):
        return cls(
            id=obj.id,
            title=obj.title,
            artist=obj.artist,
            year=obj.year,
            publisher=obj.publisher,
            tracks=[AlbumTrack.from_orm(t) for t in obj.tracks] if obj.tracks else None,
            art_url=obj.art_url,
            last_fm_url=obj.last_fm_url,
            mbid=obj.mbid,
            spotify_uri=obj.spotify_uri,
            youtube_url=obj.youtube_url,
            plex_rating_key=obj.plex_rating_key
        )
    
    def to_db(self) -> AlbumDB:
        return AlbumDB(
            id=self.id,
            title=self.title,
            artist=self.artist,
            year=self.year,
            publisher=self.publisher,
            tracks=[t.to_db() for t in self.tracks] if self.tracks else list(),
            art_url=self.art_url,
            last_fm_url=self.last_fm_url,
            mbid=self.mbid,
            spotify_uri=self.spotify_uri,
            youtube_url=self.youtube_url,
            plex_rating_key=self.plex_rating_key
        )

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "artist": self.artist,
            "year": self.year,
            "last_fm_url": self.last_fm_url,
            "art_url": self.art_url,
            "publisher": self.publisher,
            "mbid": self.mbid,
            "tracks": [t.to_json() for t in self.tracks] if self.tracks else None,
            "spotify_uri": self.spotify_uri,
            "youtube_url": self.youtube_url,
            "plex_rating_key": self.plex_rating_key
        }
    
    def get_title(self):
        return self.title
    
    def get_artist(self):
        return self.artist
    
    def get_album(self):
        return self.title

    def is_album(self):
        return True

class PlaylistBase(BaseModel):
    id: Optional[int] = None
    name: str
    updated_at: Optional[datetime] = None
    pinned: Optional[bool] = False
    pinned_order: Optional[int] = None

class PlaylistEntryStub(BaseModel):
    id: Optional[int] = None
    order: Optional[int] = None
    date_added: Optional[datetime] = None
    date_hidden: Optional[datetime] = None
    is_hidden: Optional[bool] = False
    notes: Optional[str] = None

class PlaylistEntryBase(PlaylistEntryStub, ABC):
    entry_type: Optional[Literal["music_file", "nested_playlist", "album", "requested_album"]] = None  # TODO: consolidate album & requested_album
    image_url: Optional[str] = None

    @abstractmethod
    def to_playlist(self, playlist_id):
        raise NotImplementedError
    
    @abstractmethod
    def get_title(self):
        raise NotImplementedError
    
    @abstractmethod
    def get_artist(self):
        raise NotImplementedError
    
    @abstractmethod
    def get_album(self):
        raise NotImplementedError

    def is_album(self):
        return False

class MusicFileEntry(PlaylistEntryBase):
    entry_type: Optional[Literal["music_file"]] = "music_file"
    music_file_id: Optional[int] = None
    details: Optional[MusicFile] = None
    notes: Optional[str] = None

    def to_json(self) -> dict:
        return {
            "entry_type": "music_file",
            "music_file_id": self.music_file_id,
            "id": self.id,
            "order": self.order,
            "date_added": self.date_added,
            "notes": self.notes,
            "details": self.details.to_json() if self.details else None
        }

    def to_playlist(self, playlist_id, order=None) -> MusicFileEntryDB:
        return MusicFileEntryDB(
            order=order,
            playlist_id=playlist_id,
            entry_type="music_file",  # deprecated
            music_file_id=self.music_file_id,
            date_added = self.date_added or datetime.now()
        )

    def to_db(self) -> MusicFileDB:
        if not self.details:
            raise ValueError("MusicFileEntry requires details to convert to MusicFileDB")
        
        return self.details.to_db()

    @classmethod
    def from_orm(cls, obj: MusicFileEntryDB, details: bool = False):
        return cls(
            id=obj.id,
            order=obj.order,
            music_file_id=obj.music_file_id,
            date_added=obj.date_added,
            notes=obj.notes,
            details=MusicFile.from_orm(obj.details) if (details and obj.details is not None) else None,
        )

    def get_title(self):
        return self.details.get_title() if self.details else None
    
    def get_artist(self):
        return self.details.get_artist() if self.details else None
    
    def get_album(self):
        return self.details.get_album() if self.details else None

class NestedPlaylistEntry(PlaylistEntryBase):
    entry_type: Optional[Literal["nested_playlist"]] = "nested_playlist"
    playlist_id: int
    details: Optional[PlaylistBase] = None
    notes: Optional[str] = None

    def to_playlist(self, playlist_id, order=None) -> NestedPlaylistEntryDB:
        return NestedPlaylistEntryDB(
            order=order,
            entry_type=self.entry_type,
            playlist_id=playlist_id,
            date_added = self.date_added or datetime.now()
        )

    def to_db(self) -> NestedPlaylistDB:
        return NestedPlaylistDB(
            playlist_id=self.playlist_id,
        )

    @classmethod
    def from_orm(cls, obj: NestedPlaylistEntryDB, details: bool = False):
        return cls(
            entry_type="nested_playlist",
            id=obj.id,
            order=obj.order,
            playlist_id=obj.playlist_id,
            details=Playlist(id=obj.details.id, name=obj.details.name, entries=[]) if details else None,
            notes=obj.notes
        )

class AlbumEntry(PlaylistEntryBase):
    entry_type: Optional[Literal["album"]] = "album"
    album_id: Optional[int] = None
    details: Optional[Album] = None
    notes: Optional[str] = None

    def to_playlist(self, playlist_id, order=None) -> AlbumEntryDB:
        return AlbumEntryDB(
            order=order,
            playlist_id=playlist_id,
            entry_type=self.entry_type,
            album_id=self.album_id,
            date_added = self.date_added or datetime.now()
        )

    def to_db(self) -> AlbumDB:
        return AlbumDB(
            id=self.album_id,
            title=self.details.title,
            artist=self.details.artist,
            year=self.details.year,
            publisher=self.details.publisher,
            tracks=[t.__class__.from_orm(t) for t in self.details.tracks],
        )

    @classmethod
    def from_orm(cls, obj: AlbumEntryDB, details: bool = False):
        return cls(
            entry_type="album",
            id=obj.id,
            order=obj.order,
            album_id=obj.album_id,
            date_added=obj.date_added,
            notes=obj.notes,
            details=Album(
                title=obj.details.title,
                artist=obj.details.artist,
                year=obj.details.year,
                publisher=obj.details.publisher,
                tracks=[AlbumTrack.from_orm(t) for t in obj.details.tracks],
            ) if details and obj.details else None,
        )
    
    def get_title(self):
        return self.details.get_title() if self.details else None
    
    def get_artist(self):
        return self.details.get_artist() if self.details else None
    
    def get_album(self):
        return self.details.get_album() if self.details else None
    
    def is_album(self):
        return True

class RequestedAlbumEntry(PlaylistEntryBase):
    entry_type: Optional[Literal["requested_album"]] = "requested_album"
    details: Optional[Album] = None
    requested_album_id: Optional[int] = None
    notes: Optional[str] = None

    def to_playlist(self, playlist_id, order=None) -> RequestedAlbumEntryDB:
        return RequestedAlbumEntryDB(
            order=order,
            playlist_id=playlist_id,
            entry_type=self.entry_type,
            album_id=self.requested_album_id,
            date_added = self.date_added or datetime.now(),
        )

    @classmethod
    def from_orm(cls, obj: AlbumEntryDB, details: bool = False):
        return cls(
            entry_type="requested_album",
            id=obj.id,
            order=obj.order,
            date_added=obj.date_added,
            details=Album(
                id=obj.details.id,
                title=obj.details.title,
                artist=obj.details.artist,
                year=obj.details.year,
                publisher=obj.details.publisher,
                tracks=[AlbumTrack.from_orm(t) for t in obj.details.tracks],
                art_url=obj.details.art_url,
                last_fm_url=obj.details.last_fm_url
            ) if details and obj.details else None,
            notes=obj.notes
        )

    def to_db(self) -> RequestedAlbumEntryDB:
        return RequestedAlbumEntryDB(
            album_id=self.requested_album_id,
        )
    
    def to_json(self) -> dict:
        return {
            "entry_type": "requested_album",
            "requested_album_id": self.requested_album_id,
            "id": self.id,
            "order": self.order,
            "date_added": self.date_added,
            "details": self.details.to_json() if self.details else None
        }
    
    def get_title(self):
        return self.details.get_title() if self.details else None
    
    def get_artist(self):
        return self.details.get_artist() if self.details else None
    
    def get_album(self):
        return self.details.get_album() if self.details else None
    
    def is_album(self):
        return True

PlaylistEntry = Union[MusicFileEntry, NestedPlaylistEntry, AlbumEntry, RequestedAlbumEntry]

class Playlist(PlaylistBase):
    entries: List[PlaylistEntry] = [Field(discriminator="entry_type")]

    @classmethod
    def from_orm(cls, obj: PlaylistDB, details: bool = False):
        entries = []
        for entry in obj.entries:
            if entry.entry_type in ("music_file", "lastfm", "requested"):
                entries.append(MusicFileEntry.from_orm(entry, details))
            elif entry.entry_type == "nested_playlist":
                entries.append(NestedPlaylistEntry.from_orm(entry, details))
            else:
                raise ValueError(f"Unknown entry type: {entry.entry_type}")

        return cls(id=obj.id, name=obj.name, entries=entries, updated_at=obj.updated_at, pinned=obj.pinned, pinned_order=obj.pinned_order)


class SearchQuery(BaseModel):
    full_search: Optional[str] = None  # title, artist, and album are scored
    album: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    limit: Optional[int] = 50
    offset: Optional[int] = 0

class ScanResults(BaseModel):
    in_progress: bool = False
    files_added: int = 0
    files_indexed: int = 0
    files_updated: int = 0
    files_missing: int = 0
    progress: float = 0

class LibraryStats(BaseModel):
    trackCount: int
    albumCount: int
    artistCount: int
    totalLength: int
    missingTracks: int

class AlterPlaylistDetails(BaseModel):
    new_name: Optional[str]
    description: Optional[str]

class AlbumAndArtist(BaseModel):
    album: str
    artist: str

    def __hash__(self):
        return hash((self.album, self.artist))

class Artist(BaseModel):
    name: str
    url: Optional[str] = None
    mbid: Optional[str] = None
    albums: List[Album] = []

class PlaylistEntriesResponse(BaseModel):
    entries: List[PlaylistEntry]
    total: Optional[int] = None

class LinkChangeRequest(BaseModel):
    track_id: int
    updates: Dict[str, Optional[str]] = {}
    
    def model_validate(cls, v):
        # Valid keys for updates
        VALID_KEYS = {
            'local_path', 'youtube_url', 'spotify_uri', 
            'last_fm_url', 'mbid', 'plex_rating_key'
        }

        if isinstance(v, dict) and 'updates' in v:
            # Validate that all keys in updates are valid
            invalid_keys = set(v['updates'].keys()) - VALID_KEYS
            if invalid_keys:
                raise ValueError(f"Invalid update keys: {invalid_keys}")
        return super().model_validate(v)

class SpotifyImportParams(BaseModel):
    playlist_id: str
    playlist_name: str

class PlexImportParams(BaseModel):
    playlist_name: str
    remote_playlist_name: str

class SpotifyTrack(BaseModel):
    id: str
    title: str
    artist: str
    album: str
    track_uri: str
    album_uri: str

class SpotifyPlaylist(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    tracks: List[SpotifyTrack] = []
    last_updated: Optional[datetime] = None

class SearchResultMixin(BaseModel):
    score: int

class AlbumSearchResult(SearchResultMixin, Album):
    pass

class ArtistSearchResult(SearchResultMixin, Artist):
    pass

class TrackSearchResult(SearchResultMixin, MusicFile):
    pass

class SyncTargetConfig(BaseModel):
    """Configuration for a sync target"""
    playlist_name: Optional[str] = None
    playlist_uri: Optional[str] = None
    # Add other configuration fields as needed

class SyncTarget(BaseModel):
    """Model for playlist sync targets"""
    id: Optional[int] = None
    service: str  # 'plex', 'spotify', 'youtube'
    config: Dict[str, str] = {}
    enabled: bool = True
    sendEntryAdds: bool = True
    sendEntryRemovals: bool = True
    receiveEntryAdds: bool = True
    receiveEntryRemovals: bool = True

class PlaylistItem(BaseModel):
    artist: str
    album: Optional[str] = None
    title: str
    music_file_id: Optional[int] = None  # ID of the linked music file
    local_path: Optional[str] = None  # Local path to the file
    spotify_uri: Optional[str] = None  # Spotify URI for the item
    youtube_url: Optional[str] = None  # YouTube Music URI
    plex_rating_key: Optional[str] = None  # Plex rating key for the item
    

    def to_string(self, normalize=False):
        if normalize:
            return f"{normalize_artist(self.artist)} - {normalize_title(self.title)}"
        
        return f"{self.artist} - {self.title}"

    def __hash__(self):
        return hash(self.to_string(normalize=True))

class PlaylistSnapshot(BaseModel):
    name: str
    last_updated: datetime
    items: List[PlaylistItem]
    item_set: set = set()
    local_paths: set = set()
    youtube_uris: set = set()
    spotify_uris: set = set()
    plex_rating_keys: set = set()

    def has(self, item: PlaylistItem):
        if item.local_path:
            if item.local_path in self.local_paths:
                return True
        
        if item.youtube_url:
            if item.youtube_url in self.youtube_uris:
                return True
        
        if item.spotify_uri:
            if item.spotify_uri in self.spotify_uris:
                return True
        
        if item.plex_rating_key:
            if item.plex_rating_key in self.plex_rating_keys:
                return True
            
        return item.to_string(normalize=True) in self.item_set

    def add_item(self, item: PlaylistItem):
        self.items.append(item)
        self.item_set.add(item.to_string(normalize=True))

        if item.local_path:
            self.local_paths.add(item.local_path)
        if item.youtube_url:
            self.youtube_uris.add(item.youtube_url)
        if item.spotify_uri:
            self.spotify_uris.add(item.spotify_uri)
        if item.plex_rating_key:
            self.plex_rating_keys.add(item.plex_rating_key)

    def search_track(self, item: PlaylistItem):
        # Search for a track in the playlist snapshot
        for existing_item in self.items:
            if item.local_path and existing_item.local_path:
                if item.local_path == existing_item.local_path:
                    return existing_item
                
            if item.youtube_url and existing_item.youtube_url:
                if item.youtube_url == existing_item.youtube_url:
                    return existing_item
                
            if item.spotify_uri and existing_item.spotify_uri:
                if item.spotify_uri == existing_item.spotify_uri:
                    return existing_item
                
            if item.plex_rating_key and existing_item.plex_rating_key:
                if item.plex_rating_key == existing_item.plex_rating_key:
                    return existing_item
                
            if (normalize_artist(existing_item.artist) == normalize_artist(item.artist) and
                normalize_title(existing_item.title) == normalize_title(item.title)):
                return existing_item
            
        return None

    def diff(self, other):
        # use difflib to compare the two playlists and return the differences
        left_contents = [item.to_string(normalize=True) for item in self.items]
        right_contents = [item.to_string(normalize=True) for item in other.items]
        diff = difflib.ndiff(left_contents, right_contents)
        return list(diff)
