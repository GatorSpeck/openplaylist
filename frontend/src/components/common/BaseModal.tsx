import React from 'react';
import '../../styles/PlaylistModal.css';

const BaseModal = ({ title, options, onClose, onBackdropClick }) => {
  const handleBackdropClick = (e) => {
    // Only close if clicking on the backdrop (modal div), not the content
    if (e.target === e.currentTarget) {
      if (onBackdropClick) {
        onBackdropClick();
      } else {
        onClose(); // Fallback to onClose if no onBackdropClick provided
      }
    }
  };

  return (
    <div className="modal" onClick={handleBackdropClick}>
      <div className="modal-content">
        <span className="close" onClick={onClose}>&times;</span>
        {title ? <h2>{title}</h2> : null}
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