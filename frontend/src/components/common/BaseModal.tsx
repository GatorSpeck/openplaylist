import React from 'react';
import '../../styles/PlaylistModal.css';

const BaseModal = ({ title, options, onClose }) => {
  return (
    <div className="modal">
      <div className="modal-content">
        <span className="close" onClick={onClose}>&times;</span>
        {title ? <h2>Playlist Options</h2> : null}
        <ul>
            {options.map((option, index) => (
                <button key={index} onClick={() => option.action() && onClose()}>{option.label}</button>
            ))}
        </ul>
      </div>
    </div>
  );
};

export default BaseModal;