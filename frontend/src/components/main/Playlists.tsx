import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import '../../styles/Playlists.css';
import Snackbar from '../Snackbar';
import PlaylistGrid from '../playlist/PlaylistGrid';
import PlaylistSidebar from '../nav/PlaylistSidebar';
import AnniversaryTimeline from '../playlist/AnniversaryTimeline';
import mapToTrackModel from '../../lib/mapToTrackModel';
import { useParams, useNavigate } from 'react-router-dom';
import playlistRepository from '../../repositories/PlaylistRepository';
import libraryRepository from '../../repositories/LibraryRepository';

const Playlists = () => {
  const [playlists, setPlaylists] = useState([]);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [selectedPlaylistID, setSelectedPlaylistID] = useState(null);
  const [showPlaylistSelectModal, setShowPlaylistSelectModal] = useState(false);
  const [newPlaylistModalVisible, setNewPlaylistModalVisible] = useState(false);
  const [newPlaylistNameModal, setNewPlaylistNameModal] = useState('');
  const [cloneModalVisible, setCloneModalVisible] = useState(false);
  const [clonePlaylistName, setClonePlaylistName] = useState('');
  const [playlistToClone, setPlaylistToClone] = useState(null);

  // Add backend status state
  const [backendReady, setBackendReady] = useState(false);
  const [healthCheckAttempts, setHealthCheckAttempts] = useState(0);
  const [connectionError, setConnectionError] = useState(null);

  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'info'
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Health check function
  const checkBackendHealth = useCallback(async () => {
    try {
      await axios.get('/api/health', { timeout: 5000 });
      setBackendReady(true);
      setConnectionError(null);
      setHealthCheckAttempts(0);
      return true;
    } catch (error) {
      console.log(`Health check failed (attempt ${healthCheckAttempts + 1}):`, error.message);
      setHealthCheckAttempts(prev => prev + 1);
      setConnectionError('Waiting for backend to start...');
      return false;
    }
  }, [healthCheckAttempts]);

  // Wait for backend with exponential backoff
  useEffect(() => {
    const waitForBackend = async () => {
      const isHealthy = await checkBackendHealth();
      
      if (!isHealthy && healthCheckAttempts < 10) {
        // Exponential backoff: 1s, 2s, 4s, 8s, then 10s max
        const delay = Math.min(Math.pow(2, healthCheckAttempts) * 1000, 10000);
        setTimeout(waitForBackend, delay);
      } else if (!isHealthy) {
        setConnectionError('Unable to connect to backend. Please check if the server is running.');
      }
    };

    if (!backendReady) {
      waitForBackend();
    }
  }, [checkBackendHealth, backendReady, healthCheckAttempts]);

  const handleSnackbarClose = () => {
    setSnackbar(prev => ({ ...prev, open: false }));
  };

  const { playlistName } = useParams();
  const navigate = useNavigate();

  const fetchPlaylists = useCallback(async () => {
    if (!backendReady) return; // Don't fetch if backend isn't ready
    
    try {
      const response = await playlistRepository.getPlaylists();
      setPlaylists(response);
    } catch (error) {
      console.error('Error fetching playlists:', error);
      setSnackbar({
        open: true,
        message: 'Failed to load playlists',
        severity: 'error'
      });
    }
  }, [backendReady]);

  // Only fetch playlists after backend is ready
  useEffect(() => {
    if (backendReady) {
      fetchPlaylists();
    }
  }, [backendReady, fetchPlaylists]);

  useEffect(() => {
    if (playlistName && playlists.length > 0) {
      const playlistId = playlists.find(p => p.name === playlistName)?.id;
      if (playlistId) {
        setSelectedPlaylistID(playlistId);
      }
    } else {
      setSelectedPlaylistID(null);
    }
  }, [playlistName, playlists]);

  // Show loading/error state while waiting for backend
  if (!backendReady) {
    return (
      <div className="playlists-container">
        <div className="backend-loading">
          <h2>Connecting to server...</h2>
          <p>{connectionError || `Checking backend health (attempt ${healthCheckAttempts + 1})`}</p>
          {healthCheckAttempts >= 10 && (
            <button onClick={() => {
              setHealthCheckAttempts(0);
              setConnectionError(null);
            }}>
              Retry Connection
            </button>
          )}
        </div>
      </div>
    );
  }

  const deletePlaylist = async (playlistId) => {
    if (window.confirm('Are you sure you want to delete this playlist?')) {
      try {
        await playlistRepository.deletePlaylist(playlistId);
        setPlaylists(playlists.filter(playlist => playlist.id !== playlistId));
        if (selectedPlaylistID && selectedPlaylistID === playlistId) {
          setSelectedPlaylistID(null);
        }
        navigate("/");
      } catch (error) {
        console.error('Error deleting playlist:', error);
        setSnackbar({
          open: true,
          message: 'Failed to delete playlist',
          severity: 'error'
        });
      }
    }
  };

  const handleCreateNewPlaylist = async () => {
    try {
      const response = await playlistRepository.create(newPlaylistNameModal);
      const name = response.data.name;

      setPlaylists([...playlists, response.data]);

      setNewPlaylistNameModal('');
      setNewPlaylistModalVisible(false);

      navigate(`/playlist/${name}`);
      setSelectedPlaylistID(response.data.id);
    } catch (error) {
      console.error('Error creating new playlist:', error);
      setSnackbar({
        open: true,
        message: 'Failed to create playlist',
        severity: 'error'
      });
    }
  };

  const handleClonePlaylist = async () => {
    try {
      const cloneName = clonePlaylistName.trim();

      const response = await playlistRepository.clone(playlistToClone.id, cloneName);
            
      setPlaylists([...playlists, response]);
      setCloneModalVisible(false);
      setClonePlaylistName('');
      setPlaylistToClone(null);
    } catch (error) {
      console.error('Error cloning playlist:', error);
      setSnackbar({
        open: true,
        message: 'Failed to clone playlist',
        severity: 'error'
      });
    }
  };

  const handlePlaylistSelect = (id) => {
    const playlistName = playlists.find(p => p.id === id).name;
    navigate(`/playlist/${playlistName}`);
    setSelectedPlaylistID(id);
  };

  const togglePin = async (playlistID) => {
    console.log('Toggling pin:', playlistID);
    try {
      const response = await playlistRepository.togglePin(playlistID);
      setPlaylists(response);
    } catch (error) {
      console.error('Error toggling pin:', error);
    }
  };

  const onRenamePlaylist = async (playlistID, newName) => {
    try {
      await playlistRepository.rename(playlistID, newName);

      let playlistsToEdit = [...playlists];
      const index = playlistsToEdit.findIndex(p => p.id === playlistID);
      playlistsToEdit[index].name = newName;

      setPlaylists(playlistsToEdit);
    } catch (error) {
      console.error('Error renaming playlist:', error);
    }
  };

  const reorderPinnedPlaylist = async (oldIndex, newIndex) => {
    try {
      const response = await playlistRepository.reorderPinnedPlaylist(oldIndex, newIndex);
      setPlaylists(response);
    } catch (error) {
      console.error('Error reordering pinned playlist:', error);
    }
  };

  const handleAlbumClick = (anniversary) => {
    // You could implement search functionality here
    // For now, just show a snackbar with the album info
    setSnackbar({
      open: true,
      message: `${anniversary.album} by ${anniversary.artist} (${anniversary.years_since_release} years old)`,
      severity: 'info'
    });
  };

  const selectedPlaylist = playlists.find(p => p.id === selectedPlaylistID);
 
  return (
    <div className="playlists-container">
      <PlaylistSidebar
        isOpen={sidebarOpen}
        onClose={setSidebarOpen}
        playlists={playlists}
        selectedPlaylist={selectedPlaylist}
        onPlaylistSelect={handlePlaylistSelect}
        onNewPlaylist={() => setNewPlaylistModalVisible(true)}
        onClonePlaylist={handleClonePlaylist}
        onDeletePlaylist={deletePlaylist}
        onRenamePlaylist={onRenamePlaylist}
        togglePin={togglePin}
        reorderPinnedPlaylist={reorderPinnedPlaylist}
      />
      
      <div className="editor-panel">
        {selectedPlaylist ? (
          <PlaylistGrid
            playlistID={selectedPlaylistID}
          />
        ) : (
          <div className="landing-page">
            <div className="landing-header">
              <h1>Welcome to Your Music Library</h1>
              <p>Select a playlist from the sidebar to get started, or check out upcoming album anniversaries below.</p>
            </div>
            <AnniversaryTimeline 
              daysAhead={7}
              daysBehind={7}
              onAlbumClick={handleAlbumClick}
            />
          </div>
        )}
      </div>
      {newPlaylistModalVisible && (
        <div className="modal">
          <div className="modal-content">
            <h3>Create New Playlist</h3>
            <input
              type="text"
              value={newPlaylistNameModal}
              onChange={(e) => setNewPlaylistNameModal(e.target.value)}
              placeholder="New Playlist Name"
            />
            <button onClick={handleCreateNewPlaylist}>Create</button>
            <button onClick={() => setNewPlaylistModalVisible(false)}>Cancel</button>
          </div>
        </div>
      )}
      {cloneModalVisible && (
        <div className="modal">
          <div className="modal-content">
            <h3>Clone Playlist</h3>
            <input
              type="text"
              value={clonePlaylistName}
              onChange={(e) => setClonePlaylistName(e.target.value)}
              placeholder="New Playlist Name"
            />
            <button onClick={handleClonePlaylist}>Clone</button>
            <button onClick={() => {
              setCloneModalVisible(false);
              setClonePlaylistName('');
              setPlaylistToClone(null);
            }}>Cancel</button>
          </div>
        </div>
      )}

      <Snackbar
        open={snackbar.open}
        message={snackbar.message}
        severity={snackbar.severity}
        onClose={handleSnackbarClose}
      />
    </div>
  );
};

export default Playlists;