import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Playlists from './components/main/Playlists';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Playlists />} />
        <Route path="/playlist/:playlistName" element={<Playlists />} />
      </Routes>
    </Router>
  );
}

export default App;