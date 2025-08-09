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
  const [plexPlaylistName, setPlexPlaylistName] = useState('');
  const [youtubePlaylistId, setYoutubePlaylistId] = useState('');

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
      setPlexPlaylistName('');
      setYoutubePlaylistId('');
    }
    else if (e.target.value === 'plex') {
      setSelectedFile(null);
      setSpotifyPlaylistId('');
      setYoutubePlaylistId('');
    }
    else if (e.target.value === 'youtube') {
      setSelectedFile(null);
      setSpotifyPlaylistId('');
      setPlexPlaylistName('');
    }
    else {
      setSpotifyPlaylistId('');
      setPlexPlaylistName('');
      setYoutubePlaylistId('');
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
    else if (importSource === 'plex') {
      // Plex import validation
      if (!plexPlaylistName.trim()) {
        setError('Please enter a Plex playlist name');
        return;
      }

      setIsLoading(true);
      try {
        const response = await axios.post(
          `/api/plex/import`,
          { remote_playlist_name: plexPlaylistName.trim(), playlist_name: playlistName.trim() },
        );
        
        if (onPlaylistImported) {
          onPlaylistImported(response.data);
        }
        onClose();
      } catch (error) {
        console.error('Error importing playlist from Plex:', error);
        setError(error.response?.data?.detail || 'Failed to import playlist from Plex');
      } finally {
        setIsLoading(false);
      }
    }
    else if (importSource === 'youtube') {
      // YouTube Music import validation
      if (!youtubePlaylistId.trim()) {
        setError('Please enter a YouTube Music playlist ID');
        return;
      }

      setIsLoading(true);
      try {
        const id = encodeURIComponent(youtubePlaylistId.trim());
        const response = await axios.post(
          `/api/youtube/import`,
          { playlist_id: id, playlist_name: playlistName },
        );
        
        if (onPlaylistImported) {
          onPlaylistImported(response.data);
        }
        onClose();
      } catch (error) {
        console.error('Error importing playlist from YouTube Music:', error);
        setError(error.response?.data?.detail || 'Failed to import playlist from YouTube Music');
      } finally {
        setIsLoading(false);
      }
    }
  };

  let importForm = null;
  if (importSource === "file") {
    importForm = (
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
    );
  }
  else if (importSource === "spotify") {
    importForm = (
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
    );
  }
  else if (importSource === "plex") {
    importForm = (
      <div className="form-group">
        <label htmlFor="plex-id">Plex Playlist Name:</label>
        <input
          id="plex-id"
          type="text"
          value={plexPlaylistName}
          onChange={(e) => setPlexPlaylistName(e.target.value)}
          placeholder="e.g. My Favorite Songs"
        />
        <small className="helper-text">
          Enter the Plex playlist name
        </small>
      </div>
    );
  }
  else if (importSource === "youtube") {
    importForm = (
      <div className="form-group">
        <label htmlFor="youtube-id">YouTube Music Playlist ID:</label>
        <input
          id="youtube-id"
          type="text"
          value={youtubePlaylistId}
          onChange={(e) => setYoutubePlaylistId(e.target.value)}
          placeholder="e.g. PLrAl6w_5dWWDk7WS_CL5lBNxFMlsJ1Y_n"
        />
        <small className="helper-text">
          Enter the YouTube Music playlist ID (found in the URL after "list=")
        </small>
      </div>
    );
  }

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
            <option value="plex">Plex Playlist</option>
            <option value="youtube">YouTube Music Playlist</option>
          </select>
        </div>

        {importForm}
        
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