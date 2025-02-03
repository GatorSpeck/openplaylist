import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import PlaylistModal from './PlaylistModal';
import './Playlists.css'; // Import the CSS file for styling

console.log('API URL:', import.meta.env.VITE_API_URL);

const Playlists = () => {
  const [playlists, setPlaylists] = useState([]);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [songs, setSongs] = useState([]);
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedPlaylistForTrack, setSelectedPlaylistForTrack] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [songToAdd, setSongToAdd] = useState(null);

  useEffect(() => {
    fetchPlaylists();
    fetchSongs();
  }, []);

  const fetchPlaylists = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/playlists`);
      setPlaylists(response.data);
    } catch (error) {
      console.error('Error fetching playlists:', error);
    }
  };

  const fetchSongs = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/music`);
      setSongs(response.data);
    } catch (error) {
      console.error('Error fetching songs:', error);
    }
  };

  const fetchPlaylistDetails = async (playlistId) => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/playlists/${playlistId}`);
      setSelectedPlaylist(response.data);
      setTracks(response.data.entries);
    } catch (error) {
      console.error('Error fetching playlist details:', error);
    }
  };

  const createPlaylist = async () => {
    try {
      const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/playlists`, {
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
        await axios.delete(`${import.meta.env.VITE_API_URL}/api/playlists/${playlistId}`);
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

  const addSongToPlaylist = async (song, playlistId) => {
    console.log(tracks);
    const isDuplicate = tracks.some(track => track.id === song.id);
    if (isDuplicate) {
      const confirmAdd = window.confirm('This song is already in the playlist. Do you want to add it again?');
      if (!confirmAdd) {
        return;
      }
    }

    console.log(song);

    const updatedTracks = [...tracks, { order: tracks.length, music_file_id: song.id }];
    console.log(updatedTracks);
    setTracks(updatedTracks);

    const playlist = playlists.find(playlist => playlist.id === playlistId);
    playlist.entries = updatedTracks;
    console.log(playlist);

    try {
      await axios.put(`${import.meta.env.VITE_API_URL}/api/playlists/${playlistId}`, playlist );
      fetchPlaylistDetails(playlistId);
    } catch (error) {
      console.error('Error adding song to playlist:', error);
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
      const response = await axios.put(`${import.meta.env.VITE_API_URL}/api/playlists/${selectedPlaylist.id}`, {
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
      const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/playlists/${playlistId}/export`, {
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
    try {
      await axios.get(`${import.meta.env.VITE_API_URL}/api/scan`);
      alert('Music scan completed successfully.');
      fetchSongs(); // Reload the tracks data
    } catch (error) {
      console.error('Error scanning music:', error);
      alert('Error scanning music.');
    }
  };

  const fullScanMusic = async () => {
    try {
      await axios.get(`${import.meta.env.VITE_API_URL}/api/fullscan`);
      alert('Full music scan completed successfully.');
      fetchSongs(); // Reload the tracks data
    } catch (error) {
      console.error('Error performing full scan:', error);
      alert('Error performing full scan.');
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

  const filteredSongs = songs.filter(song =>
    song.title.toLowerCase().includes(filterQuery.toLowerCase()) ||
    song.artist.toLowerCase().includes(filterQuery.toLowerCase()) ||
    song.album.toLowerCase().includes(filterQuery.toLowerCase())
  );

  const onDragEnd = async (result) => {
    if (!result.destination) return;

    const updatedTracks = Array.from(tracks);
    const [movedTrack] = updatedTracks.splice(result.source.index, 1);
    updatedTracks.splice(result.destination.index, 0, movedTrack);

    setTracks(updatedTracks);

    // Update the order of the tracks in the playlist
    const updatedEntries = updatedTracks.map((track, index) => ({
      ...track,
      order: index,
    }));

    try {
      await axios.put(`${import.meta.env.VITE_API_URL}/api/playlists/${selectedPlaylist.id}`, {
        name: selectedPlaylist.name,
        entries: updatedEntries,
      });
      fetchPlaylistDetails(selectedPlaylist.id);
    } catch (error) {
      console.error('Error updating playlist order:', error);
    }
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

        <button onClick={scanMusic}>Scan Music</button>
        <button onClick={fullScanMusic}>Full Scan Music</button>
      </div>
      <div className="editor-panel">
        {selectedPlaylist && (
          <div>
            <h2>{selectedPlaylist.name}</h2>
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="tracks">
                {(provided) => (
                  <div className="playlist-grid" {...provided.droppableProps} ref={provided.innerRef}>
                    <div className="playlist-grid-header">#</div>
                    <div className="playlist-grid-header">Title</div>
                    <div className="playlist-grid-header">Artist</div>
                    <div className="playlist-grid-header">Actions</div>
                    
                    {tracks && tracks.map((track, index) => (
                      <Draggable key={index} draggableId={index.toString()} index={index}>
                        {(provided) => (
                          <React.Fragment key={index}>
                            <div className="playlist-grid-item" ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}>{index + 1}</div>
                            <div className="playlist-grid-item">{track.music_file_details?.title || 'Unknown Title'}</div>
                            <div className="playlist-grid-item">{track.music_file_details?.artist || 'Unknown Artist'}</div>
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
            </DragDropContext>
          </div>
        )}

        <h2>Songs</h2>
        <input
          type="text"
          placeholder="Filter songs"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
        />
        <div className="playlist-grid">
          <div className="playlist-grid-header">ID</div>
          <div className="playlist-grid-header">Title</div>
          <div className="playlist-grid-header">Artist</div>
          <div className="playlist-grid-header">Actions</div>
          
          {filteredSongs.map((song) => (
            <React.Fragment key={song.id}>
              <div className="playlist-grid-item">{song.id}</div>
              <div className="playlist-grid-item">{song.title || 'Unknown Title'}</div>
              <div className="playlist-grid-item">{song.artist || 'Unknown Artist'}</div>
              <div className="playlist-grid-item">
                <button onClick={() => handleAddToPlaylist(song)}>Add to Playlist</button>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
      {showModal && (
        <PlaylistModal
          playlists={playlists}
          onClose={() => setShowModal(false)}
          onSelect={handleSelectPlaylist}
        />
      )}
    </div>
  );
};

export default Playlists;