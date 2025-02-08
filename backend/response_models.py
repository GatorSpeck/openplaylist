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
)
from abc import ABC, abstractmethod


class TrackDetails(BaseModel):
    title: Optional[str] = None
    artist: Optional[str] = None
    album_artist: Optional[str] = None
    album: Optional[str] = None
    year: Optional[str] = None
    length: Optional[int] = None
    publisher: Optional[str] = None
    genres: List[str] = []

class MusicEntity(BaseModel):
    id: Optional[int] = None

class RequestedTrack(MusicEntity, TrackDetails):
    missing: Optional[bool] = False  # True if the track was previously scanned and is now missing from the library

    @classmethod
    def from_orm(cls, obj: RequestedTrackDB):
        return cls(
            id=obj.id,
            title=obj.title,
            artist=obj.artist,
            album=obj.album,
        )


class MusicFile(MusicEntity, TrackDetails):
    path: str
    kind: Optional[str] = None
    last_scanned: Optional[datetime] = None
    missing: Optional[bool] = False  # True if the track was previously scanned and is now missing from the index

    @classmethod
    def from_orm(cls, obj: MusicFileDB):
        return cls(
            id=obj.id,
            path=obj.path,
            kind=obj.kind,
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
        )


class PlaylistBase(BaseModel):
    id: Optional[int] = None
    name: str


class PlaylistEntryBase(BaseModel, ABC):
    id: Optional[int] = None
    order: int

    @abstractmethod
    def to_playlist(self, playlist_id):
        raise NotImplementedError


class MusicFileEntry(PlaylistEntryBase):
    entry_type: Literal["music_file"]
    music_file_id: int
    details: Optional[MusicFile] = None

    def to_playlist(self, playlist_id) -> MusicFileEntryDB:
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
            entry_type="music_file",
            id=obj.id,
            order=obj.order,
            music_file_id=obj.music_file_id,
            details=MusicFile(
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
                genres=[str(s.genre) for s in obj.details.genres],
                missing=obj.details.missing,
            ) if obj.details is not None else None,
        )


class NestedPlaylistEntry(PlaylistEntryBase):
    entry_type: Literal["nested_playlist"]
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

    @classmethod
    def from_orm(cls, obj: NestedPlaylistEntryDB):
        return cls(
            entry_type="nested_playlist",
            id=obj.id,
            order=obj.order,
            playlist_id=obj.playlist_id,
            details=Playlist(id=obj.details.id, name=obj.details.name, entries=[]),
        )


class LastFMTrack(MusicEntity, TrackDetails):
    url: str


class LastFMEntry(PlaylistEntryBase):
    entry_type: Literal["lastfm"]
    url: str
    details: Optional[LastFMTrack] = None

    def to_playlist(self, playlist_id) -> LastFMEntryDB:
        return LastFMEntryDB(
            playlist_id=playlist_id,
            entry_type=self.entry_type,
            order=self.order,
            lastfm_track_id=self.url,
            details=self.details,
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
            entry_type="lastfm",
            id=obj.id,
            order=obj.order,
            url=obj.details.url,
            details=LastFMTrack(
                url=obj.details.url,
                title=obj.details.title,
                artist=obj.details.artist,
                album=obj.details.album,
                genres=[],
            ),
        )


class RequestedTrackEntry(PlaylistEntryBase):
    entry_type: Literal["requested"]
    details: Optional[TrackDetails] = None

    def to_playlist(self, playlist_id) -> RequestedTrackEntryDB:
        print("bar")
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

    @classmethod
    def from_orm(cls, obj: RequestedTrackEntryDB):
        print(obj.__dict__)
        return cls(
            id=obj.id,
            order=obj.order,
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


class Playlist(PlaylistBase):
    entries: List[
        Union[MusicFileEntry, NestedPlaylistEntry, LastFMEntry, RequestedTrackEntry]
    ] = [Field(discriminator="entry_type")]

    @classmethod
    def from_orm(cls, obj: PlaylistDB):
        entries = []
        for entry in obj.entries:
            if entry.entry_type == "music_file":
                entries.append(MusicFileEntry.from_orm(entry))
            elif entry.entry_type == "nested_playlist":
                entries.append(NestedPlaylistEntry.from_orm(entry))
            elif entry.entry_type == "lastfm":
                entries.append(LastFMEntry.from_orm(entry))
            elif entry.entry_type == "requested":
                entries.append(RequestedTrackEntry.from_orm(entry))
            else:
                raise ValueError(f"Unknown entry type: {entry.entry_type}")

        return cls(id=obj.id, name=obj.name, entries=entries)


class SearchQuery(BaseModel):
    full_search: Optional[str] = None  # title, artist, and album are scored
    album: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    limit: Optional[int] = 50

class ScanResults(BaseModel):
    files_scanned: int
    files_indexed: int
    new_files_added: int
    files_updated: int
    files_missing: int

class LibraryStats(BaseModel):
    trackCount: int
    albumCount: int
    artistCount: int
    totalLength: int
    missingTracks: int

class AlterPlaylistDetails(BaseModel):
    new_name: Optional[str]
    description: Optional[str]