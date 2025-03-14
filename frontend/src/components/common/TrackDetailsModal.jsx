import React, { useState, useEffect } from 'react';
import '../../styles/TrackDetailsModal.css';
import { formatDate, formatDuration, formatSize } from '../../lib/misc';
import { use } from 'react';
import playlistRepository from '../../repositories/PlaylistRepository';

const TrackDetailsModal = ({ track, onClose }) => {
  const [playlists, setPlaylists] = useState([]);
  if (!track) return null;

  useEffect(() => {
    const fn = async () => {
      if (track.entry_type !== "music_file") return;
      if (!track.music_file_id) return;
      const result = await playlistRepository.getPlaylistsByTrack(track.music_file_id);
      setPlaylists(result);
    }

    fn();
  }, [track]);

  const details = track.details || track;

  const dateAdded = track.date_added ? formatDate(track.date_added, 'MMMM Do YYYY, h:mm:ss a') : null;

  const releaseDate = track.year ? formatDate(track.year, 'MMMM Do YYYY') : null;

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
          <p><strong>ID:</strong> {details.id}</p>
          <p><strong>Title:</strong> {details.title}</p>
          <p><strong>Artist:</strong> {details.artist}</p>
          <p><strong>Album:</strong> {details.album}</p>
          {details.disc_number ? <p><strong>Disc:</strong>{details.disc_number}</p> : null}
          {details.track_number ? <p><strong>Track:</strong>{details.track_number}</p> : null}
          {details.album_artist ? <p><strong>Album Artist:</strong> {details.album_artist}</p> : null}
          <p><strong>Length:</strong> {formatDuration(details.length)}</p>
          <p><strong>Release Date:</strong> {releaseDate || details.year}</p>
          <p><strong>Genres:</strong> {details.genres ? details.genres.join(", ") : null}</p>
          <p><strong>Path:</strong>
            {details.missing ? <s>{details.path}</s> : <span>{details.path}</span>}
          </p>
          {details.notes ? <p><strong>Notes:</strong> {details.notes}</p> : null}
          {details.comments ? <p><strong>Comments:</strong> {details.comments}</p> : null}
          {details.size ? <p><strong>Size:</strong> {formatSize(details.size)}</p> : null}
          {dateAdded ? <p><strong>Date Added to Playlist:</strong> {dateAdded}</p> : null}
          {details.last_scanned ? <p><strong>Last Scanned:</strong> {formatDate(details.last_scanned, 'MMMM Do YYYY, h:mm:ss a')}</p> : null}
          {details.first_scanned ? <p><strong>First Scanned:</strong> {formatDate(details.first_scanned, 'MMMM Do YYYY, h:mm:ss a')}</p> : null}
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