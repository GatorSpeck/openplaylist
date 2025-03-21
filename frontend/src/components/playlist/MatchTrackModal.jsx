import React, { useState } from 'react';
import Modal from '../common/Modal';
import { formatDuration } from '../../lib/misc';
import libraryRepository from '../../repositories/LibraryRepository';
import PlaylistEntry from '../../lib/PlaylistEntry';

const MatchTrackModal = ({ 
  isOpen, 
  onClose, 
  track, 
  initialMatches = [], 
  onMatchSelect, 
  setSnackbar 
}) => {
  const [matchingTracks, setMatchingTracks] = useState(initialMatches);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async (searchQuery) => {
    if (!searchQuery.trim()) return;
    
    try {
      setIsLoading(true);
      const results = await libraryRepository.searchLibrary(searchQuery);
      
      if (results && results.length > 0) {
        setMatchingTracks(results.map((track) => new PlaylistEntry(track)));
      } else {
        setSnackbar({
          open: true,
          message: `No matches found for "${searchQuery}"`,
          severity: 'warning'
        });
      }
    } catch (error) {
      console.error('Error searching for matches:', error);
      setSnackbar({
        open: true,
        message: `Error searching: ${error.message}`,
        severity: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      title={`Select a match for "${track.getTitle()}"`}
      onClose={onClose}
    >
      <div className="match-search-container">
        <input
          type="text"
          placeholder="Search for more matches..."
          defaultValue={`${track.getArtist() || ''} ${track.getTitle() || ''}`}
          className="match-search-input"
          ref={(input) => input && setTimeout(() => input.select(), 100)}
          onKeyDown={(e) => e.key === 'Enter' && document.getElementById('match-search-button').click()}
        />
        <button 
          id="match-search-button"
          className="match-search-button"
          onClick={(e) => handleSearch(e.target.previousSibling.value)}
        >
          Search
        </button>
      </div>
      <div className="match-selection-list">
        {matchingTracks.map((match) => (
          <div 
            key={match.id}
            className="match-item"
            onClick={() => onMatchSelect(match)}
          >
            <div>{match.getArtist()} - {match.getTitle()}</div>
            <div className="match-details">
              Album: {match.getAlbum()} | {match.details.duration ? formatDuration(match.details.duration) : 'Unknown duration'}
            </div>
          </div>
        ))}
      </div>
      <div className="modal-footer">
        <button onClick={onClose}>
          Cancel
        </button>
      </div>
      {isLoading && <div className="modal-loading">Searching...</div>}
    </Modal>
  );
};

export default MatchTrackModal;