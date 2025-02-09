from .base import BaseRepository
from models import (
    PlaylistDB,
    PlaylistEntryDB,
    LastFMEntryDB,
    LastFMTrackDB,
    MusicFileEntryDB,
    RequestedTrackEntryDB,
)
from response_models import (
    Playlist,
    PlaylistEntryBase,
    MusicFileEntry,
    NestedPlaylistEntry,
    LastFMEntry,
    RequestedTrackEntry,
)
from sqlalchemy.orm import joinedload
from typing import List, Optional
import os
import dotenv
dotenv.load_dotenv(override=True)


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

class AlbumAndArtist:
    def __init__(self, album, artist):
        self.album = album
        self.artist = artist

    def __str__(self):
        return f"{self.artist} - {self.album}"

    def __repr__(self):
        return f"{self.artist} - {self.album}"

    def __eq__(self, other):
        return self.album == other.album and self.artist == other.artist

    def __hash__(self):
        return hash((self.album, self.artist))

class PlaylistRepository(BaseRepository[PlaylistDB]):
    def __init__(self, session):
        super().__init__(session, PlaylistDB)

    def get_with_entries(self, playlist_id: int, requests_session=None) -> Optional[Playlist]:
        result = (
            self.session.query(self.model)
            .options(
                joinedload(self.model.entries),
                joinedload(PlaylistDB.entries.of_type(LastFMEntryDB)).joinedload(
                    LastFMEntryDB.details
                ),
                joinedload(PlaylistDB.entries.of_type(MusicFileEntryDB)).joinedload(
                    MusicFileEntryDB.details
                ),
                joinedload(
                    PlaylistDB.entries.of_type(RequestedTrackEntryDB)
                ).joinedload(RequestedTrackEntryDB.details),
            )
            .filter(self.model.id == playlist_id)
            .first()
        )

        if result is None:
            return None

        entries = [playlist_orm_to_response(e) for e in result.entries]

        if (requests_session is not None) and (os.getenv("LASTFM_API_KEY") is not None):
            unique_album_and_artist_pairs = set()
            for entry in entries:
                if entry.details.album is not None and entry.details.artist is not None:
                    unique_album_and_artist_pairs.add(AlbumAndArtist(entry.details.album, entry.details.artist))

            for album_and_artist in unique_album_and_artist_pairs:
                url = f"http://ws.audioscrobbler.com/2.0/?method=album.getinfo&api_key={os.getenv('LASTFM_API_KEY')}&artist={album_and_artist.artist}&album={album_and_artist.album}&format=json"
                response = requests_session.get(url)
                if response.status_code == 200:
                    album_info = response.json()
                    if "album" in album_info:
                        album_info = album_info["album"]
                        for entry in entries:
                            if entry.details.album == album_info["name"] and entry.details.artist == album_info["artist"]:
                                entry.image_url = album_info["image"][2]["#text"]

        return Playlist(id=result.id, name=result.name, entries=entries)

    def get_all(self):
        results = self.session.query(self.model).all()

        return [Playlist(id=r.id, name=r.name, entries=[]) for r in results]

    def create(self, playlist: Playlist):
        playlist_db = PlaylistDB(name=playlist.name, entries=[])
        self.session.add(playlist_db)
        self.session.commit()

        for entry in playlist.entries:
            self.add_entry(playlist_db.id, entry)

        self.session.commit()
        self.session.refresh(playlist_db)
        return Playlist.from_orm(playlist_db)

    def add_entry(self, playlist_id: int, entry: PlaylistEntryBase) -> Playlist:
        if entry.entry_type == "lastfm":
            track = (
                self.session.query(LastFMTrackDB)
                .filter(LastFMTrackDB.url == entry.url)
                .first()
            )
            if not track:
                track = entry.to_db()
                self.session.add(track)
                self.session.commit()

            entry.details = track

        this_playlist = (
            self.session.query(PlaylistDB).filter(PlaylistDB.id == playlist_id).first()
        )
        playlist_entry = entry.to_playlist(playlist_id)
        this_playlist.entries.append(playlist_entry)
        self.session.commit()

        self.session.refresh(this_playlist)
        return Playlist.from_orm(this_playlist)

    def add_entries(
        self, playlist_id: int, entries: List[PlaylistEntryBase]
    ) -> Playlist:
        if not entries:
            return Playlist(id=playlist_id, name="", entries=[])

        for entry in entries:
            result = self.add_entry(playlist_id, entry)

        return self.get_with_entries(playlist_id)

    def replace_entries(
        self, playlist_id: int, entries: List[PlaylistEntryBase]
    ) -> Playlist:
        current_records = (
            self.session.query(PlaylistEntryDB)
            .filter(PlaylistEntryDB.playlist_id == playlist_id)
            .all()
        )
        for record in current_records:
            self.session.delete(record)
        self.session.commit()

        return self.add_entries(playlist_id, entries)

    def export_to_m3u(self, playlist_id: int, mapping_source = None, mapping_target = None):
        playlist = self.get_with_entries(playlist_id)
        if playlist is None:
            return None

        #m3u = "#EXTM3U\n"
        m3u = ""
        for entry in playlist.entries:
            if entry.entry_type == "music_file":
                #m3u += f"#EXTINF:{entry.details.length},{entry.details.artist} - {entry.details.title}\n"
                path = entry.details.path.replace(mapping_source, mapping_target)
                m3u += path + "\n"
            else:
                continue

        return m3u