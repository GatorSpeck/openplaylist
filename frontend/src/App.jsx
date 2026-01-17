import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Playlists from './components/main/Playlists';
import JobTrackerFab from './components/job/JobTrackerFab';
import JobNotifications from './components/job/JobNotifications';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Playlists />} />
        <Route path="/playlist/:playlistName" element={<Playlists />} />
      </Routes>
      <JobTrackerFab />
      <JobNotifications />
    </Router>
  );
}

export default App;