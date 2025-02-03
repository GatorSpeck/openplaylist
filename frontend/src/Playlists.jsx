import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { ClipLoader } from 'react-spinners';
import PlaylistModal from './PlaylistModal';
import './Playlists.css'; // Import the CSS file for styling
import debounce from 'lodash/debounce';

const Playlists = () => {
  const [playlists, setPlaylists] = useState([]);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [songs, setSongs] = useState([]);
  const [filterQuery, setFilterQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [songToAdd, setSongToAdd] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [newPlaylistModalVisible, setNewPlaylistModalVisible] = useState(false);
  const [newPlaylistNameModal, setNewPlaylistNameModal] = useState('');
  const [selectedSongs, setSelectedSongs] = useState([]);
  const [selectedTracks, setSelectedTracks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [allSongsSelected, setAllSongsSelected] = useState(false);
  const [allTracksSelected, setAllTracksSelected] = useState(false);
  const [cloneModalVisible, setCloneModalVisible] = useState(false);
  const [clonePlaylistName, setClonePlaylistName] = useState('');
  const [playlistToClone, setPlaylistToClone] = useState(null);

  useEffect(() => {
    fetchPlaylists();
    fetchSongs();
  }, []);

  const fetchPlaylists = async () => {
    try {
      const response = await axios.get(`/api/playlists`);
      setPlaylists(response.data);
    } catch (error) {
      console.error('Error fetching playlists:', error);
    }
  };

  const fetchSongs = async (query = '') => {
    if (query.length < 3) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await axios.get(`/api/search`, {
        params: { 
          query: encodeURIComponent(query),
          limit: 50  // Optional: limit results
        }
      });
      setSongs(response.data);
    } catch (error) {
      console.error('Error fetching songs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Create debounced version of fetchSongs
  const debouncedFetchSongs = useCallback(
    debounce((query) => fetchSongs(query), 300),
    []
  );

  // Update filter handler
  const handleFilterChange = (e) => {
    const query = e.target.value;
    setFilterQuery(query);
    debouncedFetchSongs(query);
  };

  const fetchPlaylistDetails = async (playlistId) => {
    try {
      const response = await axios.get(`/api/playlists/${playlistId}`);
      setSelectedPlaylist(response.data);
      setTracks(response.data.entries);
    } catch (error) {
      console.error('Error fetching playlist details:', error);
    }
  };

  const createPlaylist = async () => {
    try {
      const response = await axios.post(`/api/playlists`, {
        name: newPlaylistName,
        entries: []
      });
      setPlaylists([...playlists, response.data]);
      setNewPlaylistName('');
    } catch (error) {
      console.error('Error creating playlist:', error);
    }
  };

  const deletePlaylist = async (playlistId) => {
    if (window.confirm('Are you sure you want to delete this playlist?')) {
      try {
        await axios.delete(`/api/playlists/${playlistId}`);
        setPlaylists(playlists.filter(playlist => playlist.id !== playlistId));
        if (selectedPlaylist && selectedPlaylist.id === playlistId) {
          setSelectedPlaylist(null);
          setTracks([]);
        }
      } catch (error) {
        console.error('Error deleting playlist:', error);
      }
    }
  };

  const addSongToPlaylist = async (songs, playlistId) => {
    const songsArray = Array.isArray(songs) ? songs : [songs];
    
    const updatedTracks = [
      ...tracks,
      ...songsArray.map((song, idx) => ({
        order: tracks.length + idx,
        music_file_id: song.id
      }))
    ];
  
    try {
      await axios.put(`/api/playlists/${playlistId}`, {
        name: selectedPlaylist.name,
        entries: updatedTracks
      });
      fetchPlaylistDetails(playlistId);
      clearSelectedSongs();
    } catch (error) {
      console.error('Error adding songs to playlist:', error);
    }
  };

  const removeSongFromPlaylist = async (index) => {
    if (!selectedPlaylist) {
      alert('Please select a playlist first.');
      return;
    }

    console.log("Removing song from playlist at index", index);

    try {
      // Remove the song from the list of entries
      console.log(selectedPlaylist.entries);
      let updatedEntries = selectedPlaylist.entries.filter((_, i) => i !== index);
      console.log(updatedEntries);

      // Update the order of the remaining tracks
      updatedEntries = updatedEntries.map((entry, i) => ({ ...entry, order: i }));

      // Update the playlist with the new list of entries
      const response = await axios.put(`/api/playlists/${selectedPlaylist.id}`, {
        name: selectedPlaylist.name,
        entries: updatedEntries
      });

      // Update the selected playlist and tracks
      setSelectedPlaylist(response.data);
      setTracks(response.data.entries);
    } catch (error) {
      console.error('Error removing song from playlist:', error);
    }
  };

  const exportPlaylist = async (playlistId) => {
    try {
      const response = await axios.get(`/api/playlists/${playlistId}/export`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${selectedPlaylist.name}.m3u`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Error exporting playlist:', error);
    }
  };

  const scanMusic = async () => {
    setIsScanning(true);
    try {
      await axios.get(`/api/scan`);
      fetchSongs(); // Reload the tracks data
    } catch (error) {
      console.error('Error scanning music:', error);
      alert('Error scanning music.');
    } finally {
      setIsScanning(false);
    }
  };

  const fullScanMusic = async () => {
    setIsScanning(true);
    try {
      await axios.get(`/api/fullscan`);
      fetchSongs(); // Reload the tracks data
    } catch (error) {
      console.error('Error performing full scan:', error);
      alert('Error performing full scan.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleAddToPlaylist = (song) => {
    setSongToAdd(song);
    setShowModal(true);
  };

  const handleSelectPlaylist = (playlistId) => {
    addSongToPlaylist(songToAdd, playlistId);
    setShowModal(false);
    setSongToAdd(null);
  };

  const handleCreateNewPlaylist = async () => {
    try {
      const response = await axios.post(`/api/playlists`, {
        name: newPlaylistNameModal,
        entries: [{ order: 0, music_file_id: songToAdd.id }]
      });
      setPlaylists([...playlists, response.data]);
      setNewPlaylistNameModal('');
      setShowModal(false);
      setSongToAdd(null);
      setNewPlaylistModalVisible(false);
    } catch (error) {
      console.error('Error creating new playlist:', error);
    }
  };

  const handleClonePlaylist = async () => {
    try {
      const playlistData = {
        name: clonePlaylistName,
        entries: playlistToClone.entries
      };
      
      const response = await axios.post(
        `/api/playlists`, 
        playlistData
      );
      
      setPlaylists([...playlists, response.data]);
      setCloneModalVisible(false);
      setClonePlaylistName('');
      setPlaylistToClone(null);
    } catch (error) {
      console.error('Error cloning playlist:', error);
    }
  };

  const filteredSongs = songs;

  const onDragEnd = async (result) => {
    if (!result.destination) return;

    const { source, destination } = result;

    // If dragging within playlist
    if (source.droppableId === 'playlist' && destination.droppableId === 'playlist') {
      const updatedTracks = Array.from(tracks);
      const [movedTrack] = updatedTracks.splice(source.index, 1);
      updatedTracks.splice(destination.index, 0, movedTrack);
      
      setTracks(updatedTracks);
      
      const updatedEntries = updatedTracks.map((track, index) => ({
        ...track,
        order: index,
      }));

      try {
        await axios.put(`/api/playlists/${selectedPlaylist.id}`, {
          name: selectedPlaylist.name,
          entries: updatedEntries,
        });
        fetchPlaylistDetails(selectedPlaylist.id);
      } catch (error) {
        console.error('Error updating playlist order:', error);
      }
    }
    
    // If dragging from songs to playlist
    if (source.droppableId === 'songs' && destination.droppableId === 'playlist') {
      const song = filteredSongs[source.index];
      addSongToPlaylist(song, selectedPlaylist.id);
    }
  };

  const toggleSongSelection = (song) => {
    setSelectedSongs(prev => {
      const newSelection = prev.some(s => s.id === song.id)
        ? prev.filter(s => s.id !== song.id)
        : [...prev, song];
      setAllSongsSelected(newSelection.length === songs.length);
      return newSelection;
    });
  };

  const clearSelectedSongs = () => {
    setSelectedSongs([]);
  };

  const handleAddSelectedToPlaylist = () => {
    setSongToAdd(selectedSongs);
    setShowModal(true);
  };

  const toggleTrackSelection = (index) => {
    setSelectedTracks(prev => {
      const newSelection = prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index];
      setAllTracksSelected(newSelection.length === tracks.length);
      return newSelection;
    });
  };

  const clearTrackSelection = () => {
    setSelectedTracks([]);
  };

  const removeSelectedTracks = async () => {
    if (!selectedPlaylist || selectedTracks.length === 0) return;

    try {
      const remainingEntries = selectedPlaylist.entries.filter((_, index) => 
        !selectedTracks.includes(index)
      ).map((entry, index) => ({
        ...entry,
        order: index
      }));

      const response = await axios.put(
        `/api/playlists/${selectedPlaylist.id}`,
        {
          name: selectedPlaylist.name,
          entries: remainingEntries
        }
      );

      setSelectedPlaylist(response.data);
      setTracks(response.data.entries);
      clearTrackSelection();
    } catch (error) {
      console.error('Error removing tracks:', error);
    }
  };

  const toggleAllSongs = () => {
    if (allSongsSelected) {
      setSelectedSongs([]);
    } else {
      setSelectedSongs(songs);
    }
    setAllSongsSelected(!allSongsSelected);
  };

  const toggleAllTracks = () => {
    if (allTracksSelected) {
      setSelectedTracks([]);
    } else {
      setSelectedTracks(tracks.map((_, index) => index));
    }
    setAllTracksSelected(!allTracksSelected);
  };

  return (
    <div className="playlists-container">
      <div className="playlists-panel">
        <h1>Playlists</h1>
        <ul>
          {playlists.map(playlist => (
            <li key={playlist.id}>
              <span onClick={() => fetchPlaylistDetails(playlist.id)}>{playlist.name}</span>
              <button onClick={() => deletePlaylist(playlist.id)}>Delete</button>
              <button onClick={() => exportPlaylist(playlist.id)}>Export</button>
              <button onClick={() => {
                setPlaylistToClone(playlist);
                setClonePlaylistName(`${playlist.name} (Copy)`);
                setCloneModalVisible(true);
              }}>Clone</button>
            </li>
          ))}
        </ul>

        <h2>Create New Playlist</h2>
        <input
          type="text"
          placeholder="Playlist Name"
          value={newPlaylistName}
          onChange={(e) => setNewPlaylistName(e.target.value)}
        />
        <button onClick={createPlaylist}>Create Playlist</button>

        {isScanning ? (
          <div className="spinner-container">
            <ClipLoader size={50} color={"#123abc"} loading={isScanning} />
          </div>
        ) : (
          <div>
            <button onClick={scanMusic}>Scan Music</button>
            <button onClick={fullScanMusic}>Full Scan Music</button>
          </div>
        )}
      </div>
      <div className="editor-panel">
        <DragDropContext onDragEnd={onDragEnd}>
          {selectedPlaylist && (
            <div>
              <h2>{selectedPlaylist.name}</h2>

              {selectedTracks.length > 0 && (
                <div className="batch-actions">
                  <button onClick={removeSelectedTracks}>
                    Remove {selectedTracks.length} Selected Tracks
                  </button>
                  <button onClick={clearTrackSelection}>
                    Clear Selection
                  </button>
                </div>
              )}

              <Droppable droppableId="playlist">
                {(provided) => (
                  <div className="playlist-grid" {...provided.droppableProps} ref={provided.innerRef}>
                    <div className="playlist-grid-header">
                      <input
                        type="checkbox"
                        checked={allTracksSelected}
                        onChange={toggleAllTracks}
                      />
                    </div>
                    <div className="playlist-grid-header">Artist</div>
                    <div className="playlist-grid-header">Album</div>
                    <div className="playlist-grid-header">Title</div>
                    <div className="playlist-grid-header">Genres</div>
                    <div className="playlist-grid-header">Actions</div>

                    {tracks.map((track, index) => (
                      <Draggable 
                        key={index} 
                        draggableId={index.toString()} 
                        index={index}

                      >
                        {(provided) => (
                          <React.Fragment>
                            <div className="playlist-grid-item" ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}>
                              <input
                                type="checkbox"
                                checked={selectedTracks.includes(index)}
                                onChange={() => toggleTrackSelection(index)}
                              />
                            </div>
                            <div className="playlist-grid-item">{track.music_file_details?.artist || 'Unknown Artist'}</div>
                            <div className="playlist-grid-item">{track.music_file_details?.album || 'Unknown Album'}</div>
                            <div className="playlist-grid-item">{track.music_file_details?.title || 'Unknown Title'}</div>
                            <div className="playlist-grid-item">{track.music_file_details?.genres?.join(', ') || 'Unknown Genres'}</div>
                            <div className="playlist-grid-item">
                              <button onClick={() => removeSongFromPlaylist(index)}>Remove</button>
                            </div>
                          </React.Fragment>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          )}

          <h2>Add Songs</h2>
          <input
            type="text"
            placeholder="Search..."
            value={filterQuery}
            onChange={handleFilterChange}
          />

          {selectedSongs.length > 0 && (
            <div className="batch-actions">
              <button onClick={handleAddSelectedToPlaylist}>
                Add {selectedSongs.length} Selected to Playlist
              </button>
              <button onClick={clearSelectedSongs}>
                Clear Selection
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="spinner-container">
              <ClipLoader size={30} color={"#123abc"} />
            </div>
          ) : (
            <Droppable droppableId="songs">
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef} className="playlist-grid">
                  <div className="playlist-grid-header">
                    <input
                      type="checkbox"
                      checked={allSongsSelected}
                      onChange={toggleAllSongs}
                    />
                  </div>
                  <div className="playlist-grid-header">Artist</div>
                  <div className="playlist-grid-header">Album</div>
                  <div className="playlist-grid-header">Title</div>
                  <div className="playlist-grid-header">Genres</div>
                  <div className="playlist-grid-header">Actions</div>
                  
                  {filteredSongs.map((song, index) => (
                    <Draggable 
                      key={song.id} 
                      draggableId={`song-${song.id}`} 
                      index={index}
                    >
                      {(provided) => (
                        <React.Fragment>
                          <div 
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            ref={provided.innerRef}
                            className="playlist-grid-item"
                          >
                            <input 
                              type="checkbox"
                              checked={selectedSongs.some(s => s.id === song.id)}
                              onChange={() => toggleSongSelection(song)}
                            />
                          </div>
                          <div className="playlist-grid-item">{song.artist || 'Unknown Artist'}</div>
                          <div className="playlist-grid-item">{song.album || 'Unknown Album'}</div>
                          <div className="playlist-grid-item">{song.title || 'Unknown Title'}</div>
                          <div className="playlist-grid-item">{song.genres?.join(', ') || 'Unknown Genres'}</div>
                          <div className="playlist-grid-item">
                            <button onClick={() => handleAddToPlaylist(song)}>Add to Playlist</button>
                          </div>
                        </React.Fragment>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          )}

        </DragDropContext>
      </div>
      {showModal && (
        <PlaylistModal
          playlists={playlists}
          onClose={() => setShowModal(false)}
          onSelect={handleSelectPlaylist}
          onCreateNewPlaylist={() => setNewPlaylistModalVisible(true)}
        />
      )}
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
    </div>
  );
};

export default Playlists;