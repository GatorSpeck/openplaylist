import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import '../../styles/Playlists.css'; // Import the CSS file for styling
import Snackbar from '../Snackbar';
import PlaylistGrid from '../playlist/PlaylistGrid';
import PlaylistSidebar from '../nav/PlaylistSidebar';
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

  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'info'
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleSnackbarClose = () => {
    setSnackbar(prev => ({ ...prev, open: false }));
  };

  const { playlistName } = useParams();
  const navigate = useNavigate();

  const fetchPlaylists = useCallback(async () => {
    try {
      const response = await playlistRepository.getPlaylists();
      setPlaylists(response);
    } catch (error) {
      console.error('Error fetching playlists:', error);
    }
  }, []); // No dependencies needed as it's a stable function

  useEffect(() => {
    fetchPlaylists();
  }, []); // Only run on mount

  useEffect(() => {
    if (playlistName && playlists.length > 0) {
      const playlistId = playlists.find(p => p.name === playlistName)?.id;
      if (playlistId) {
        setSelectedPlaylistID(playlistId);
      }
    } else {
      setSelectedPlaylistID(null);
    }
  }, [playlistName, playlists]); // Only depends on these two values

  const deletePlaylist = async (playlistId) => {
    if (window.confirm('Are you sure you want to delete this playlist?')) {
      try {
        await playlistRepository.deletePlaylist(playlistId);
        setPlaylists(playlists.filter(playlist => playlist.id !== playlistId));
        if (selectedPlaylistID && selectedPlaylistID === playlistId) {
          setSelectedPlaylistID(null);
        }
      } catch (error) {
        console.error('Error deleting playlist:', error);
      }
    }
  };

  const handleCreateNewPlaylist = async () => {
    try {
      const response = await playlistRepository.create(newPlaylistNameModal);

      setPlaylists([...playlists, response]);

      setNewPlaylistNameModal('');
      setNewPlaylistModalVisible(false);

      navigate(`/playlist/${response.name}`);
    } catch (error) {
      console.error('Error creating new playlist:', error);
    }
  };

  const handleClonePlaylist = async () => {
    try {
      const clonePlaylistName = clonePlaylistName.trim();

      const response = await playlistRepository.clone(playlistToClone.id, clonePlaylistName);
            
      setPlaylists([...playlists, response]);
      setCloneModalVisible(false);
      setClonePlaylistName('');
      setPlaylistToClone(null);
    } catch (error) {
      console.error('Error cloning playlist:', error);
    }
  };

  const handlePlaylistSelect = (id) => {
    const playlistName = playlists.find(p => p.id === id).name;
    navigate(`/playlist/${playlistName}`);
    setSelectedPlaylistID(id);
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
      />
      
      <div className="editor-panel">
        {selectedPlaylist && (
          <PlaylistGrid
            playlistID={selectedPlaylistID}
          />
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