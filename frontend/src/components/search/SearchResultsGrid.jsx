import React, {useState, useEffect, useCallback} from 'react';
import { Droppable, Draggable } from 'react-beautiful-dnd';
import '../../styles/SearchResultsGrid.css';
import mapToTrackModel from '../../lib/mapToTrackModel';
import axios from 'axios';
import debounce from 'lodash/debounce';
import { ClipLoader } from 'react-spinners';
import TrackDetailsModal from '../TrackDetailsModal';
import LastFMSearch from '../search/LastFMSearch';``
import ContextMenu from '../search/ContextMenu';

const SearchResultsGrid = ({ filter, onAddSongs }) => {
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedSearchResults, setSelectedSearchResults] = useState([]);
  const [selectedPlaylistEntries, setSelectedPlaylistEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [allSearchResultsSelected, setAllSongsSelected] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [showTrackDetails, setShowTrackDetails] = useState(false);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, track: null });
  const [showLastFMSearch, setShowLastFMSearch] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [songToAdd, setSongToAdd] = useState(null);

  const extractSearchResults = (response) => {
    const results = response.data.map(s => mapToTrackModel({...s, music_file_id: s.id, entry_type: "music_file"}));
    return results;
  }

  const fetchSongs = async (query = '') => {
    if (query.length < 3) {
      return;
    }
    setIsLoading(true);
    try {
      const response = await axios.get(`/api/search`, {
        params: { 
          query: encodeURIComponent(query),
          limit: 50  // Optional: limit results 
        }
      });

      setSearchResults(extractSearchResults(response));
      
    } catch (error) {
      console.error('Error fetching songs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  
  const filteredSongs = searchResults;

  const handleFilterByAlbum = async (album) => {
    setContextMenu({ visible: false });
    setFilterQuery("");
    try {
      const response = await axios.get(`/api/filter`, {
        params: { album }
      });
      
      setSearchResults(extractSearchResults(response));

    } catch (error) {
      console.error('Error filtering by album:', error);
    }
  };

  const handleFilterByArtist = async (artist) => {
    setContextMenu({ visible: false });
    setFilterQuery("");
    
    try {
      const response = await axios.get(`/api/filter`, {
        params: { artist }
      });

      setSearchResults(extractSearchResults(response));
    } catch (error) {
      console.error('Error filtering by artist:', error);
    }
  };

  const toggleSongSelection = (song) => {
    setSelectedSearchResults(prev => {
      const newSelection = prev.some(s => s.id === song.id)
        ? prev.filter(s => s.id !== song.id)
        : [...prev, song];
      setAllSongsSelected(newSelection.length === searchResults.length);
      return newSelection;
    });
  };

  const clearSelectedSongs = () => {
    setSelectedSearchResults([]);
  };

  const handleAddSelectedToPlaylist = () => {
    setSongToAdd(selectedSearchResults);
    setShowPlaylistSelectModal(true);
  };

  const toggleAllSongs = () => {
    if (allSearchResultsSelected) {
      setSelectedSearchResults([]);
    } else {
      setSelectedSearchResults(searchResults);
    }
    setAllSongsSelected(!allSearchResultsSelected);
  };

  // Create debounced version of fetchSongs
  const debouncedFetchSongs = useCallback(
    debounce((query) => fetchSongs(query), 300),
    []
  );

  // Update filter handler
  const handleFilterChange = (e) => {
    const query = e.target.value;
    setFilterQuery(query);
    debouncedFetchSongs(query);
  };

  const addSongs = () => {
    onAddSongs(selectedSearchResults);
  }

  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu({ visible: false });
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [])

  return (
    <div className="search-results-container">
      <h2>Add Songs</h2>

      <div>
      <button onClick={() => setShowLastFMSearch(true)}>
        Search Last.FM
      </button>
      </div>

      <div>
        <input
          type="text"
          placeholder="Search local files..."
          value={filterQuery}
          onChange={handleFilterChange}
        />
        <button onClick={() => setFilterQuery('')}>Clear</button>
      </div>

      <div className="batch-actions" style={{ minHeight: '40px', visibility: selectedSearchResults.length > 0 ? 'visible' : 'hidden' }}>
        <button onClick={addSongs}>
          Add {selectedSearchResults.length} Selected to Playlist
        </button>
        <button onClick={() => clearSelectedSongs()}>
          Clear Selection
        </button>
      </div>

      <div className="search-grid-header-row">
        <div className="grid-cell">
          <input
            type="checkbox"
            checked={allSearchResultsSelected}
            onChange={toggleAllSongs}
          />
        </div>
        <div className="grid-cell">Artist/Album</div>
        <div className="grid-cell">Title</div>
      </div>

          <div className="search-grid-content">
            {filteredSongs.map((song) => (
              <div key={song.id}>
                  <div className="search-grid-row"
                    onClick={() => toggleSongSelection(song)}
                  >
                    <div className="grid-cell">
                      <input 
                        type="checkbox"
                        checked={selectedSearchResults.some(s => s.id === song.id)}
                        readOnly
                      />
                    </div>
                    <div className="grid-cell">
                      <div>{song.artist || song.album_artist}</div>
                      <div><i>{song.album}</i></div>
                    </div>
                    <div className="grid-cell clickable" 
                      onContextMenu={(e) => setContextMenu(e, song)}
                    >
                      {song.missing ? <s>{song.title}</s> : song.title}
                    </div>
                  </div>
                </div>
            ))} 
          </div>

      {showLastFMSearch && (
        <LastFMSearch
          onClose={() => setShowLastFMSearch(false)}
          onAddToPlaylist={(track) => {
            setSongToAdd(track);
            setShowLastFMSearch(false);
          }}
        />
      )}

      {showTrackDetails && (
        <TrackDetailsModal
          track={selectedTrack}
          onClose={() => setShowTrackDetails(false)}
        />
      )}
      {contextMenu.visible && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          track={contextMenu.track}
          onClose={() => setContextMenu({ visible: false })}
          onFilterByAlbum={handleFilterByAlbum}
          onFilterByArtist={handleFilterByArtist}
          onAddTracks={(tracks) => onAddSongs(tracks)}
          onDetails={() => showTrackDetails(contextMenu.track)}
        />
      )}
    </div>
  );
};

export default SearchResultsGrid;