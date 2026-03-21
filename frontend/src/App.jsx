import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Playlists from './components/main/Playlists';
import JobNotifications from './components/job/JobNotifications';
import DarkModeToggle from './components/common/DarkModeToggle';
import { ThemeProvider } from './contexts/ThemeContext';

function App() {
  return (
    <ThemeProvider>
      <Router>
        <div className="min-h-screen bg-surface text-text dark:bg-surface-dark dark:text-text-dark">
          <div className="fixed right-4 top-4 z-50">
            <DarkModeToggle />
          </div>
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