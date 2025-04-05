import React, { useState, useEffect } from 'react';
import LastFMRepository from '../../repositories/LastFMRepository';
import '../../styles/LastFMSearch.css';

const LastFMSearch = ({ initialSearch = {}, onClose, onAddToPlaylist }) => {
  const [searchParams, setSearchParams] = useState({
    title: initialSearch.title || '',
    artist: initialSearch.artist || '',
    album: initialSearch.album || ''
  });
  
  const [searchType, setSearchType] = useState('track');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedResults, setSelectedResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Use effect to trigger search automatically if initialSearch has values
  useEffect(() => {
    if (initialSearch.title || initialSearch.artist || initialSearch.album) {
      // Auto-search when component loads with initial values
      handleSearch();
    }
  }, []);

  const handleSearch = async () => {
    setIsLoading(true);
    setError(null);
    setSelectedResults([]);
    
    try {
      let results = [];
      if (searchType === 'track') {
        results = await LastFMRepository.searchTrack(searchParams.title, searchParams.artist);
      } else {
        results = await LastFMRepository.searchAlbum(searchParams.title, searchParams.artist);
      }
        
      if (!results || results.length === 0) {
        setError('No results found');
        setSearchResults([]);
        return;
      }

      results = results.map((result, idx) => ({...result, id: idx}));

      setSearchResults(results);
    } catch (error) {
      setError(error.message);
      console.error('Error fetching Last.FM data:', error);
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleResultSelection = (result) => {
    if (selectedResults.some(item => item.id === result.id)) {
      setSelectedResults(selectedResults.filter(item => item.id !== result.id));
    } else {
      setSelectedResults([...selectedResults, result]);
    }
  };

  const selectAll = () => {
    setSelectedResults([...searchResults]);
  };

  const clearSelection = () => {
    setSelectedResults([]);
  };

  const handleAddToPlaylist = () => {
    if (selectedResults.length > 0) {
      console.log('Adding to playlist:', selectedResults);
      onAddToPlaylist(selectedResults);
      onClose();
    }
  };

  return (
    <div className="lastfm-modal">
      <div className="lastfm-modal-content">
        <h2>Search Last.FM</h2>
        <div className="search-type">
          <label>
            <input
              type="radio"
              value="track"
              checked={searchType === 'track'}
              onChange={(e) => setSearchType(e.target.value)}
            />
            Track
          </label>
          <label>
            <input
              type="radio"
              value="album"
              checked={searchType === 'album'}
              onChange={(e) => setSearchType(e.target.value)}
            />
            Album
          </label>
        </div>
        <div className="search-inputs">
          <input
            type="text"
            placeholder={searchType === 'track' ? 'Track Title' : 'Album Title'}
            value={searchParams.title}
            onChange={(e) => setSearchParams({...searchParams, title: e.target.value})}
          />
          <input
            type="text"
            placeholder="Artist"
            value={searchParams.artist}
            onChange={(e) => setSearchParams({...searchParams, artist: e.target.value})}
          />
          <button onClick={handleSearch} disabled={isLoading}>
            Search
          </button>
        </div>

        {isLoading && <div className="loading">Searching...</div>}
        {error && <div className="error">{error}</div>}
        
        {searchResults.length > 0 && (
          <div className="search-results">
            <div className="results-header">
              <h3>Search Results</h3>
              <div className="selection-actions">
                <button onClick={selectAll}>Select All</button>
                <button onClick={clearSelection}>Clear Selection</button>
              </div>
            </div>
            
            <div className="results-count">
              Found {searchResults.length} {searchType === 'track' ? 'tracks' : 'albums'} • 
              Selected: {selectedResults.length}
            </div>
            
            <div className="results-list">
              {searchResults.map((result) => {
                const isSelected = selectedResults.some(item => item.id === result.id);
                return (
                  <div 
                    key={result.id || `${result.artist}-${result.title}`}
                    className={`result-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleResultSelection(result)}
                  >
                    <div className="result-checkbox">
                      <input 
                        type="checkbox" 
                        checked={isSelected}
                        onChange={() => toggleResultSelection(result)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="result-art">
                      {result.art_url && <img src={result.art_url} alt={result.title} />}
                    </div>
                    <div className="result-info">
                      <h4>{result.title}</h4>
                      <p>Artist: {result.artist}</p>
                      {result.album && <p>Album: {result.album}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="results-actions">
              <button 
                onClick={handleAddToPlaylist}
                disabled={selectedResults.length === 0}
              >
                Add {selectedResults.length} {searchType === 'track' ? 'Track' : 'Album'}
                {selectedResults.length !== 1 ? 's' : ''} to Playlist
              </button>
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default LastFMSearch;