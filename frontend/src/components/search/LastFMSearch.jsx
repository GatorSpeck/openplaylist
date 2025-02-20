import React, { useState } from 'react';
import LastFMRepository from '../../repositories/LastFMRepository';
import '../../styles/LastFMSearch.css';

const LastFMSearch = ({ onClose, onAddToPlaylist }) => {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [searchType, setSearchType] = useState('track');
  const [searchResult, setSearchResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSearch = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = searchType === 'track' 
        ? await LastFMRepository.searchTrack(title, artist)
        : await LastFMRepository.searchAlbum(title, artist);
      setSearchResult(result);
    } catch (error) {
      setError(error.message);
      console.error('Error fetching Last.FM data:', error);
    } finally {
      setIsLoading(false);
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
            <button onClick={() => onAddToPlaylist(searchResult)}>
              Add {searchResult.entry_type === 'track' ? 'Track' : 'Album'} to Playlist
            </button>
          </div>
        )}

        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
};

export default LastFMSearch;