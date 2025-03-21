import React, { useState, useEffect } from 'react';
import '../../styles/TrackDetailsModal.css';
import { formatDate, formatDuration, formatSize } from '../../lib/misc';
import { use } from 'react';
import playlistRepository from '../../repositories/PlaylistRepository';

const TrackDetailsModal = ({ entry, onClose }) => {
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

  const releaseDate = entry.year ? formatDate(entry.year, 'MMMM Do YYYY') : null;

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
          <p><strong>Artist:</strong> {entry.artist}</p>
          <p><strong>Album Artist:</strong> {entry.album_artist}</p>
          <p><strong>Album:</strong> {entry.getAlbum()}</p>
          {entry.disc_number ? <p><strong>Disc:</strong>{entry.disc_number}</p> : null}
          {entry.track_number ? <p><strong>Track:</strong>{entry.track_number}</p> : null}
          {entry.length ? <p><strong>Length:</strong> {formatDuration(entry.length)}</p> : null}
          <p><strong>Release Date:</strong> {releaseDate || entry.year}</p>
          <p><strong>Genres:</strong> {entry.genres ? entry.genres.join(", ") : null}</p>
          {entry.path ? (<p><strong>Path:</strong>
            {entry.missing ? <s>{entry.path}</s> : <span>{entry.path}</span>}
          </p>) : null}
          {entry.publisher ? <p><strong>Publisher:</strong> {entry.publisher}</p> : null}
          {entry.kind ? <p><strong>Kind:</strong> {entry.kind}</p> : null}
          {entry.url ? <p><strong>URL:</strong> <a href={entry.url}>{entry.url}</a></p> : null}
          {entry.notes ? <p><strong>Notes:</strong> {entry.notes}</p> : null}
          {entry.comments ? <p><strong>Comments:</strong> {entry.comments}</p> : null}
          {entry.size ? <p><strong>Size:</strong> {formatSize(entry.size)}</p> : null}
          {dateAdded ? <p><strong>Date Added to Playlist:</strong> {dateAdded}</p> : null}
          {entry.last_scanned ? <p><strong>Last Scanned:</strong> {formatDate(entry.last_scanned, 'MMMM Do YYYY, h:mm:ss a')}</p> : null}
          {entry.first_scanned ? <p><strong>First Scanned:</strong> {formatDate(entry.first_scanned, 'MMMM Do YYYY, h:mm:ss a')}</p> : null}
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