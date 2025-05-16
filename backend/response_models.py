from pydantic import BaseModel, Field
from typing import List, Optional, Union, Literal
from enum import Enum
from datetime import datetime
from models import (
    TrackGenreDB,
    MusicFileDB,
    PlaylistDB,
    NestedPlaylistDB,
    LastFMTrackDB,
    RequestedTrackDB,
    PlaylistEntryDB,
    MusicFileEntryDB,
    NestedPlaylistEntryDB,
    LastFMEntryDB,
    RequestedTrackEntryDB,
    AlbumDB,
    AlbumTrackDB,
    AlbumEntryDB,
    RequestedAlbumEntryDB
)
from abc import ABC, abstractmethod
import logging


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

class MusicEntity(BaseModel):
    id: Optional[int] = None

class RequestedTrack(MusicEntity, TrackDetails):
    missing: Optional[bool] = False  # True if the track was previously scanned and is now missing from the library
    entry_type: Literal["requested"] = "requested"

    @classmethod
    def from_json(cls, obj: dict):
        return cls(
            id=obj.get("id"),
            title=obj.get("title"),
            artist=obj.get("artist"),
            album_artist=obj.get("album_artist"),
            album=obj.get("album"),
            year=obj.get("year"),
            length=obj.get("length"),
            publisher=obj.get("publisher"),
            genres=[str(s) for s in obj.get("genres", [])]
        )

    @classmethod
    def from_orm(cls, obj: RequestedTrackDB):
        return cls(
            id=obj.id,
            title=obj.title,
            artist=obj.artist,
            album=obj.album,
        )
    
    def to_json(self) -> dict:
        return {
            "title": self.title,
            "artist": self.artist,
            "album": self.album,
        }

    def to_db(self) -> RequestedTrackDB:
        return RequestedTrackDB(
            id=self.id,
            title=self.title,
            artist=self.artist,
            album=self.album,
        )

def try_parse_int(value):
    if value is None:
        return None
    try:
        return int(value)
    except ValueError:
        return None

class MusicFile(MusicEntity, TrackDetails):
    path: str
    kind: Optional[str] = None
    first_scanned: Optional[datetime] = None
    last_scanned: Optional[datetime] = None
    missing: Optional[bool] = False  # True if the track was previously scanned and is now missing from the index
    rating: Optional[int] = None
    size: Optional[int] = None
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
            playlists=[]
        )
    
    def to_db(self) -> MusicFileDB:
        return MusicFileDB(
            id=self.id,
            path=self.path,
            kind=self.kind,
            first_scanned=self.first_scanned,
            last_scanned=self.last_scanned,
            title=self.title,
            artist=self.artist,
            album_artist=self.album_artist,
            album=self.album,
            year=self.year,
            length=self.length,
            publisher=self.publisher,
            genres=[TrackGenreDB(parent_type="music_file", genre=g) for g in self.genres],
            missing=self.missing,
            rating=self.rating,
            exact_release_date=self.exact_release_date,
            release_year=self.release_year,
            size=self.size,
            track_number=self.track_number,
            disc_number=self.disc_number,
            comments=self.comments,
        )

class AlbumTrack(MusicEntity):
    id: Optional[int] = None
    order: int
    linked_track: Optional[Union[MusicFile, RequestedTrack, "LastFMTrack"]] = None
    album_id: Optional[int] = None
    
    @classmethod
    def from_orm(cls, obj: AlbumTrackDB):
        this_track = None

        if obj.linked_track is not None:
            if obj.linked_track.entry_type == "music_file":
                this_track = MusicFile.from_orm(obj.linked_track)
            elif obj.linked_track.entry_type == "requested_track":
                this_track = RequestedTrack.from_orm(obj.linked_track)
            elif obj.linked_track.entry_type.startswith("lastfm"):
                this_track = LastFMTrack.from_orm(obj.linked_track)
            else:
                # default to requested
                this_track = RequestedTrack.from_orm(obj.linked_track)

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
            if obj["linked_track"].get("entry_type") == "music_file":
                this_track = MusicFile.from_json(obj["linked_track"])
            elif obj["linked_track"].get("entry_type") == "requested_track":
                this_track = RequestedTrack.from_json(obj["linked_track"])
            elif obj["linked_track"].get("entry_type").startswith("lastfm"):
                this_track = LastFMTrack.from_json(obj["linked_track"])
            else:
                # default to requested
                this_track = RequestedTrack.from_json(obj["linked_track"])

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


class Album(MusicEntity):
    id: Optional[int] =  None
    title: str
    artist: str
    year: Optional[str] = None
    publisher: Optional[str] = None
    tracks: Optional[List[AlbumTrack]] = None
    art_url: Optional[str] = None
    last_fm_url: Optional[str] = None
    mbid: Optional[str] = None

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
            mbid=obj.mbid
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
        }

class PlaylistBase(BaseModel):
    id: Optional[int] = None
    name: str
    updated_at: Optional[datetime] = None
    pinned: Optional[bool] = False
    pinned_order: Optional[int] = None

class PlaylistEntryStub(BaseModel):
    id: Optional[int] = None
    db_order: Optional[int] = None
    order: Optional[int] = None
    date_added: Optional[datetime] = None

class PlaylistEntryBase(PlaylistEntryStub, ABC):
    image_url: Optional[str] = None

    @abstractmethod
    def to_playlist(self, playlist_id):
        raise NotImplementedError

class MusicFileEntry(PlaylistEntryBase):
    entry_type: Literal["music_file"]
    music_file_id: int
    details: Optional[MusicFile] = None

    def to_playlist(self, playlist_id, order=None) -> MusicFileEntryDB:
        return MusicFileEntryDB(
            order=order,
            playlist_id=playlist_id,
            entry_type=self.entry_type,
            music_file_id=self.music_file_id,
            date_added = self.date_added or datetime.now()
        )

    def to_db(self) -> MusicFileDB:
        return MusicFileDB(
            id=self.music_file_id,
            path=self.details.path,
            kind=self.details.kind,
            last_scanned=self.details.last_scanned,
        )

    @classmethod
    def from_orm(cls, obj: MusicFileEntryDB, details: bool = False):
        return cls(
            entry_type="music_file",
            id=obj.id,
            order=obj.order,
            music_file_id=obj.music_file_id,
            date_added=obj.date_added,
            details=MusicFile.from_orm(obj.details) if (details and obj.details is not None) else None,
        )


class NestedPlaylistEntry(PlaylistEntryBase):
    entry_type: Literal["nested_playlist"]
    playlist_id: int
    details: Optional[PlaylistBase] = None

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
        )


class LastFMTrack(MusicEntity, TrackDetails):
    url: str
    music_file_id: Optional[int] = None  # linked music file if available
    entry_type: Literal["lastfm_track"] = "lastfm_track"

    @classmethod
    def from_json(cls, obj: dict):
        return cls(
            id=obj.get("id"),
            title=obj.get("title"),
            artist=obj.get("artist"),
            album_artist=obj.get("album_artist"),
            album=obj.get("album"),
            year=obj.get("year"),
            length=obj.get("length"),
            publisher=obj.get("publisher"),
            url=obj.get("url"),
            music_file_id=obj.get("music_file_id"),
        )

    def to_json(self) -> dict:
        return {
            "entry_type": "lastfm_track",
            "title": self.title,
            "artist": self.artist,
            "album": self.album,
            "url": self.url,
            "music_file_id": self.music_file_id,
        }

    def to_db(self) -> LastFMTrackDB:
        return LastFMTrackDB(
            url=self.url,
            title=self.title,
            artist=self.artist,
            album_artist=self.album_artist,
            album=self.album,
            year=self.year,
            length=self.length,
            publisher=self.publisher,
        )
    
    @classmethod
    def from_orm(cls, obj: LastFMTrackDB):
        return cls(
            id=obj.id,
            url=obj.url,
            title=obj.title,
            artist=obj.artist,
            album=obj.album,
            year=obj.year,
            length=obj.length,
            publisher=obj.publisher,
            genres=[],
        )


class LastFMEntry(PlaylistEntryBase):
    entry_type: Literal["lastfm"]
    lastfm_track_id: Optional[int] = None
    details: Optional[LastFMTrack] = None

    def to_playlist(self, playlist_id, order=None) -> LastFMEntryDB:
        return LastFMEntryDB(
            order=order,
            playlist_id=playlist_id,
            entry_type=self.entry_type,
            lastfm_track_id=self.lastfm_track_id,
            date_added = self.date_added or datetime.now()
        )

    def to_db(self) -> LastFMTrackDB:
        return LastFMTrackDB(
            url=self.details.url,
            title=self.details.title,
            artist=self.details.artist,
            album_artist=self.details.album_artist,
            album=self.details.album,
            year=self.details.year,
            length=self.details.length,
            publisher=self.details.publisher,
        )

    @classmethod
    def from_orm(cls, obj: LastFMEntryDB, details: bool = False):
        return cls(
            entry_type="lastfm",
            id=obj.id,
            order=obj.order,
            date_added=obj.date_added,
            details=LastFMTrack(
                url=obj.details.url,
                title=obj.details.title,
                artist=obj.details.artist,
                album=obj.details.album,
                genres=[],
            ) if details and obj.details else None,
        )


class RequestedTrackEntry(PlaylistEntryBase):
    entry_type: Literal["requested"]
    requested_track_id: Optional[int] = None
    details: Optional[TrackDetails] = None

    def to_playlist(self, playlist_id, order=None) -> RequestedTrackEntryDB:
        return RequestedTrackEntryDB(
            order=order,
            playlist_id=playlist_id,
            entry_type=self.entry_type,
            requested_track_id=self.requested_track_id,
            date_added = self.date_added or datetime.now()
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

    @classmethod
    def from_orm(cls, obj: RequestedTrackEntryDB, details: bool = False):
        if not details or obj.details is None:
            return cls(entry_type="requested", id=obj.id, order=obj.order)
        return cls(
            id=obj.id,
            order=obj.order,
            entry_type="requested",
            date_added=obj.date_added,
            details=TrackDetails(
                title=obj.details.title,
                artist=obj.details.artist,
                album_artist=obj.details.album_artist,
                album=obj.details.album,
                year=obj.details.year,
                length=obj.details.length,
                publisher=obj.details.publisher,
                genres=[],
            ),
        )

class AlbumEntry(PlaylistEntryBase):
    entry_type: Literal["album"]
    album_id: Optional[int] = None
    details: Optional[Album] = None

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
            details=Album(
                title=obj.details.title,
                artist=obj.details.artist,
                year=obj.details.year,
                publisher=obj.details.publisher,
                tracks=[AlbumTrack.from_orm(t) for t in obj.details.tracks],
            ) if details and obj.details else None,
        )

class RequestedAlbumEntry(PlaylistEntryBase):
    entry_type: Literal["requested_album"]
    details: Optional[Album] = None
    requested_album_id: Optional[int] = None

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

PlaylistEntry = Union[MusicFileEntry, NestedPlaylistEntry, LastFMEntry, RequestedTrackEntry, AlbumEntry, RequestedAlbumEntry]

class Playlist(PlaylistBase):
    entries: List[PlaylistEntry] = [Field(discriminator="entry_type")]

    @classmethod
    def from_orm(cls, obj: PlaylistDB, details: bool = False):
        entries = []
        for entry in obj.entries:
            if entry.entry_type == "music_file":
                entries.append(MusicFileEntry.from_orm(entry, details))
            elif entry.entry_type == "nested_playlist":
                entries.append(NestedPlaylistEntry.from_orm(entry, details))
            elif entry.entry_type == "lastfm":
                entries.append(LastFMEntry.from_orm(entry, details))
            elif entry.entry_type == "requested":
                entries.append(RequestedTrackEntry.from_orm(entry, details))
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

class ReplaceTrackRequest(BaseModel):
    existing_track_id: int
    new_track: Optional[PlaylistEntry] = None

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