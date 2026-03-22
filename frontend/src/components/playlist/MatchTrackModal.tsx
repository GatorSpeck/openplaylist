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
  const [searchText, setSearchText] = useState(`${track.getArtist() || ''} ${track.getTitle() || ''}`);

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
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Search for more matches..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="min-w-[240px] flex-1 rounded border border-border bg-surface px-3 py-2 text-sm text-text outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-border-dark dark:bg-surface-dark dark:text-text-dark"
          onKeyDown={(e) => e.key === 'Enter' && handleSearch(searchText)}
        />
        <button 
          className="rounded bg-accent px-4 py-2 text-sm font-semibold text-text-dark transition hover:bg-accent-hover"
          onClick={() => handleSearch(searchText)}
        >
          Search
        </button>
      </div>
      <div className="max-h-[45vh] overflow-y-auto rounded border border-border dark:border-border-dark">
        {matchingTracks.map((match) => (
          <div 
            key={match.id}
            className="cursor-pointer border-b border-border px-3 py-2 transition hover:bg-surface-subtle last:border-b-0 dark:border-border-dark dark:hover:bg-surface-dark-elevated"
            onClick={() => onMatchSelect(match)}
          >
            <div className="text-sm font-medium text-text dark:text-text-dark">{match.getArtist()} - {match.getTitle()}</div>
            <div className="text-xs text-text/70 dark:text-text-dark/70">
              Album: {match.getAlbum()} | {match.details.duration ? formatDuration(match.details.duration) : 'Unknown duration'}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <button className="rounded border border-border bg-surface-subtle px-4 py-2 text-sm font-medium text-text transition hover:bg-surface-muted dark:border-border-dark dark:bg-surface-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated" onClick={onClose}>
          Cancel
        </button>
      </div>
      {isLoading && <div className="mt-2 text-sm text-text/70 dark:text-text-dark/70">Searching...</div>}
    </Modal>
  );
};

export default MatchTrackModal;