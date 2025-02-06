import React, {
   useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { ClipLoader } from 'react-spinners';
import PlaylistModal from './PlaylistModal';
import './Playlists.css'; // Import the CSS file for styling
import debounce from 'lodash/debounce';
import TrackDetailsModal from './components/TrackDetailsModal';
import LastFMSearch from './components/LastFMSearch';
import ContextMenu from './components/ContextMenu';
import Snackbar from './components/Snackbar';
import EntryTypeBadge from './components/EntryTypeBadge';

const Playlists = () => {
  const [playlists, setPlaylists] = useState([]);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [playlistEntries, setPlaylistEntries] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [filterQuery, setFilterQuery] = useState('');
  const [showPlaylistSelectModal, setShowPlaylistSelectModal] = useState(false);
  const [songToAdd, setSongToAdd] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [newPlaylistModalVisible, setNewPlaylistModalVisible] = useState(false);
  const [newPlaylistNameModal, setNewPlaylistNameModal] = useState('');
  const [selectedSearchResults, setSelectedSearchResults] = useState([]);
  const [selectedPlaylistEntries, setSelectedPlaylistEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [allSearchResultsSelected, setAllSongsSelected] = useState(false);
  const [allPlaylistEntriesSelected, setAllTracksSelected] = useState(false);
  const [cloneModalVisible, setCloneModalVisible] = useState(false);
  const [clonePlaylistName, setClonePlaylistName] = useState('');
  const [playlistToClone, setPlaylistToClone] = useState(null);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [showTrackDetails, setShowTrackDetails] = useState(false);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, track: null });
  const [showLastFMSearch, setShowLastFMSearch] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'info'
  });

  const handleSnackbarClose = () => {
    setSnackbar(prev => ({ ...prev, open: false }));
  };

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

  const mapToTrackModel = (item) => {
    const detailsToUse = item.details || item;
    return {
      ...item,
      id: detailsToUse.id,
      title: detailsToUse.title || 'Unknown Title',
      artist: detailsToUse.artist || 'Unknown Artist',
      album: detailsToUse.album || 'Unknown Album',
      album_artist: detailsToUse.album_artist || null,
      year: detailsToUse.year || '',
      length: detailsToUse.length || 0,
      genres: detailsToUse.genres || [],
      path: detailsToUse.path,
      publisher: detailsToUse.publisher || 'Unknown Publisher',
      kind: detailsToUse.kind,
      music_file_id: item.music_file_id || null,
      entry_type: item.entry_type,
      order: item.order || null
    }
  };

  const extractSearchResults = (response) => {
    const results = response.data.map(s => mapToTrackModel({...s, music_file_id: s.id, entry_type: "music_file"}));
    console.log(results);
    return results;
  }

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

      setSearchResults(extractSearchResults(response));
      
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
      setPlaylistEntries(response.data.entries.map(entry => mapToTrackModel(entry)) || []);
    } catch (error) {
      console.error('Error fetching playlist details:', error);
    }
  };

  const createPlaylist = async () => {
    const songs = songToAdd || [];
    console.log(songs);
    try {
      const response = await axios.post(`/api/playlists`, {
        name: newPlaylistName,
        entries: songs.map(s => mapToTrackModel(s))
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
          setPlaylistEntries([]);
        }
      } catch (error) {
        console.error('Error deleting playlist:', error);
      }
    }
  };

  const addSongToPlaylist = async (songs, playlistId) => {
    const songsArray = Array.isArray(songs) ? songs : [songs];
    try {
      await addTracksToPlaylist(playlistId, songsArray);
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
      let updatedEntries = selectedPlaylist.entries.filter((_, i) => i !== index);

      // Update the order of the remaining tracks
      updatedEntries = updatedEntries.map((entry, i) => ({ ...entry, order: i }));

      setPlaylistTracks(selectedPlaylist.id, updatedEntries);
      clearTrackSelection()
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

  const purgeData = async () => {
    if (!window.confirm('Are you sure you want to purge all data?')) {
      return;
    }

    try {
      await axios.get(`/api/purge`);
    } catch (error) {
      console.error('Error purging data:', error);
    }
  };

  const handleSelectPlaylist = (playlistName) => {
    addSongToPlaylist(songToAdd, playlistName);
    setShowPlaylistSelectModal(false);
    setSongToAdd(null);
  };

  const handleCreateNewPlaylist = async () => {
    const songList = Array.isArray(songToAdd) ? songToAdd : [songToAdd];
    console.log(songList);
    try {
      const response = await axios.post(`/api/playlists`, {
        name: newPlaylistNameModal,
        entries: songList.map((s, idx) => ({ order: idx, ...mapToTrackModel(s)}))
      });

      setPlaylists([...playlists, response.data]);

      setNewPlaylistNameModal('');
      setShowPlaylistSelectModal(false);
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

  const filteredSongs = searchResults;

  const onDragEnd = async (result) => {
    if (!result.destination) return;

    const { source, destination } = result;

    // If dragging within playlist
    if (source.droppableId === 'playlist' && destination.droppableId === 'playlist') {
      const updatedTracks = Array.from(playlistEntries);
      const [movedTrack] = updatedTracks.splice(source.index, 1);
      updatedTracks.splice(destination.index, 0, movedTrack);
      
      setPlaylistEntries(updatedTracks);
      
      const updatedEntries = updatedTracks.map((track, index) => ({
        ...track,
        order: index,
      }));

      setPlaylistTracks(selectedPlaylist.id, updatedEntries);
    }
    
    // If dragging from songs to playlist
    if (source.droppableId === 'songs' && destination.droppableId === 'playlist') {
      const song = filteredSongs[source.index];
      addSongToPlaylist(song, selectedPlaylist.name);
    }
  };

  const toggleSongSelection = (song) => {
    setSelectedSearchResults(prev => {
      const newSelection = prev.some(s => s.id === song.id)
        ? prev.filter(s => s.id !== song.id)
        : [...prev, song];
      setAllSongsSelected(newSelection.length === searchResults.length);
      return newSelection;
    });
  };

  const clearSelectedSongs = () => {
    setSelectedSearchResults([]);
  };

  const handleAddSelectedToPlaylist = () => {
    setSongToAdd(selectedSearchResults);
    setShowPlaylistSelectModal(true);
  };

  const handleAddSongToPlaylist = (song) => {
    setSongToAdd([song]);
    setShowPlaylistSelectModal(true);
  }

  const toggleTrackSelection = (index) => {
    setSelectedPlaylistEntries(prev => {
      const newSelection = prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index];
      setAllTracksSelected(newSelection.length === playlistEntries.length);
      return newSelection;
    });
  };

  const clearTrackSelection = () => {
    setSelectedPlaylistEntries([]);
  };

  const removeSelectedTracks = async () => {
    if (!selectedPlaylist || selectedPlaylistEntries.length === 0) return;

    try {
      const remainingEntries = selectedPlaylist.entries.filter((_, index) => 
        !selectedPlaylistEntries.includes(index)
      ).map((entry, index) => ({
        ...entry,
        order: index
      }));

      setPlaylistTracks(selectedPlaylist.id, remainingEntries);

      const playlistName = playlists.find(p => p.id === playlistID)?.name || 'the playlist';
      
      // Show success message
      setSnackbar({
        open: true,
        message: `Removed ${selectedPlaylistEntries.length} tracks from ${playlistName}`,
        severity: 'success'
      });

      clearSelectedSongs();
      clearTrackSelection();
    } catch (error) {
      console.error('Error removing tracks:', error);
    }
  };

  const toggleAllSongs = () => {
    if (allSearchResultsSelected) {
      setSelectedSearchResults([]);
    } else {
      setSelectedSearchResults(searchResults);
    }
    setAllSongsSelected(!allSearchResultsSelected);
  };

  const toggleAllTracks = () => {
    if (allPlaylistEntriesSelected) {
      setSelectedPlaylistEntries([]);
    } else {
      setSelectedPlaylistEntries(playlistEntries.map((_, index) => index));
    }
    setAllTracksSelected(!allPlaylistEntriesSelected);
  };

  const handleShowTrackDetails = (track) => {
    setSelectedTrack(track);
    setShowTrackDetails(true);
  };

  const handleContextMenu = (e, track) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      track
    });
  };

  const handleFilterByAlbum = async (album) => {
    setContextMenu({ visible: false });
    setFilterQuery("");
    try {
      const response = await axios.get(`/api/filter`, {
        params: { album }
      });
      
      setSearchResults(extractSearchResults(response));

    } catch (error) {
      console.error('Error filtering by album:', error);
    }
  };

  const handleFilterByArtist = async (artist) => {
    setContextMenu({ visible: false });
    setFilterQuery("");
    
    try {
      const response = await axios.get(`/api/filter`, {
        params: { artist }
      });

      setSearchResults(extractSearchResults(response));
    } catch (error) {
      console.error('Error filtering by artist:', error);
    }
  };

  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu({ visible: false });
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  const setPlaylistTracks = async (playlistID, tracks) => {
    try {
      await fetchPlaylistDetails(playlistID);

      const response = await axios.put(`/api/playlists/${playlistID}`, {
        name: "", // Playlist name is not needed for update
        entries: tracks
      });
      
      // Refresh playlist data
      await fetchPlaylists();
      await fetchPlaylistDetails(playlistID);
    } catch (error) {
      console.error('Error adding tracks:', error);
      setSnackbar({
        open: true, 
        message: `Failed to add tracks: ${error.message}`,
        severity: 'error'
      });
    }
  };

  const addTracksToPlaylist = async (playlistID, tracks) => {
    await fetchPlaylistDetails(playlistID);

    const tracksToAdd = Array.isArray(tracks) ? tracks : [tracks];

    // add tracks to entries
    const entries = [
      ...selectedPlaylist.entries, 
      ...tracksToAdd.map((s, idx) => ({
        order: idx + selectedPlaylist.entries.length, music_file_id: s.id, 
        entry_type: s.entry_type, url: s.url, details: s
      }))]

    setPlaylistTracks(playlistID, entries);

    const playlistName = playlists.find(p => p.id === playlistID)?.name || 'the playlist';
      
    // Show success message
    setSnackbar({
      open: true,
      message: `Added ${tracksToAdd.length} tracks to ${playlistName}`,
      severity: 'success'
    });
  };

  return (
    <div className="playlists-container" onClick={() => setContextMenu({ visible: false })}>
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
            <button onClick={purgeData}>Purge Data</button>
          </div>
        )}
      </div>
      <div className="editor-panel">
        <DragDropContext onDragEnd={onDragEnd}>
          {selectedPlaylist && (
            <div>
              <h2>{selectedPlaylist.name}</h2>

              {selectedPlaylistEntries.length > 0 && (
                <div className="batch-actions">
                  <button onClick={removeSelectedTracks}>
                    Remove {selectedPlaylistEntries.length} Selected Tracks
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
                        checked={allPlaylistEntriesSelected}
                        onChange={toggleAllTracks}
                      />
                    </div>
                    <div className="playlist-grid-header">Source</div>
                    <div className="playlist-grid-header">Artist</div>
                    <div className="playlist-grid-header">Album</div>
                    <div className="playlist-grid-header">Title</div>
                    <div className="playlist-grid-header">Genres</div>
                    <div className="playlist-grid-header">Actions</div>

                    {playlistEntries.map((track, index) => (
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
                                checked={selectedPlaylistEntries.includes(index)}
                                onChange={() => toggleTrackSelection(index)}
                              />
                            </div>
                            <EntryTypeBadge className="playlist-grid-item" type={track.entry_type} />
                            <div className="playlist-grid-item">{track.artist ? track.artist : track.album_artist}</div>
                            <div className="playlist-grid-item">{track.album}</div>
                            <div 
                              className="playlist-grid-item clickable" 
                              onClick={() => handleShowTrackDetails(track)}
                              onContextMenu={(e) => handleContextMenu(e, track)}
                            >
                              {track.title}
                            </div>
                            <div className="playlist-grid-item">{track.genres?.join(', ')}</div>
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

          {selectedSearchResults.length > 0 && (
            <div className="batch-actions">
              <button onClick={handleAddSelectedToPlaylist}>
                Add {selectedSearchResults.length} Selected to Playlist
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
                <div {...provided.droppableProps} ref={provided.innerRef} className="search-result-grid">
                  <div className="playlist-grid">
                    <input
                      type="checkbox"
                      checked={allSearchResultsSelected}
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
                              checked={selectedSearchResults.some(s => s.id === song.id)}
                              onChange={() => toggleSongSelection(song)}
                            />
                          </div>
                          <div className="playlist-grid-item">{song.artist ? song.artist : song.album_artist}</div>
                          <div className="playlist-grid-item">{song.album}</div>
                          <div className="playlist-grid-item" onClick={() => handleShowTrackDetails(song)} onContextMenu={(e) => handleContextMenu(e, song)}>{song.title}</div>
                          <div className="playlist-grid-item">{song.genres?.join(', ')}</div>
                          <div className="playlist-grid-item">
                            <button onClick={(e) => handleAddSongToPlaylist(song)}>Add to Playlist</button>
                            <button onClick={(e) => handleContextMenu(e, song)}>More</button>
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
        <button onClick={() => setShowLastFMSearch(true)}>
          Search Last.FM
        </button>

        {showLastFMSearch && (
          <LastFMSearch
            onClose={() => setShowLastFMSearch(false)}
            onAddToPlaylist={(track) => {
              setSongToAdd(track);
              setShowPlaylistSelectModal(true);
              setShowLastFMSearch(false);
            }}
          />
        )}
      </div>
      {showPlaylistSelectModal && (
        <PlaylistModal
          playlists={playlists}
          onClose={() => setShowPlaylistSelectModal(false)}
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
      {showTrackDetails && (
        <TrackDetailsModal
          track={selectedTrack}
          onClose={() => setShowTrackDetails(false)}
        />
      )}
      {contextMenu.visible && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          track={contextMenu.track}
          onClose={() => setContextMenu({ visible: false })}
          onFilterByAlbum={handleFilterByAlbum}
          onFilterByArtist={handleFilterByArtist}
          onAddTracks={(tracks) => addTracksToPlaylist(selectedPlaylist.id, tracks)}
        />
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