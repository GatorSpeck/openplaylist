from sqlalchemy import Column, Integer, String, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship, declarative_base

Base = declarative_base()

# SQLAlchemy model for a music file
class MusicFileDB(Base):
    __tablename__ = "music_files"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    path = Column(String, index=True)
    title = Column(String, index=True)
    artist = Column(String, index=True)
    album = Column(String, index=True)
    last_scanned = Column(DateTime, index=True)
    genres = Column(JSON, nullable=True)  # list of genres of the music file
    album_artist = Column(String, index=True)
    year = Column(String, index=True)
    length = Column(Integer, index=True)
    publisher = Column(String, index=True)
    kind = Column(String, index=True)

class PlaylistDB(Base):
    __tablename__ = "playlists"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, unique=True, index=True)
    entries = relationship("PlaylistEntryDB", back_populates="playlist")


# Association table for many-to-many relationship with an order field
class PlaylistEntryDB(Base):
    __tablename__ = 'playlist_music_file'
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    playlist_id = Column(Integer, ForeignKey('playlists.id'))
    music_file_id = Column(Integer, ForeignKey('music_files.id'))
    order = Column(Integer)

    music_file = relationship("MusicFileDB", back_populates="playlists")
    playlist = relationship("PlaylistDB", back_populates="entries")

MusicFileDB.playlists = relationship("PlaylistEntryDB", back_populates="music_file")