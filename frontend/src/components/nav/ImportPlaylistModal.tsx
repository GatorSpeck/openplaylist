import React, { useState } from 'react';
import Modal from '../common/Modal';
import axios from 'axios';

const ImportPlaylistModal = ({ open, onClose, onPlaylistImported }) => {
  const [playlistName, setPlaylistName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [importSource, setImportSource] = useState('file');
  const [spotifyPlaylistId, setSpotifyPlaylistId] = useState('');

  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0]);
    setError('');
  };

  const handleImportSourceChange = (e) => {
    setImportSource(e.target.value);
    setError('');
    // Reset fields when changing sources
    if (e.target.value === 'spotify') {
      setSelectedFile(null);
    } else {
      setSpotifyPlaylistId('');
    }
  };

  const handleImport = async () => {
    if (!playlistName.trim()) {
      setError('Please enter a playlist name');
      return;
    }

    if (importSource === 'file') {
      // File import validation
      if (!selectedFile) {
        setError('Please select a file');
        return;
      }

      const fileExtension = selectedFile.name.split('.').pop().toLowerCase();
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
        console.error('Error importing playlist from file:', error);
        setError(error.response?.data?.detail || 'Failed to import playlist from file');
      } finally {
        setIsLoading(false);
      }
    } else if (importSource === 'spotify') {
      // Spotify import validation
      if (!spotifyPlaylistId.trim()) {
        setError('Please enter a Spotify playlist ID');
        return;
      }

      setIsLoading(true);
      try {
        const id = encodeURIComponent(spotifyPlaylistId.trim());
        const response = await axios.post(
          `/api/spotify/import`,
          { playlist_id: id, playlist_name: playlistName },
        );
        
        if (onPlaylistImported) {
          onPlaylistImported(response.data);
        }
        onClose();
      } catch (error) {
        console.error('Error importing playlist from Spotify:', error);
        setError(error.response?.data?.detail || 'Failed to import playlist from Spotify');
      } finally {
        setIsLoading(false);
      }
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
          <select 
            id="import-source" 
            value={importSource}
            onChange={handleImportSourceChange}
          >
            <option value="file">File (JSON/M3U)</option>
            <option value="spotify">Spotify Playlist</option>
          </select>
        </div>
        
        {importSource === 'file' ? (
          <div className="form-group">
            <label htmlFor="file-upload">Select File:</label>
            <input
              id="file-upload"
              type="file"
              accept=".json,.m3u"
              onChange={handleFileChange}
            />
            <small className="helper-text">
              Accepts JSON or M3U format files
            </small>
          </div>
        ) : (
          <div className="form-group">
            <label htmlFor="spotify-id">Spotify Playlist ID:</label>
            <input
              id="spotify-id"
              type="text"
              value={spotifyPlaylistId}
              onChange={(e) => setSpotifyPlaylistId(e.target.value)}
              placeholder="e.g. 37i9dQZEVXcQ9COmYvdajy"
            />
            <small className="helper-text">
              Enter the Spotify playlist ID (found in the URL or Share link)
            </small>
          </div>
        )}
        
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