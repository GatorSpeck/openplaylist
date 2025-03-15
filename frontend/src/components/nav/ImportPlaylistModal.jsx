import React, { useState } from 'react';
import Modal from '../common/Modal';
import axios from 'axios';

const ImportPlaylistModal = ({ open, onClose, onPlaylistImported }) => {
  const [playlistName, setPlaylistName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0]);
    setError('');
  };

  const handleImport = async () => {
    if (!playlistName.trim()) {
      setError('Please enter a playlist name');
      return;
    }

    if (!selectedFile) {
      setError('Please select a file');
      return;
    }

    const fileExtension = selectedFile.name.split('.').pop();

    if (fileExtension !== 'json' && fileExtension !== 'm3u') {
      setError('Invalid file type. Please select a JSON or M3U file');
      return;
    }

    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      
      const response = await axios.post(
        `/api/playlists/import/${fileExtension}/${encodeURIComponent(playlistName)}`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      );
      
      if (onPlaylistImported) {
        onPlaylistImported(response.data);
      }
      onClose();
    } catch (error) {
      console.error('Error importing playlist:', error);
      setError(error.response?.data?.detail || 'Failed to import playlist');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      title="Import Playlist"
      open={open}
      onClose={onClose}
    >
      <div className="import-playlist-form">
        <div className="form-group">
          <label htmlFor="playlist-name">Playlist Name:</label>
          <input
            id="playlist-name"
            type="text"
            value={playlistName}
            onChange={(e) => setPlaylistName(e.target.value)}
            placeholder="Enter playlist name"
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="import-source">Import Source:</label>
          <select id="import-source" defaultValue="json">
            <option value="json">JSON File</option>
            <option value="m3u">M3U File</option>
          </select>
        </div>
        
        <div className="form-group">
          <label htmlFor="file-upload">Select File:</label>
          <input
            id="file-upload"
            type="file"
            accept=".json,.m3u"
            onChange={handleFileChange}
          />
        </div>
        
        {error && <div className="error-message">{error}</div>}
        
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button 
            onClick={handleImport} 
            disabled={isLoading}
            className="primary-button"
          >
            {isLoading ? 'Importing...' : 'Import'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ImportPlaylistModal;