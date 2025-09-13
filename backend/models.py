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
from datetime import datetime, timezone

Base = declarative_base()

class ExternalDetailMixin:
    @declared_attr
    def last_fm_url(cls) -> Mapped[Optional[str]]:
        """URL to the track on last.fm"""
        return mapped_column(String(1024), nullable=True)

    @declared_attr
    def spotify_uri(cls) -> Mapped[Optional[str]]:
        """Spotify URI for the track"""
        return mapped_column(String(1024), nullable=True)
    
    @declared_attr
    def youtube_url(cls) -> Mapped[Optional[str]]:
        """YouTube URL for the track"""
        return mapped_column(String(1024), nullable=True)
    
    @declared_attr
    def mbid(cls) -> Mapped[Optional[str]]:
        """MusicBrainz ID for the track"""
        return mapped_column(String(50), nullable=True)
    
    @declared_attr
    def plex_rating_key(cls) -> Mapped[Optional[str]]:
        """Primary key for Plex"""
        return mapped_column(String(1024), nullable=True)

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
    
    def get_artist(self) -> Optional[str]:
        """Get the artist name, falling back to album artist if not set"""
        return self.artist or self.album_artist or None

    def get_album_artist(self) -> Optional[str]:
        """Get the album artist name, falling back to artist if not set"""
        return self.album_artist or self.artist or None

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
    genre = Column(String(50), index=True)


class LocalFileDB(Base):
    """Represents a physical file on the local filesystem"""
    __tablename__ = "local_files"
    id = Column(Integer, primary_key=True, index=True)
    
    # Local file specific data
    path = Column(String(1024), index=True, unique=True)  # Make path unique
    kind = Column(String(32), index=True)  # File format (MP3, FLAC, etc.)
    first_scanned = Column(DateTime)
    last_scanned = Column(DateTime, index=True)
    size = Column(Integer)  # Size in bytes
    missing = Column(Boolean, default=False)
    
    # File-based metadata (what was read from the file tags)
    file_title = Column(String(1024), index=True, nullable=True)
    file_artist = Column(String(1024), index=True, nullable=True)
    file_album_artist = Column(String(1024), index=True, nullable=True)
    file_album = Column(String(1024), index=True, nullable=True)
    file_year = Column(String(32), index=True, nullable=True)
    file_length = Column(Integer, index=True, nullable=True)
    file_publisher = Column(String(255), index=True, nullable=True)
    file_rating = Column(Integer, index=True, nullable=True)
    file_comments = Column(Text(1024), nullable=True)
    file_disc_number = Column(Integer, nullable=True)
    file_track_number = Column(Integer, nullable=True)
    
    # Relationship back to MusicFileDB
    music_file_id = Column(Integer, ForeignKey("music_files.id"), nullable=True)
    music_file = relationship("MusicFileDB", back_populates="local_file")
    
    # File-based genres (one-to-many)
    file_genres = relationship(
        "LocalFileGenreDB",
        back_populates="local_file",
        cascade="all, delete-orphan"
    )

class LocalFileGenreDB(Base):
    """Represents genres read from local file tags"""
    __tablename__ = "local_file_genres"
    id = Column(Integer, primary_key=True, index=True)
    
    local_file_id = Column(Integer, ForeignKey("local_files.id"), nullable=False)
    genre = Column(String(50), index=True)
    
    local_file = relationship("LocalFileDB", back_populates="file_genres")

# Update MusicFileDB to add helper methods for working with file metadata
class MusicFileDB(BaseNode, TrackDetailsMixin, ExternalDetailMixin):
    __tablename__ = "music_files"
    id = Column(Integer, ForeignKey("base_elements.id"), primary_key=True)
    
    # Optional local file relationship (one-to-one)
    local_file = relationship(
        "LocalFileDB", 
        back_populates="music_file", 
        uselist=False,
        cascade="save-update, merge"  # Remove delete-orphan
    )

    genres = relationship(
        "TrackGenreDB",
        primaryjoin="and_(TrackGenreDB.music_file_id==MusicFileDB.id, TrackGenreDB.parent_type=='music_file')",
        cascade="all, delete-orphan",
    )

    __mapper_args__ = {"polymorphic_identity": "music_file"}
    
    # Helper properties for backward compatibility
    @property
    def path(self) -> Optional[str]:
        return self.local_file.path if self.local_file else None
    
    @property
    def kind(self) -> Optional[str]:
        return self.local_file.kind if self.local_file else None
    
    @property
    def size(self) -> Optional[int]:
        return self.local_file.size if self.local_file else None
    
    @property
    def missing(self) -> bool:
        return self.local_file.missing if self.local_file else False
    
    @property
    def first_scanned(self) -> Optional[datetime]:
        return self.local_file.first_scanned if self.local_file else None
    
    @property
    def last_scanned(self) -> Optional[datetime]:
        return self.local_file.last_scanned if self.local_file else None
    
    # Methods to work with file metadata
    def sync_from_file_metadata(self):
        """Copy metadata from the local file tags to the music file record"""
        if not self.local_file:
            return
            
        self.title = self.local_file.file_title
        self.artist = self.local_file.file_artist
        self.album_artist = self.local_file.file_album_artist
        self.album = self.local_file.file_album
        self.year = self.local_file.file_year
        self.length = self.local_file.file_length
        self.publisher = self.local_file.file_publisher
        self.rating = self.local_file.file_rating
        self.comments = self.local_file.file_comments
        self.disc_number = self.local_file.file_disc_number
        self.track_number = self.local_file.file_track_number

        # try to infer the exact release date
        if self.year:
            if len(self.year) > 4:
                try:
                    self.exact_release_date = datetime.strptime(self.year, "%Y-%m-%d")
                    self.release_year = self.exact_release_date.year
                except ValueError:
                    pass
            elif len(self.year) == 4:
                self.release_year = int(self.year)
        
        # Copy genres
        self.genres.clear()
        for file_genre in self.local_file.file_genres:
            self.genres.append(TrackGenreDB(
                parent_type="music_file",
                genre=file_genre.genre
            ))
    
    def get_file_metadata_differences(self) -> dict:
        """Compare current metadata with file metadata and return differences"""
        if not self.local_file:
            return {}
        
        differences = {}
        
        # Compare each field
        fields_to_compare = [
            ('title', 'file_title'),
            ('artist', 'file_artist'),
            ('album_artist', 'file_album_artist'),
            ('album', 'file_album'),
            ('year', 'file_year'),
            ('length', 'file_length'),
            ('publisher', 'file_publisher'),
            ('rating', 'file_rating'),
            ('comments', 'file_comments'),
            ('disc_number', 'file_disc_number'),
            ('track_number', 'file_track_number'),
        ]
        
        for current_field, file_field in fields_to_compare:
            current_value = getattr(self, current_field)
            file_value = getattr(self.local_file, file_field)
            
            if current_value != file_value:
                differences[current_field] = {
                    'current': current_value,
                    'file': file_value
                }
        
        # Compare genres
        current_genres = set(g.genre for g in self.genres)
        file_genres = set(g.genre for g in self.local_file.file_genres)
        
        if current_genres != file_genres:
            differences['genres'] = {
                'current': list(current_genres),
                'file': list(file_genres)
            }
        
        return differences

class NestedPlaylistDB(BaseNode):
    __tablename__ = "nested_playlists"
    id = Column(Integer, ForeignKey("base_elements.id"), primary_key=True)
    playlist_id = Column(Integer, ForeignKey("playlists.id"))

    __mapper_args__ = {"polymorphic_identity": "nested_playlist"}

class AlbumDB(BaseNode, ExternalDetailMixin):
    __tablename__ = "albums"
    id = Column(Integer, ForeignKey("base_elements.id"), primary_key=True)
    title = Column(String(1024), index=True)  # title of the album, all tracks should have this as their "album"
    artist = Column(String(1024), index=True)  # artist of the album, all tracks should have this as their "album artist"
    year = Column(String(32), nullable=True, index=True)

    tracks: Mapped[List[AlbumTrackDB]] = relationship(
        order_by="AlbumTrackDB.order",
        collection_class=ordering_list("order"),
        foreign_keys="AlbumTrackDB.album_id",
    )

    exact_release_date = Column(DateTime, index=True, nullable=True)

    art_url = Column(String(1024), nullable=True)  # URL to album art
    publisher = Column(String(255), index=True)  # record label

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

class PlaylistDB(Base):
    __tablename__ = "playlists"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(1024), unique=True, index=True)
    updated_at = Column(DateTime(), index=True, default=func.now(), onupdate=func.now())
    pinned = Column(Boolean, default=False)
    pinned_order = Column(Integer, index=True)

    entries: Mapped[List["PlaylistEntryDB"]] = relationship(
        order_by="PlaylistEntryDB.order",
        back_populates="playlist",
        passive_deletes=True,
        single_parent=True,
        cascade="all, delete-orphan",
    )
    sync_targets = relationship("SyncTargetDB", back_populates="playlist", cascade="all, delete-orphan")

class PlaylistEntryDB(Base):
    __tablename__ = "playlist_entries"
    id = Column(Integer, primary_key=True)
    entry_type = Column(String(50), nullable=False, index=True)
    order = Column(Integer, index=True)

    date_added = Column(DateTime)  # date added to playlist
    date_hidden = Column(DateTime, nullable=True)  # Add this field
    is_hidden = Column(Boolean, default=False, nullable=False, index=True)  # Add this field

    playlist_id: Mapped[int] = mapped_column(ForeignKey("playlists.id"), index=True)
    playlist: Mapped["PlaylistDB"] = relationship("PlaylistDB", back_populates="entries")

    notes = Column(Text, nullable=True)
    
    details_id = Column(Integer, ForeignKey("base_elements.id"), nullable=True)
    details = relationship(
        "BaseNode", 
        foreign_keys=[details_id],
        cascade="save-update, merge, expunge"
    )

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
    
    details = relationship(
        "MusicFileDB", 
        foreign_keys=[music_file_id], 
        passive_deletes=True,
        cascade="save-update, merge, expunge"
    )

    __mapper_args__ = {"polymorphic_identity": "music_file"}

Index("music_file_entry_details_idx", MusicFileEntryDB.details_id)

class NestedPlaylistEntryDB(PlaylistEntryDB):
    __tablename__ = "nested_playlist_entries"

    id = Column(Integer, ForeignKey("playlist_entries.id", ondelete="CASCADE"), primary_key=True)

    nested_playlist_id = Column(Integer, ForeignKey("nested_playlists.id", ondelete="SET NULL"))
    details = relationship("NestedPlaylistDB", foreign_keys=[nested_playlist_id], passive_deletes=True)

    __mapper_args__ = {"polymorphic_identity": "nested_playlist"}


class AlbumEntryDB(PlaylistEntryDB):
    __tablename__ = "album_entries"

    id = Column(Integer, ForeignKey("playlist_entries.id", ondelete="CASCADE"), primary_key=True)

    album_id = Column(Integer, ForeignKey("albums.id", ondelete="SET NULL"))
    details = relationship(
        "AlbumDB", 
        foreign_keys=[album_id], 
        passive_deletes=True,
        cascade="save-update, merge, expunge"
    )

    __mapper_args__ = {"polymorphic_identity": "album"}

class RequestedAlbumEntryDB(PlaylistEntryDB):
    __tablename__ = "requested_album_entries"

    id = Column(Integer, ForeignKey("playlist_entries.id", ondelete="CASCADE"), primary_key=True)

    album_id = Column(Integer, ForeignKey("albums.id", ondelete="SET NULL"))
    details = relationship(
        "AlbumDB",
        foreign_keys=[album_id],
        passive_deletes=True,
        cascade="save-update, merge, expunge"
    )

    __mapper_args__ = {"polymorphic_identity": "requested_album"}

class PlaylistSnapshot(Base):
    __tablename__ = "playlist_snapshots"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), index=True)
    contents = Column(JSON)
    last_updated = Column(DateTime, index=True)

class SyncTargetDB(Base):
    __tablename__ = "sync_targets"

    id = Column(Integer, primary_key=True, index=True)
    playlist_id = Column(Integer, ForeignKey("playlists.id", ondelete="CASCADE"), nullable=False)
    service = Column(String(50), nullable=False)  # 'plex', 'spotify', 'youtube'
    config = Column(Text, nullable=False)  # JSON string with service-specific config
    enabled = Column(Boolean, default=True)
    
    # Sync direction flags
    send_entry_adds = Column(Boolean, default=True)
    send_entry_removals = Column(Boolean, default=True)
    receive_entry_adds = Column(Boolean, default=True)
    receive_entry_removals = Column(Boolean, default=True)
    
    # Relationship
    playlist = relationship("PlaylistDB", back_populates="sync_targets")
