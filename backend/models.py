from __future__ import annotations
from sqlalchemy import Column, Integer, String, DateTime, JSON, ForeignKey, Enum, Text
from sqlalchemy.orm import relationship, declarative_base, declared_attr, Mapped, mapped_column
from typing import List, Optional

Base = declarative_base()

class TrackDetailsMixin:
    """Mixin for track metadata"""
    @declared_attr
    def title(cls) -> Mapped[Optional[str]]:
        return mapped_column(String, index=True, nullable=True)

    @declared_attr
    def artist(cls) -> Mapped[Optional[str]]:
        return mapped_column(String, index=True, nullable=True)

    @declared_attr
    def album_artist(cls) -> Mapped[Optional[str]]:
        return mapped_column(String, index=True, nullable=True)

    @declared_attr
    def album(cls) -> Mapped[Optional[str]]:
        return mapped_column(String, index=True, nullable=True)

    @declared_attr
    def year(cls) -> Mapped[Optional[str]]:
        return mapped_column(String, index=True, nullable=True)

    @declared_attr
    def length(cls) -> Mapped[Optional[int]]:
        return mapped_column(Integer, index=True, nullable=True)

    @declared_attr
    def publisher(cls) -> Mapped[Optional[str]]:
        return mapped_column(String, index=True, nullable=True)

class BaseNode(Base):
    __tablename__ = "base_elements"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

class TrackGenre(Base):
    __tablename__ = "track_genres"
    id = Column(Integer, primary_key=True, index=True)
    parent_type = Column(String(50), nullable=False)
    music_file_id = Column(Integer, ForeignKey("music_files.id"), nullable=True)
    lastfm_track_id = Column(Integer, ForeignKey("lastfm_tracks.id"), nullable=True)
    requested_track_id = Column(Integer, ForeignKey("requested_tracks.id"), nullable=True)
    genre = Column(String, index=True)

class MusicFileDB(BaseNode, TrackDetailsMixin):
    __tablename__ = "music_files"
    id = Column(Integer, ForeignKey("base_elements.id"), primary_key=True)
    path = Column(String, index=True)
    kind = Column(String, index=True)
    last_scanned = Column(DateTime, index=True)
    genres = relationship(
        "TrackGenre",
        primaryjoin="and_(TrackGenre.music_file_id==MusicFileDB.id, TrackGenre.parent_type=='music_file')",
        cascade="all, delete-orphan"
    )

class LastFMTrackDB(BaseNode, TrackDetailsMixin):
    __tablename__ = "lastfm_tracks"
    id = Column(Integer, ForeignKey("base_elements.id"), primary_key=True)
    url = Column(String, unique=True, index=True)
    genres = relationship(
        "TrackGenre",
        primaryjoin="and_(TrackGenre.lastfm_track_id==LastFMTrackDB.id, TrackGenre.parent_type=='lastfm')",
        cascade="all, delete-orphan"
    )

class NestedPlaylistDB(BaseNode):
    __tablename__ = "nested_playlists"
    id = Column(Integer, ForeignKey("base_elements.id"), primary_key=True)
    playlist_id = Column(Integer, ForeignKey('playlists.id'))

class RequestedTrackDB(BaseNode, TrackDetailsMixin):
    __tablename__ = "requested_tracks"
    id = Column(Integer, ForeignKey("base_elements.id"), primary_key=True)
    genres = relationship(
        "TrackGenre",
        primaryjoin="and_(TrackGenre.requested_track_id==RequestedTrackDB.id, TrackGenre.parent_type=='requested')",
        cascade="all, delete-orphan"
    )

class PlaylistDB(Base):
    __tablename__ = "playlists"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    entries = relationship("PlaylistEntryDB", back_populates="playlist", order_by="PlaylistEntryDB.order")

class PlaylistEntryDB(Base):
    __tablename__ = 'playlist_entries'
    id = Column(Integer, primary_key=True, index=True)
    entry_type = Column(String(50), nullable=False)
    order = Column(Integer)
    details = None
    
    # Foreign keys for different entry types
    music_file_id = Column(Integer, ForeignKey('music_files.id'), nullable=True)
    lastfm_track_url = Column(String, ForeignKey('lastfm_tracks.id'), nullable=True)
    nested_playlist_id = Column(Integer, ForeignKey('nested_playlists.id'), nullable=True)
    requested_track_id = Column(Integer, ForeignKey('requested_tracks.id'), nullable=True)

    playlist_id = Column(Integer, ForeignKey('playlists.id', ondelete="CASCADE"))
    playlist = relationship("PlaylistDB", back_populates="entries")

    music_file = relationship("MusicFileDB", foreign_keys=[music_file_id])
    nested_playlist = relationship("NestedPlaylistDB", foreign_keys=[nested_playlist_id])
    lastfm_track = relationship("LastFMTrackDB", foreign_keys=[lastfm_track_url])
    requested_track = relationship("RequestedTrackDB", foreign_keys=[requested_track_id])

    __mapper_args__ = {
        'polymorphic_on': entry_type,
        'polymorphic_identity': 'entry'
    }

class MusicFileEntryDB(PlaylistEntryDB):
    __tablename__ = 'music_file_entries'
    
    id = Column(Integer, ForeignKey('playlist_entries.id'), primary_key=True)
    music_file_id = Column(Integer, ForeignKey('music_files.id'))
    details = relationship("MusicFileDB")
    
    __mapper_args__ = {
        'polymorphic_identity': 'music_file'
    }

class NestedPlaylistEntryDB(PlaylistEntryDB):
    __tablename__ = 'nested_playlist_entries'
    
    id = Column(Integer, ForeignKey('playlist_entries.id'), primary_key=True)
    nested_playlist_id = Column(Integer, ForeignKey('playlists.id'))
    details = relationship("PlaylistDB")
    
    __mapper_args__ = {
        'polymorphic_identity': 'nested_playlist'
    }

class LastFMEntryDB(PlaylistEntryDB):
    __tablename__ = 'lastfm_entries'
    
    __mapper_args__ = {
        'polymorphic_identity': "lastfm"
    }

    id = Column(Integer, ForeignKey('playlist_entries.id'), primary_key=True)
    lastfm_track_id = Column(Integer, ForeignKey('lastfm_tracks.id'))
    details = relationship("LastFMTrackDB")

class RequestedTrackEntryDB(PlaylistEntryDB):
    __tablename__ = 'requested_entries'
    
    id = Column(Integer, ForeignKey('playlist_entries.id'), primary_key=True)
    requested_track_id = Column(Integer, ForeignKey('requested_tracks.id'))
    details = relationship("RequestedTrackDB")
    
    __mapper_args__ = {
        'polymorphic_identity': 'requested'
    }