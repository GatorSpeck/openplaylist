import React, { useState, useEffect } from 'react';
import '../../styles/TrackDetailsModal.css';
import { formatDate, formatDuration, formatSize } from '../../lib/misc';
import { use } from 'react';
import playlistRepository from '../../repositories/PlaylistRepository';
import PlaylistEntry from '../lib/PlaylistEntry';

interface TrackDetailsModalProps {
  entry: PlaylistEntry; // Replace with the actual type of your entry
  onClose: () => void;
}

const TrackDetailsModal: React.FC<TrackDetailsModalProps> = ({ entry, onClose }) => {
  const [playlists, setPlaylists] = useState([]);
  if (!entry) return null;

  useEffect(() => {
    const fn = async () => {
      if (entry.entry_type !== "music_file") return;
      if (!entry.music_file_id) return;
      const result = await playlistRepository.getPlaylistsByTrack(entry.music_file_id);
      setPlaylists(result);
    }

    fn();
  }, [entry]);

  const dateAdded = entry.date_added ? formatDate(entry.date_added, 'MMMM Do YYYY, h:mm:ss a') : null;

  const releaseDate = (entry.year || entry.details.year) ? formatDate(entry.year || entry.details.year, 'MMMM Do YYYY') : null;

  const artistAndTitle = `${entry.getArtist()} ${entry.getTitle()}`;
  const artistAndAlbum = `${entry.getArtist()} ${entry.getAlbum()}`;
  const youtubeMusicSearchLink = `https://music.youtube.com/search?q=${encodeURIComponent(artistAndTitle)}`;
  const appleMusicSearchLink = `https://music.apple.com/search?term=${encodeURIComponent(artistAndTitle)}`;
  const spotifySearchLink = `https://open.spotify.com/search/${encodeURIComponent(artistAndTitle)}`;
  const discogsSearchLink = entry.getAlbum() ? `https://www.discogs.com/search/?q=${encodeURIComponent(artistAndAlbum)}` : null;
  const rateYourMusicSearchLink = entry.getAlbum() ? `https://rateyourmusic.com/search?searchtype=a&searchterm=${encodeURIComponent(entry.getAlbum())}&searchtype=l` : null;
  const lastFmSearchLink = entry.isAlbum() ? `https://www.last.fm/search/albums?q=${encodeURIComponent(artistAndTitle)}` : `https://www.last.fm/search/tracks?q=${encodeURIComponent(artistAndTitle)}`;

  const playlistsList = playlists.length > 0 ? (
    <div>
      <p><strong>Playlists:</strong></p>
      <ul>
        {playlists.map(playlist => (
          <li key={playlist.id}><a href={`/playlist/${playlist.name}`}>{playlist.name}</a></li>
        ))}
      </ul>
    </div>
  ) : null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Track Details</h2>
        <div className="track-details">
          <p><strong>ID:</strong> {entry.id}</p>
          <p><strong>Title:</strong> {entry.getTitle()}</p>
          {entry.details.artist ? <p><strong>Artist:</strong> {entry.details.artist}</p> : null}
          {entry.details.album_artist ? <p><strong>Album Artist:</strong> {entry.details.album_artist}</p> : null}
          {entry.getAlbum() ? <p><strong>Album:</strong> {entry.getAlbum()}</p> : null}
          {entry.details.disc_number ? <p><strong>Disc:</strong>{entry.details.disc_number}</p> : null}
          {entry.details.track_number ? <p><strong>Track:</strong>{entry.details.track_number}</p> : null}
          {entry.details.length ? <p><strong>Length:</strong> {formatDuration(entry.details.length)}</p> : null}
          {releaseDate ? <p><strong>Release Date:</strong> {releaseDate}</p> : null}
          {entry.details.genres.length ? <p><strong>Genres:</strong> {entry.details.genres.join(", ")}</p> : null}
          {entry.details.path ? (<p><strong>Path:</strong>
            {entry.details.missing ? <s>{entry.details.path}</s> : <span>{entry.details.path}</span>}
          </p>) : null}
          {entry.details.publisher ? <p><strong>Publisher:</strong> {entry.details.publisher}</p> : null}
          {entry.details.kind ? <p><strong>Kind:</strong> {entry.details.kind}</p> : null}
          {entry.details.url ? <p><strong>URL:</strong> <a href={entry.details.url}>{entry.details.url}</a></p> : null}
          {entry.details.last_fm_url ? <p><strong>Last.fm URL:</strong> <a href={entry.details.last_fm_url}>{entry.details.last_fm_url}</a></p> : null}
          {entry.details.notes ? <p><strong>Notes:</strong> {entry.details.notes}</p> : null}
          {entry.details.comments ? <p><strong>Comments:</strong> {entry.details.comments}</p> : null}
          {entry.details.size ? <p><strong>Size:</strong> {formatSize(entry.details.size)}</p> : null}
          {dateAdded ? <p><strong>Date Added to Playlist:</strong> {dateAdded}</p> : null}
          {entry.details.last_scanned ? <p><strong>Last Scanned:</strong> {formatDate(entry.details.last_scanned, 'MMMM Do YYYY, h:mm:ss a')}</p> : null}
          {entry.details.first_scanned ? <p><strong>First Scanned:</strong> {formatDate(entry.details.first_scanned, 'MMMM Do YYYY, h:mm:ss a')}</p> : null}
          <p><a href={youtubeMusicSearchLink} target="_blank" rel="noopener noreferrer">Search on YouTube Music</a></p>
          <p><a href={appleMusicSearchLink} target="_blank" rel="noopener noreferrer">Search on Apple Music</a></p>
          <p><a href={spotifySearchLink} target="_blank" rel="noopener noreferrer">Search on Spotify</a></p>
          <p><a href={lastFmSearchLink} target="_blank" rel="noopener noreferrer">Search on Last.fm</a></p>
          {discogsSearchLink ? <p><a href={discogsSearchLink} target="_blank" rel="noopener noreferrer">Search on Discogs</a></p> : null}
          {rateYourMusicSearchLink ? <p><a href={rateYourMusicSearchLink} target="_blank" rel="noopener noreferrer">Search on Rate Your Music</a></p> : null}
          {playlistsList}
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default TrackDetailsModal;