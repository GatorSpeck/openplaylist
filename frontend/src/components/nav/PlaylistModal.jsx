import React from 'react';
import '../../styles/PlaylistModal.css'; // Import the CSS file for styling

const PlaylistModal = ({ playlists, onClose, onSelect, onCreateNewPlaylist }) => {
  return (
    <div className="modal">
      <div className="modal-content">
        <span className="close" onClick={onClose}>&times;</span>
        <h2>Select Playlist</h2>
        <ul>
          {playlists.map(playlist => (
            <li key={playlist.id} onClick={() => onSelect(playlist.id)}>
              {playlist.name}
            </li>
          ))}
        </ul>
        <button onClick={onCreateNewPlaylist}>Create New Playlist</button>
      </div>
    </div>
  );
};

export default PlaylistModal;