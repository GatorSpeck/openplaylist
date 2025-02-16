import React from 'react';
import '../../styles/PlaylistModal.css'; // Import the CSS file for styling

const PlaylistModal = ({ onClose, onSyncToPlex, onDelete }) => {
  return (
    <div className="modal">
      <div className="modal-content">
        <span className="close" onClick={onClose}>&times;</span>
        <h2>Playlist Options</h2>
        <ul>
          <button onClick={() => onSyncToPlex() && onClose()}>Sync to Plex</button>
          <button onClick={() => onDelete() && onClose()}>Delete Playlist</button>
        </ul>
      </div>
    </div>
  );
};

export default PlaylistModal;