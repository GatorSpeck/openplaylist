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
      <div className="flex flex-col gap-1">
        <label htmlFor="file-upload" className="text-sm font-medium text-text dark:text-text-dark">Select File:</label>
        <input
          id="file-upload"
          type="file"
          accept=".json,.m3u"
          onChange={handleFileChange}
          className="w-full cursor-pointer rounded border border-border px-3 py-2 text-sm text-text file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent/10 file:px-2 file:py-1 file:text-xs file:font-medium file:text-accent dark:border-border-dark dark:text-text-dark"
        />
        <span className="text-xs text-text/60 dark:text-text-dark/60">
          Accepts JSON or M3U format files
        </span>
      </div>
    );
  }
  else if (importSource === "spotify") {
    importForm = (
      <div className="flex flex-col gap-1">
        <label htmlFor="spotify-id" className="text-sm font-medium text-text dark:text-text-dark">Spotify Playlist ID:</label>
        <input
          id="spotify-id"
          type="text"
          value={spotifyPlaylistId}
          onChange={(e) => setSpotifyPlaylistId(e.target.value)}
          placeholder="e.g. 37i9dQZEVXcQ9COmYvdajy"
          className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm text-text placeholder:text-text/50 focus:outline-none focus:ring-1 focus:ring-accent dark:border-border-dark dark:text-text-dark dark:placeholder:text-text-dark/50"
        />
        <span className="text-xs text-text/60 dark:text-text-dark/60">
          Enter the Spotify playlist ID (found in the URL or Share link)
        </span>
      </div>
    );
  }
  else if (importSource === "plex") {
    importForm = (
      <div className="flex flex-col gap-1">
        <label htmlFor="plex-id" className="text-sm font-medium text-text dark:text-text-dark">Plex Playlist Name:</label>
        <input
          id="plex-id"
          type="text"
          value={plexPlaylistName}
          onChange={(e) => setPlexPlaylistName(e.target.value)}
          placeholder="e.g. My Favorite Songs"
          className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm text-text placeholder:text-text/50 focus:outline-none focus:ring-1 focus:ring-accent dark:border-border-dark dark:text-text-dark dark:placeholder:text-text-dark/50"
        />
        <span className="text-xs text-text/60 dark:text-text-dark/60">
          Enter the Plex playlist name
        </span>
      </div>
    );
  }
  else if (importSource === "youtube") {
    importForm = (
      <div className="flex flex-col gap-1">
        <label htmlFor="youtube-id" className="text-sm font-medium text-text dark:text-text-dark">YouTube Music Playlist ID:</label>
        <input
          id="youtube-id"
          type="text"
          value={youtubePlaylistId}
          onChange={(e) => setYoutubePlaylistId(e.target.value)}
          placeholder="e.g. PLrAl6w_5dWWDk7WS_CL5lBNxFMlsJ1Y_n"
          className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm text-text placeholder:text-text/50 focus:outline-none focus:ring-1 focus:ring-accent dark:border-border-dark dark:text-text-dark dark:placeholder:text-text-dark/50"
        />
        <span className="text-xs text-text/60 dark:text-text-dark/60">
          Enter the YouTube Music playlist ID (found in the URL after "list=")
        </span>
      </div>
    );
  }

  return (
    <Modal
      title="Import Playlist"
      open={open}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="playlist-name" className="text-sm font-medium text-text dark:text-text-dark">Playlist Name:</label>
          <input
            id="playlist-name"
            type="text"
            value={playlistName}
            onChange={(e) => setPlaylistName(e.target.value)}
            placeholder="Enter playlist name"
            className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm text-text placeholder:text-text/50 focus:outline-none focus:ring-1 focus:ring-accent dark:border-border-dark dark:text-text-dark dark:placeholder:text-text-dark/50"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="import-source" className="text-sm font-medium text-text dark:text-text-dark">Import Source:</label>
          <select
            id="import-source"
            value={importSource}
            onChange={handleImportSourceChange}
            className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent dark:border-border-dark dark:bg-surface-dark dark:text-text-dark"
          >
            <option value="file">File (JSON/M3U)</option>
            <option value="spotify">Spotify Playlist</option>
            <option value="plex">Plex Playlist</option>
            <option value="youtube">YouTube Music Playlist</option>
          </select>
        </div>

        {importForm}

        {error && (
          <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700/50 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border px-4 py-1.5 text-sm text-text transition hover:bg-surface-muted dark:border-border-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded bg-accent px-4 py-1.5 text-sm font-medium text-text-dark transition hover:bg-accent/90 disabled:opacity-50"
          >
            {isLoading ? 'Importing...' : 'Import'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ImportPlaylistModal;