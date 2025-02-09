import React, {
   useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { DragDropContext } from 'react-beautiful-dnd';
import { ClipLoader } from 'react-spinners';
import PlaylistModal from './PlaylistModal';
import '../styles/Playlists.css'; // Import the CSS file for styling
import debounce from 'lodash/debounce';
import TrackDetailsModal from './TrackDetailsModal';
import LastFMSearch from './LastFMSearch';``
import ContextMenu from './ContextMenu';
import Snackbar from './Snackbar';
import SearchResultsGrid from './SearchResultsGrid';
import PlaylistGrid from './PlaylistGrid';
import PlaylistSidebar from './PlaylistSidebar';

const Playlists = () => {
  const [playlists, setPlaylists] = useState([]);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [selectedPlaylistID, setSelectedPlaylistID] = useState(null);
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [libraryStats, setLibraryStats] = useState({
    visible: false,
    trackCount: 0,
    albumCount: 0,
    artistCount: 0,
    totalLength: 0,
    missingTracks: 0
  });

  const handleSnackbarClose = () => {
    setSnackbar(prev => ({ ...prev, open: false }));
  };

  useEffect(() => {
    fetchPlaylists();
    fetchSongs();
  }, []);

  const secondsToDaysHoursMins = (seconds) => {
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor(seconds % (3600 * 24) / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    return `${days} days, ${hours} hours, ${minutes} minutes`;
  }

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
      title: detailsToUse.title || null,
      artist: detailsToUse.artist || null,
      album: detailsToUse.album || null,
      album_artist: detailsToUse.album_artist || null,
      year: detailsToUse.year || null,
      length: detailsToUse.length || 0,
      genres: detailsToUse.genres || [],
      path: detailsToUse.path,
      publisher: detailsToUse.publisher || null,
      kind: detailsToUse.kind,
      music_file_id: item.music_file_id || null,
      entry_type: item.entry_type,
      order: item.order || 0,
      missing: detailsToUse.missing || false
    }
  };

  const extractSearchResults = (response) => {
    const results = response.data.map(s => mapToTrackModel({...s, music_file_id: s.id, entry_type: "music_file"}));
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
      const updatedPlaylists = playlists.map(playlist => 
        playlist.id === playlistId 
          ? { ...playlist, entries: response.data.entries.map(entry => mapToTrackModel(entry)) }
          : playlist
      );

      setPlaylists(updatedPlaylists);
    } catch (error) {
      console.error('Error fetching playlist details:', error);
    }
  };

  // TODO
  const createPlaylist = async () => {
    const songs = songToAdd || [];
    console.log(songs);
    try {
      const response = await axios.post(`/api/playlists`, {
        name: newPlaylistName,
        entries: songs.map((s, idx) => mapToTrackModel({...s, order: idx}))
      });

      setPlaylists([...playlists, response.data]);
      setNewPlaylistName('');
    } catch (error) {
      console.error('Error creating playlist:', error);
    }
  };

  const onRemoveByAlbum = async (album) => {
    const thisPlaylist = playlists.find(p => p.id === selectedPlaylistID);
    const updatedEntries = thisPlaylist.entries.filter(entry => entry.album === album).map(entry => entry.order);

    removeSongsFromPlaylist(updatedEntries);
  }

  const onRemoveByArtist = async (artist) => {
    const thisPlaylist = playlists.find(p => p.id === selectedPlaylistID);
    const updatedEntries = thisPlaylist.entries.filter(entry => entry.artist === artist).map(entry => entry.order);

    removeSongsFromPlaylist(updatedEntries);
  }

  const deletePlaylist = async (playlistId) => {
    if (window.confirm('Are you sure you want to delete this playlist?')) {
      try {
        await axios.delete(`/api/playlists/${playlistId}`);
        setPlaylists(playlists.filter(playlist => playlist.id !== playlistId));
        if (selectedPlaylistID && selectedPlaylistID === playlistId) {
          setSelectedPlaylistID(null);
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

  const removeSongsFromPlaylist = async (indexes) => {
    if (!selectedPlaylistID) {
      alert('Please select a playlist first.');
      return;
    }

    const selectedPlaylist = playlists.find(p => p.id === selectedPlaylistID);

    try {
      const updatedEntries = selectedPlaylist.entries.filter((e) => !indexes.includes(e.order));

      const entriesToDelete = selectedPlaylist.entries.length - updatedEntries.length;
      if ((entriesToDelete > 1) && !window.confirm(`Are you sure you want to remove ${entriesToDelete} entries from the playlist?`)) {
        return;
      }

      await writePlaylistToDB(selectedPlaylist.id, updatedEntries);

      setSnackbar({
        open: true,
        message: `Removed ${entriesToDelete} tracks from ${selectedPlaylist.name}`,
        severity: 'success'
      });

      clearTrackSelection();
    } catch (error) {
      console.error('Error removing songs from playlist:', error);
    }
  }

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

  const onSyncToPlex = async (playlistId) => {
    try {
      await axios.get(`/api/playlists/${playlistId}/synctoplex`);
      
      const thisPlaylist = playlists.find(p => p.id === playlistId);
      setSnackbar({
        open: true,
        message: `'${thisPlaylist.name}' synced to Plex`
      })
    } catch (error) {
      console.error('Error exporting playlist:', error);
    }
  };

  const scanMusic = async (full) => {
    setIsScanning(true);
    try {
      const URI = full ? '/api/fullscan' : '/api/scan';
      await axios.get(URI);

      setSnackbar({
        open: true,
        message: 'Scan completed successfully',
        severity: 'success'
      });

      fetchSongs(); // Reload the tracks data

      const stats = await axios.get('/api/stats');
      setLibraryStats({...stats.data, visible: true});
    } catch (error) {
      console.error('Error scanning music:', error);
      alert('Error scanning music.');
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

      setSnackbar({
        open: true,
        message: 'Data purged successfully',
        severity: 'success'
      });
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
    const songList = songToAdd ? (Array.isArray(songToAdd) ? songToAdd : [songToAdd]) : [];
    console.log(songList);
    try {
      const response = await axios.post(`/api/playlists`, {
        name: newPlaylistNameModal,
        entries: songList.map((s, idx) => mapToTrackModel({...s, order: idx}))
      });

      setPlaylists([...playlists, response.data]);

      setNewPlaylistNameModal('');
      setShowPlaylistSelectModal(false);
      setSongToAdd(null);
      setNewPlaylistModalVisible(false);
      
      showPlaylistDetails(response.data.id);
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

    let thisPlaylist = playlists.find(p => p.id === selectedPlaylistID);

    // If dragging within playlist
    if (source.droppableId === 'playlist' && destination.droppableId === 'playlist') {
      const updatedTracks = Array.from(thisPlaylist.entries);
      const [movedTrack] = updatedTracks.splice(source.index, 1);
      updatedTracks.splice(destination.index, 0, movedTrack);
      
      const updatedEntries = updatedTracks.map((track, index) => ({
        ...track,
        order: index,
      }));

      // update playlist state
      thisPlaylist.entries = updatedEntries;
      setPlaylists(playlists.map(p => p.id === selectedPlaylistID ? thisPlaylist : p));

      writePlaylistToDB(selectedPlaylistID, updatedEntries);
    }
    
    // If dragging from songs to playlist
    if (source.droppableId === 'search-results' && destination.droppableId === 'playlist') {
      const song = filteredSongs[source.index];
      addSongToPlaylist(song, selectedPlaylistID);
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

  const toggleTrackSelection = (index) => {
    const thisPlaylist = playlists.find(p => p.id === selectedPlaylistID);

    setSelectedPlaylistEntries(prev => {
      const newSelection = prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index];
      setAllTracksSelected(newSelection.length === thisPlaylist.entries.length);
      return newSelection;
    });
  };

  const showPlaylistDetails = (index) => {
    setSelectedPlaylistID(index);
    fetchPlaylistDetails(index);
  }

  const clearTrackSelection = () => {
    setSelectedPlaylistEntries([]);
  };

  const removeSelectedTracks = async () => {
    if (!selectedPlaylistID || selectedPlaylistEntries.length === 0) return;

    const selectedPlaylist = playlists.find(p => p.id === selectedPlaylistID);

    if (selectedPlaylistEntries.length > 1 && !window.confirm(`Are you sure you want to remove ${selectedPlaylistEntries.length} entries from the playlist?`)) {
      return;
    }

    try {
      const remainingEntries = selectedPlaylist.entries.filter((t) => 
        !selectedPlaylistEntries.includes(t.order)
      ).map((entry, index) => ({
        ...entry,
        order: index
      }));

      writePlaylistToDB(selectedPlaylist.id, remainingEntries);

      const playlistName = playlists.find(p => p.id === selectedPlaylistID)?.name || 'the playlist';
      
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
    const thisPlaylist = playlists.find(p => p.id === selectedPlaylistID);
    if (allPlaylistEntriesSelected) {
      setSelectedPlaylistEntries([]);
    } else {
      setSelectedPlaylistEntries(thisPlaylist.entries.map((_, index) => index));
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
    scanMusic(false);

    const handleClickOutside = () => {
      setContextMenu({ visible: false });
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  const writePlaylistToDB = async (playlistID, tracks) => {
    try {
      await fetchPlaylistDetails(playlistID);

      await axios.put(`/api/playlists/${playlistID}`, {
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

    const selectedPlaylist = playlists.find(p => p.id === playlistID);

    console.log(tracks);

    // add tracks to entries
    const entries = [
      ...selectedPlaylist.entries, 
      ...tracksToAdd.map((s, idx) => ({
        order: idx + selectedPlaylist.entries.length, music_file_id: s.id, 
        entry_type: s.entry_type, url: s.url, details: s
      }))]

    writePlaylistToDB(playlistID, entries);

    const playlistName = playlists.find(p => p.id === playlistID)?.name || 'the playlist';
      
    // Show success message
    setSnackbar({
      open: true,
      message: `Added ${tracksToAdd.length} tracks to ${playlistName}`,
      severity: 'success'
    });
  };

  const handleRenamePlaylist = async (id, newName) => {
    try {
      await axios.post(`/api/playlists/rename/${id}`, { new_name: newName, description: "" });
      setPlaylists(playlists.map(p => 
        p.id === id ? { ...p, name: newName } : p
      ));
      
    } catch (error) {
      
    }
  };

  const selectedPlaylist = playlists.find(p => p.id === selectedPlaylistID);

  return (
    <div className="playlists-container">
      <PlaylistSidebar
        isOpen={sidebarOpen}
        onClose={setSidebarOpen}
        playlists={playlists}
        selectedPlaylist={selectedPlaylist}
        onPlaylistSelect={(id) => showPlaylistDetails(id)}
        onNewPlaylist={() => setNewPlaylistModalVisible(true)}
        onClonePlaylist={handleClonePlaylist}
        onDeletePlaylist={deletePlaylist}
        onScan={() => scanMusic(false)}
        onFullScan={() => scanMusic(true)} 
        onPurge={purgeData}
        onExport={exportPlaylist}
        onSyncToPlex={onSyncToPlex}
        onRenamePlaylist={handleRenamePlaylist}
      />
      
      <div className="editor-panel">
        <DragDropContext onDragEnd={onDragEnd}>
          {selectedPlaylist && (
            <PlaylistGrid
              playlist={selectedPlaylist}
              playlistEntries={selectedPlaylist.entries}
              selectedEntries={selectedPlaylistEntries}
              allEntriesSelected={allPlaylistEntriesSelected}
              onToggleAll={toggleAllTracks}
              onToggleEntry={toggleTrackSelection}
              onContextMenu={handleContextMenu}
              onRemove={removeSelectedTracks}
              onClear={clearTrackSelection}
            />
          )}

          <h2>Add Songs</h2>

          <div>
          <button onClick={() => setShowLastFMSearch(true)}>
            Search Last.FM
          </button>
          </div>

          <div>
            <input
              type="text"
              placeholder="Search local files..."
              value={filterQuery}
              onChange={handleFilterChange}
            />
            <button onClick={() => setFilterQuery('')}>Clear</button>
          </div>

          <div className="batch-actions" style={{ minHeight: '40px', visibility: selectedSearchResults.length > 0 ? 'visible' : 'hidden' }}>
            <button onClick={handleAddSelectedToPlaylist}>
              Add {selectedSearchResults.length} Selected to Playlist
            </button>
            <button onClick={clearSelectedSongs}>
              Clear Selection
            </button>
          </div>

          <SearchResultsGrid
            isLoading={isLoading}
            filteredSongs={filteredSongs}
            selectedSearchResults={selectedSearchResults}
            allSearchResultsSelected={allSearchResultsSelected}
            onToggleAll={toggleAllSongs}
            onToggleSelection={toggleSongSelection}
            onContextMenu={handleContextMenu}
          />

        </DragDropContext>

        {libraryStats.visible && (
          <div>
            <h2>Library Stats</h2>
            <p>{libraryStats.trackCount} tracks</p>
            <p>{libraryStats.albumCount} albums</p>
            <p>{libraryStats.artistCount} artists</p>
            <p>{secondsToDaysHoursMins(libraryStats.totalLength)} total length</p>
            <p>{libraryStats.missingTracks} missing tracks</p>
          </div>
        )}
        
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
          onRemove={() => removeSongsFromPlaylist([contextMenu.track.order])}
          onFilterByAlbum={handleFilterByAlbum}
          onFilterByArtist={handleFilterByArtist}
          onAddTracks={(tracks) => addTracksToPlaylist(selectedPlaylist.id, tracks)}
          onRemoveByAlbum={onRemoveByAlbum}
          onRemoveByArtist={onRemoveByArtist}
          onDetails={() => handleShowTrackDetails(contextMenu.track)}
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