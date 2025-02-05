import React, { useState } from 'react';
import './TrackDetailsModal.css';

const TrackDetailsModal = ({ track, onClose }) => {
  if (!track) return null;

  const details = track.details || track;

  const formatDuration = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Track Details</h2>
        <div className="track-details">
          <p><strong>Title:</strong> {details.title}</p>
          <p><strong>Artist:</strong> {details.artist}</p>
          <p><strong>Album:</strong> {details.album}</p>
          <p><strong>Album Artist:</strong> {details.album_artist}</p>
          <p><strong>Length:</strong> {formatDuration(details.length)}</p>
          <p><strong>Year:</strong> {details.year}</p>
          <p><strong>Path:</strong> {details.path}</p>
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default TrackDetailsModal;