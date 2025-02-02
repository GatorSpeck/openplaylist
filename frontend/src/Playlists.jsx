import React, { useState, useEffect } from 'react';
import axios from 'axios';

console.log('API URL:', import.meta.env.VITE_API_URL);

const Playlists = () => {
  const [playlists, setPlaylists] = useState([]);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistPaths, setNewPlaylistPaths] = useState('');

  useEffect(() => {
    fetchPlaylists();
  }, []);

  const fetchPlaylists = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/playlists`);
      setPlaylists(response.data);
    } catch (error) {
      console.error('Error fetching playlists:', error);
    }
  };

  const createPlaylist = async () => {
    try {
      const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/playlists`, {
        name: newPlaylistName,
        music_file_paths: newPlaylistPaths.split(',').map(path => path.trim())
      });
      setPlaylists([...playlists, response.data]);
      setNewPlaylistName('');
      setNewPlaylistPaths('');
    } catch (error) {
      console.error('Error creating playlist:', error);
    }
  };

  return (
    <div>
      <h1>Playlists</h1>
      <ul>
        {playlists.map(playlist => (
          <li key={playlist.id}>{playlist.name}</li>
        ))}
      </ul>
      <h2>Create New Playlist</h2>
      <input
        type="text"
        placeholder="Playlist Name"
        value={newPlaylistName}
        onChange={(e) => setNewPlaylistName(e.target.value)}
      />
      <input
        type="text"
        placeholder="Music File Paths (comma separated)"
        value={newPlaylistPaths}
        onChange={(e) => setNewPlaylistPaths(e.target.value)}
      />
      <button onClick={createPlaylist}>Create Playlist</button>
    </div>
  );
};

export default Playlists;