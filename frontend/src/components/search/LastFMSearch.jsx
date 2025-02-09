import React, { useState } from 'react';
import axios from 'axios';
import '../../styles/LastFMSearch.css';

const LastFMSearch = ({ onClose, onAddToPlaylist }) => {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSearch = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.get('/api/lastfm', {
        params: { title, artist }
      });

      const search_results = response.data.entry_type = 'lastfm';
      console.log(response.data);
      
      setSearchResult(response.data);
    } catch (error) {
      setError('Failed to fetch track information');
      console.error('Error fetching Last.FM data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="lastfm-modal">
      <div className="lastfm-modal-content">
        <h2>Search Last.FM</h2>
        <div className="search-inputs">
          <input
            type="text"
            placeholder="Track Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            type="text"
            placeholder="Artist"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
          />
          <button onClick={handleSearch} disabled={isLoading}>
            Search
          </button>
        </div>

        {isLoading && <div>Searching...</div>}
        {error && <div className="error">{error}</div>}
        
        {searchResult && (
          <div className="search-result">
            <h3>{searchResult.title}</h3>
            <p>Artist: {searchResult.artist}</p>
            {searchResult.url && (
              <a href={searchResult.url} target="_blank" rel="noopener noreferrer">
                View on Last.FM
              </a>
            )}
            <button onClick={() => onAddToPlaylist(searchResult)}>Add to Playlist</button>
          </div>
        )}

        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
};

export default LastFMSearch;