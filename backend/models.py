from __future__ import annotations
from sqlalchemy import Column, Integer, String, DateTime, JSON, ForeignKey, Enum, Text, Boolean, Index, func
from sqlalchemy.orm import (
    relationship,
    declarative_base,
    declared_attr,
    Mapped,
    mapped_column,
)
from typing import List, Optional
from sqlalchemy.ext.orderinglist import ordering_list

Base = declarative_base()


class TrackDetailsMixin:
    """Mixin for track metadata"""

    @declared_attr
    def title(cls) -> Mapped[Optional[str]]:
        return mapped_column(String(1024), index=True, nullable=True)

    @declared_attr
    def artist(cls) -> Mapped[Optional[str]]:
        return mapped_column(String(1024), index=True, nullable=True)

    @declared_attr
    def album_artist(cls) -> Mapped[Optional[str]]:
        return mapped_column(String(1024), index=True, nullable=True)

    @declared_attr
    def album(cls) -> Mapped[Optional[str]]:
        return mapped_column(String(1024), index=True, nullable=True)

    @declared_attr
    def year(cls) -> Mapped[Optional[str]]:
        """Track metadata year field as string"""
        return mapped_column(String(32), index=True, nullable=True)
    
    @declared_attr
    def exact_release_date(cls) -> Mapped[Optional[DateTime]]:
        """Derived from year, if exists"""
        return mapped_column(DateTime, index=True, nullable=True)
    
    @declared_attr
    def release_year(cls) -> Mapped[Optional[int]]:
        """Derived from year, if exists"""
        return mapped_column(Integer, index=True, nullable=True)

    @declared_attr
    def length(cls) -> Mapped[Optional[int]]:
        """Length of the track in seconds"""
        return mapped_column(Integer, index=True, nullable=True)

    @declared_attr
    def publisher(cls) -> Mapped[Optional[str]]:
        """Record label"""
        return mapped_column(String(255), index=True, nullable=True)
    
    @declared_attr
    def rating(cls) -> Mapped[Optional[int]]:
        """Rating out of 100"""
        return mapped_column(Integer, index=True, nullable=True)
    
    @declared_attr
    def notes(cls) -> Mapped[Optional[str]]:
        """User notes"""
        return mapped_column(Text(1024), nullable=True)
    
    @declared_attr
    def comments(cls) -> Mapped[Optional[str]]:
        """Comments on track file"""
        return mapped_column(Text(1024), nullable=True)

    @declared_attr
    def disc_number(cls) -> Mapped[Optional[int]]:
        """Disc number"""
        return mapped_column(Integer, nullable=True)

    @declared_attr
    def track_number(cls) -> Mapped[Optional[int]]:
        """Track number"""
        return mapped_column(Integer, nullable=True)


class BaseNode(Base):
    __tablename__ = "base_elements"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    entry_type = Column(String(50))

    __mapper_args__ = {
        "polymorphic_identity": "base",
        "polymorphic_on": entry_type 
    }

class TrackGenreDB(Base):
    __tablename__ = "track_genres"
    id = Column(Integer, primary_key=True, index=True)
    parent_type = Column(String(50), nullable=False)
    music_file_id = Column(Integer, ForeignKey("music_files.id"), nullable=True)
    lastfm_track_id = Column(Integer, ForeignKey("lastfm_tracks.id"), nullable=True)
    requested_track_id = Column(
        Integer, ForeignKey("requested_tracks.id"), nullable=True
    )
    genre = Column(String(50), index=True)


class MusicFileDB(BaseNode, TrackDetailsMixin):
    __tablename__ = "music_files"
    id = Column(Integer, ForeignKey("base_elements.id"), primary_key=True)
    path = Column(String(1024), index=True)
    kind = Column(String(32), index=True)
    first_scanned = Column(DateTime)
    last_scanned = Column(DateTime, index=True)
    size = Column(Integer)  # size in bytes
    genres = relationship(
        "TrackGenreDB",
        primaryjoin="and_(TrackGenreDB.music_file_id==MusicFileDB.id, TrackGenreDB.parent_type=='music_file')",
        cascade="all, delete-orphan",
    )
    missing = Column(Boolean, default=False)

    __mapper_args__ = {"polymorphic_identity": "music_file"}


class LastFMTrackDB(BaseNode, TrackDetailsMixin):
    __tablename__ = "lastfm_tracks"
    id = Column(Integer, ForeignKey("base_elements.id"), primary_key=True)
    url = Column(String(1024), index=True)
    genres = relationship(
        "TrackGenreDB",
        primaryjoin="and_(TrackGenreDB.lastfm_track_id==LastFMTrackDB.id, TrackGenreDB.parent_type=='lastfm')",
        cascade="all, delete-orphan",
    )

    __mapper_args__ = {"polymorphic_identity": "lastfm_track"}


class NestedPlaylistDB(BaseNode):
    __tablename__ = "nested_playlists"
    id = Column(Integer, ForeignKey("base_elements.id"), primary_key=True)
    playlist_id = Column(Integer, ForeignKey("playlists.id"))

    __mapper_args__ = {"polymorphic_identity": "nested_playlist"}

class AlbumDB(BaseNode):
    __tablename__ = "albums"
    id = Column(Integer, ForeignKey("base_elements.id"), primary_key=True)
    title = Column(String(1024), index=True)
    artist = Column(String(1024), index=True)
    year = Column(String(32), index=True)
    tracks: Mapped[List[AlbumTrackDB]] = relationship(
        order_by="AlbumTrackDB.order",
        collection_class=ordering_list("order"),
        foreign_keys="AlbumTrackDB.album_id",
    )
    art_url = Column(String(1024), nullable=True)
    publisher = Column(String(255), index=True)
    last_fm_url = Column(String(1024), nullable=True)  # last.fm url

    __mapper_args__ = {"polymorphic_identity": "album"}

class AlbumTrackDB(BaseNode, TrackDetailsMixin):
    __tablename__ = "album_tracks"
    id = Column(Integer, ForeignKey("base_elements.id"), primary_key=True)

    linked_track_id = Column(Integer, ForeignKey("base_elements.id"), nullable=True)
    linked_track = relationship("BaseNode", foreign_keys=[linked_track_id])

    order = Column(Integer, index=True)
    album_id = Column(Integer, ForeignKey("albums.id"), nullable=False)

    __mapper_args__ = {
        "inherit_condition": id == BaseNode.id,
        "polymorphic_identity": "album_track",
    }

class RequestedTrackDB(BaseNode, TrackDetailsMixin):
    __tablename__ = "requested_tracks"
    id = Column(Integer, ForeignKey("base_elements.id"), primary_key=True)
    genres = relationship(
        "TrackGenreDB",
        primaryjoin="and_(TrackGenreDB.requested_track_id==RequestedTrackDB.id, TrackGenreDB.parent_type=='requested')",
        cascade="all, delete-orphan",
    )

    __mapper_args__ = {"polymorphic_identity": "requested_track"}


class PlaylistDB(Base):
    __tablename__ = "playlists"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(1024), unique=True, index=True)
    updated_at = Column(DateTime, index=True, onupdate=func.now())
    pinned = Column(Boolean, default=False)
    pinned_order = Column(Integer, index=True)

    entries: Mapped[List["PlaylistEntryDB"]] = relationship(
        order_by="PlaylistEntryDB.order",
        back_populates="playlist",
        passive_deletes=True,
        single_parent=True,
        cascade="all, delete-orphan",
    )

class PlaylistEntryDB(Base):
    __tablename__ = "playlist_entries"
    id = Column(Integer, primary_key=True)
    entry_type = Column(String(50), nullable=False, index=True)
    order = Column(Integer, index=True)

    date_added = Column(DateTime)  # date added to playlist

    playlist_id: Mapped[int] = mapped_column(ForeignKey("playlists.id"), index=True)
    playlist: Mapped["PlaylistDB"] = relationship("PlaylistDB", back_populates="entries")
    
    details_id = Column(Integer, ForeignKey("base_elements.id"), nullable=True)
    details = relationship("BaseNode", foreign_keys=[details_id])

    __mapper_args__ = {"polymorphic_on": entry_type, "polymorphic_identity": "entry"}

Index("playlist_entries_playlist_idx", PlaylistEntryDB.playlist_id)

# Add a composite index on playlist entries table
Index("playlist_entries_playlist_type_order_idx", 
      PlaylistEntryDB.playlist_id, 
      PlaylistEntryDB.entry_type, 
      PlaylistEntryDB.order)

class MusicFileEntryDB(PlaylistEntryDB):
    __tablename__ = "music_file_entries"

    id = Column(Integer, ForeignKey("playlist_entries.id", ondelete="CASCADE"), primary_key=True)
    
    music_file_id = Column(Integer, ForeignKey("music_files.id", ondelete="SET NULL"))
    details = relationship("MusicFileDB", foreign_keys=[music_file_id], passive_deletes=True)

    __mapper_args__ = {"polymorphic_identity": "music_file"}

Index("music_file_entry_details_idx", MusicFileEntryDB.details_id)

class NestedPlaylistEntryDB(PlaylistEntryDB):
    __tablename__ = "nested_playlist_entries"

    id = Column(Integer, ForeignKey("playlist_entries.id", ondelete="CASCADE"), primary_key=True)

    nested_playlist_id = Column(Integer, ForeignKey("nested_playlists.id", ondelete="SET NULL"))
    details = relationship("NestedPlaylistDB", foreign_keys=[nested_playlist_id], passive_deletes=True)

    __mapper_args__ = {"polymorphic_identity": "nested_playlist"}


class LastFMEntryDB(PlaylistEntryDB):
    __tablename__ = "lastfm_entries"

    __mapper_args__ = {"polymorphic_identity": "lastfm"}

    id = Column(Integer, ForeignKey("playlist_entries.id", ondelete="CASCADE"), primary_key=True)
    lastfm_track_id = Column(Integer, ForeignKey("lastfm_tracks.id", ondelete="SET NULL"))
    details = relationship("LastFMTrackDB", foreign_keys=[lastfm_track_id], passive_deletes=True)


class RequestedTrackEntryDB(PlaylistEntryDB):
    __tablename__ = "requested_entries"

    id = Column(Integer, ForeignKey("playlist_entries.id", ondelete="CASCADE"), primary_key=True)
    
    requested_track_id = Column(Integer, ForeignKey("requested_tracks.id", ondelete="SET NULL"))
    details = relationship("RequestedTrackDB", foreign_keys=[requested_track_id], passive_deletes=True)

    __mapper_args__ = {"polymorphic_identity": "requested"}

class AlbumEntryDB(PlaylistEntryDB):
    __tablename__ = "album_entries"

    id = Column(Integer, ForeignKey("playlist_entries.id", ondelete="CASCADE"), primary_key=True)

    album_id = Column(Integer, ForeignKey("albums.id", ondelete="SET NULL"))
    details = relationship("AlbumDB", foreign_keys=[album_id], passive_deletes=True)

    __mapper_args__ = {"polymorphic_identity": "album"}

class RequestedAlbumEntryDB(PlaylistEntryDB):
    __tablename__ = "requested_album_entries"

    id = Column(Integer, ForeignKey("playlist_entries.id", ondelete="CASCADE"), primary_key=True)

    album_id = Column(Integer, ForeignKey("albums.id", ondelete="SET NULL"))
    details = relationship("AlbumDB", foreign_keys=[album_id], passive_deletes=True)

    __mapper_args__ = {"polymorphic_identity": "requested_album"}
