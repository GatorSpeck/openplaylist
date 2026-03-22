import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Playlists from './components/main/Playlists';
import JobNotifications from './components/job/JobNotifications';
import { ThemeProvider } from './contexts/ThemeContext';

function App() {
  return (
    <ThemeProvider>
      <Router>
        <div className="min-h-screen bg-surface text-text dark:bg-surface-dark dark:text-text-dark">
          <Routes>
            <Route path="/" element={<Playlists />} />
            <Route path="/playlist/:playlistName" element={<Playlists />} />
          </Routes>
          <JobNotifications />
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App;