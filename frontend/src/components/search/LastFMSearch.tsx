import React, { useState, useEffect, useRef, useCallback } from 'react';
import LastFMRepository from '../../repositories/LastFMRepository';
import '../../styles/LastFMSearch.css';
import PlaylistEntry from '../lib/PlaylistEntry';

const LastFMSearch = ({ initialSearch = {}, onClose, onAddToPlaylist }) => {
  const [searchParams, setSearchParams] = useState({
    title: initialSearch.title || '',
    artist: initialSearch.artist || '',
    album: initialSearch.album || '',
  });
  
  const [searchType, setSearchType] = useState(initialSearch.type || 'track');
  const [searchResults, setSearchResults] = useState<PlaylistEntry[]>([]);
  const [selectedResults, setSelectedResults] = useState<PlaylistEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const resultsPerPage = 20;
  
  // Ref for scroll container
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Use effect to trigger search automatically if initialSearch has values
  useEffect(() => {
    if (initialSearch.title || initialSearch.artist || initialSearch.album) {
      // Auto-search when component loads with initial values
      handleSearch();
    }
  }, []);

  const handleSearch = async (resetResults = true) => {
    if (resetResults) {
      setIsLoading(true);
      setCurrentPage(1);
      setHasMore(true);
      setSearchResults([]);
    } else {
      setIsLoadingMore(true);
    }
    
    setError(null);
    
    if (resetResults) {
      setSelectedResults([]);
    }
    
    try {
      const pageToLoad = resetResults ? 1 : currentPage;
      let results = [];
      
      if (searchType === 'track') {
        results = await LastFMRepository.searchTrack(
          searchParams.title, 
          searchParams.artist, 
          resultsPerPage, 
          pageToLoad
        );
      } else {
        results = await LastFMRepository.searchAlbum(
          searchParams.album, 
          searchParams.artist, 
          resultsPerPage, 
          pageToLoad
        );
      }
        
      if (!results || results.length === 0) {
        if (resetResults) {
          setError('No results found');
          setSearchResults([]);
        }
        setHasMore(false);
        return;
      }

      // Check if we got fewer results than requested (indicates no more results)
      if (results.length < resultsPerPage) {
        setHasMore(false);
      }

      const resultsWithIds = results.map((result: PlaylistEntry, idx) => {
        const globalIdx = resetResults ? idx : searchResults.length + idx;
        result.id = globalIdx; 
        return result;
      });

      if (resetResults) {
        setSearchResults(resultsWithIds);
      } else {
        setSearchResults(prev => [...prev, ...resultsWithIds]);
      }
      
      if (!resetResults) {
        setCurrentPage(prev => prev + 1);
      }
    } catch (error) {
      setError(error.message);
      console.error('Error fetching Last.FM data:', error);
      if (resetResults) {
        setSearchResults([]);
      }
    } finally {
      if (resetResults) {
        setIsLoading(false);
      } else {
        setIsLoadingMore(false);
      }
    }
  };

  // Load more results
  const loadMore = useCallback(() => {
    if (!isLoadingMore && hasMore && searchResults.length > 0) {
      handleSearch(false);
    }
  }, [isLoadingMore, hasMore, searchResults.length, currentPage]);

  // Scroll handler for infinite scroll
  const handleScroll = useCallback((e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    
    // Load more when user is close to bottom (within 200px)
    if (scrollHeight - scrollTop <= clientHeight + 200) {
      loadMore();
    }
  }, [loadMore]);

  // Trigger new search when search type changes
  useEffect(() => {
    if (searchResults.length > 0) {
      handleSearch(true);
    }
  }, [searchType]);

  const toggleResultSelection = (result: PlaylistEntry) => {
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

  const handleAddToPlaylist = async () => {
    if (selectedResults.length > 0) {
      console.log('Adding to playlist:', selectedResults);
      
      // If we're adding albums, enhance them with detailed release date info
      let resultsToAdd = selectedResults;
      // resultsToAdd = await LastFMRepository.enhanceAlbumsWithDetailedInfo(selectedResults);
      
      onAddToPlaylist(resultsToAdd);
      onClose();
    }
  };

  const titleToShow = searchType === 'track' ? searchParams.title : searchParams.album;

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
            value={titleToShow || ''}
            onChange={(e) => setSearchParams({
              ...searchParams,
              title: searchType === 'track' ? e.target.value : null,
              album: searchType === 'album' ? e.target.value : null,
            })}
          />
          <input
            type="text"
            placeholder="Artist"
            value={searchParams.artist || ''}
            onChange={(e) => setSearchParams({...searchParams, artist: e.target.value})}
          />
          <button onClick={() => handleSearch(true)} disabled={isLoading}>
            {isLoading ? 'Searching...' : 'Search'}
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
              Found {searchResults.length} {searchType === 'track' ? 'tracks' : 'albums'}
              {hasMore ? '+' : ''} • Selected: {selectedResults.length}
            </div>
            
            <div 
              className="results-list"
              ref={scrollContainerRef}
              onScroll={handleScroll}
              style={{ maxHeight: '400px', overflowY: 'auto' }}
            >
              {searchResults.map((result: PlaylistEntry) => {
                const isSelected = selectedResults.some(item => item.id === result.id);
                return (
                  <div 
                    key={result.id || `${result.getArtist()}-${result.getTitle()}`}
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
                      {result.getArtUrl() && <img src={result.getArtUrl()} alt={result.getAlbum()} />}
                    </div>
                    <div className="result-info">
                      <h4>{result.getTitle()}</h4>
                      <p>Artist: {result.getArtist()}</p>
                      {result.getAlbum() && <p>Album: {result.getAlbum()}</p>}
                    </div>
                  </div>
                );
              })}
              
              {isLoadingMore && (
                <div className="loading-more">
                  <div className="loading-spinner">Loading more results...</div>
                </div>
              )}
              
              {!hasMore && searchResults.length > 0 && (
                <div className="no-more-results">
                  <p>No more results available</p>
                </div>
              )}
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