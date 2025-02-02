import React, { useState, useEffect } from 'react';
import axios from 'axios';
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
      setTracks(response.data.music_files);
    } catch (error) {
      console.error('Error fetching playlist details:', error);
    }
  };

  const createPlaylist = async () => {
    try {
      const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/playlists`, {
        name: newPlaylistName,
        music_file_paths: []
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

  const addSongToPlaylist = async (songPath) => {
    if (!selectedPlaylistForTrack) {
      alert('Please select a playlist first.');
      return;
    }

    try {
      // Fetch the latest details of the selected playlist
      const playlistResponse = await axios.get(`${import.meta.env.VITE_API_URL}/api/playlists/${selectedPlaylistForTrack}`);
      const foundPlaylist = playlistResponse.data;

      if (!foundPlaylist) {
        alert('Selected playlist not found.');
        return;
      }

      const musicFilePaths = foundPlaylist.music_files ? foundPlaylist.music_files.map(file => file.path) : [];

      // Add the new song to the list of music file paths
      const updatedMusicFilePaths = [...musicFilePaths, songPath];

      // Update the playlist with the new list of music file paths
      const response = await axios.put(`${import.meta.env.VITE_API_URL}/api/playlists/${selectedPlaylistForTrack}`, {
        name: foundPlaylist.name,
        music_file_paths: updatedMusicFilePaths
      });

      // Update the selected playlist and tracks if it is the currently selected playlist
      if (selectedPlaylist && selectedPlaylist.id === parseInt(selectedPlaylistForTrack, 10)) {
        setSelectedPlaylist(response.data);
        setTracks(response.data.music_files);
      }
    } catch (error) {
      console.error('Error adding song to playlist:', error);
    }
  };

  const removeSongFromPlaylist = async (songPath) => {
    if (!selectedPlaylist) {
      alert('Please select a playlist first.');
      return;
    }

    try {
      // Remove the song from the list of music file paths
      const updatedMusicFilePaths = selectedPlaylist.music_files
        .filter(file => file.path !== songPath)
        .map(file => file.path);

      // Update the playlist with the new list of music file paths
      const response = await axios.put(`${import.meta.env.VITE_API_URL}/api/playlists/${selectedPlaylist.id}`, {
        name: selectedPlaylist.name,
        music_file_paths: updatedMusicFilePaths
      });

      // Update the selected playlist and tracks
      setSelectedPlaylist(response.data);
      setTracks(response.data.music_files);
    } catch (error) {
      console.error('Error removing song from playlist:', error);
    }
  };

  const filteredSongs = songs.filter(song =>
    song.title.toLowerCase().includes(filterQuery.toLowerCase()) ||
    song.artist.toLowerCase().includes(filterQuery.toLowerCase()) ||
    song.album.toLowerCase().includes(filterQuery.toLowerCase())
  );

  return (
    <div className="playlists-container">
      <div className="playlists-panel">
        <h1>Playlists</h1>
        <ul>
          {playlists.map(playlist => (
            <li key={playlist.id}>
              <span onClick={() => fetchPlaylistDetails(playlist.id)}>{playlist.name}</span>
              <button onClick={() => deletePlaylist(playlist.id)}>Delete</button>
            </li>
          ))}
        </ul>
        <h2>Create New Playlist</h2>
        <button onClick={createPlaylist}>Create Playlist</button>
        <input
          type="text"
          placeholder="Playlist Name"
          value={newPlaylistName}
          onChange={(e) => setNewPlaylistName(e.target.value)}
        />
      </div>
      <div className="editor-panel">
        {selectedPlaylist && (
          <div>
            <h2>{selectedPlaylist.name}</h2>
            <ul>
              {tracks.map(track => (
                <li key={track.path}>
                  {track.title} - {track.artist}
                  <button onClick={() => removeSongFromPlaylist(track.path)}>Remove</button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <h2>All Songs</h2>
        <input
          type="text"
          placeholder="Filter songs"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
        />
        <select
          value={selectedPlaylistForTrack}
          onChange={(e) => setSelectedPlaylistForTrack(e.target.value)}
        >
          <option value="">Select Playlist</option>
          {playlists.map(playlist => (
            <option key={playlist.id} value={playlist.id}>{playlist.name}</option>
          ))}
        </select>
        <ul>
          {filteredSongs.map(song => (
            <li key={song.path}>
              {song.title} - {song.artist}
              <button onClick={() => addSongToPlaylist(song.path)}>Add to Playlist</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default Playlists;