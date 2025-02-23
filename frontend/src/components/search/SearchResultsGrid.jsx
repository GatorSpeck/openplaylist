import React, {useState, useEffect, useCallback, useRef} from 'react';
import { Droppable, Draggable } from 'react-beautiful-dnd';
import '../../styles/SearchResultsGrid.css';
import mapToTrackModel from '../../lib/mapToTrackModel';
import axios from 'axios';
import debounce from 'lodash/debounce';
import { ClipLoader } from 'react-spinners';
import LastFMSearch from '../search/LastFMSearch';
import playlistRepository from '../../repositories/PlaylistRepository';
import openAIRepository from '../../repositories/OpenAIRepository';
import lastFMRepository from '../../repositories/LastFMRepository';
import libraryRepository from '../../repositories/LibraryRepository';
import ContextMenu from '../common/ContextMenu';
import SimilarTracksPopup from '../common/SimilarTracksPopup';
import TrackDetailsModal from '../common/TrackDetailsModal';

const secondsToDaysHoursMins = (seconds) => {
  const days = Math.floor(seconds / (3600 * 24));
  const hours = Math.floor(seconds % (3600 * 24) / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  return `${days} days, ${hours} hours, ${minutes} minutes`;
}

const SearchResultsGrid = ({ filter, onAddSongs, visible, playlistID, setSnackbar }) => {
  const [filterQuery, setFilterQuery] = useState(filter);
  const [selectedSearchResults, setSelectedSearchResults] = useState([]);
  const [selectedPlaylistEntries, setSelectedPlaylistEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [allSearchResultsSelected, setAllSongsSelected] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, track: null });
  const [showLastFMSearch, setShowLastFMSearch] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [showTrackDetails, setShowTrackDetails] = useState(false);
  const [similarTracks, setSimilarTracks] = useState(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [loading, setLoading] = useState(false);
  const [openAILoading, setOpenAILoading] = useState(false);
  const panelRef = useRef(null);
  const [libraryStats, setLibraryStats] = useState({
    visible: false,
    trackCount: 0,
    albumCount: 0,
    artistCount: 0,
    totalLength: 0,
    missingTracks: 0
  });
  const [isScanning, setIsScanning] = useState(false);

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

  const findSimilarTracksWithOpenAI = async (e, track) => {
    setOpenAILoading(true);

    const similars = await openAIRepository.findSimilarTracks(track);
    const localFiles = await libraryRepository.findLocalFiles(similars);

    // prefer local files
    setSimilarTracks(localFiles);

    setPosition({ x: e.clientX, y: e.clientY });
    setOpenAILoading(false);
  };

  const findSimilarTracks = async (e, track) => {
    setLoading(true);

    const similars = await lastFMRepository.findSimilarTracks(track);
    const localFiles = await libraryRepository.findLocalFiles(similars);

    // prefer local files
    setSimilarTracks(localFiles);

    setPosition({ xj: e.clientX, y: e.clientY });
    setLoading(false);
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

  const searchFor = (query) => {
    setFilterQuery(query);
    fetchSongs(query);
  }

  const addSongs = (tracks) => {
    onAddSongs(tracks);
    clearSelectedSongs();
    closeContextMenu();

    // TODO: filter out songs that are already in the playlist
    // TODO: adding songs should remove them from the search results
  }

  const handleShowDetails = (track) => {
    setSelectedTrack(track);
    setShowTrackDetails(true);
  }

  const scanMusic = async (full) => {
    setIsScanning(true);
    try {
      libraryRepository.scan(full);

      setSnackbar({
        open: true,
        message: 'Scan completed successfully',
        severity: 'success'
      });

      const stats = await libraryRepository.getStats();
      setLibraryStats({...stats, visible: true});
    } catch (error) {
      console.error('Error scanning music:', error);
      alert('Error scanning music.');
    } finally {
      setIsScanning(false);
    }
  };

  const purgeData = async () => {
    if (!window.confirm('Are you sure you want to purge all data?')) {
      return;
    }

    try {
      await axios.get(`/api/purge`);

      setSnackbar({
        open: true,
        message: 'Data purged successfully',
        severity: 'success'
      });
    } catch (error) {
      console.error('Error purging data:', error);
    }
  };

  const handleContextMenu = (e, track) => {
    e.preventDefault();

    // Get the parent container's position
    const rect = e.currentTarget.getBoundingClientRect();
    
    // Calculate position relative to the clicked element
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const isAlbum = track.entry_type === 'requested_album' || track.entry_type === 'album';

    const options = [
      { label: 'Details', onClick: () => handleShowDetails(track) },
      { label: 'Send to Search', onClick: () => searchFor(track.title) },
      !isAlbum ? { label: 'Find Similar Tracks (Last.fm)', onClick: (e) => findSimilarTracks(e, track) } : null,
      !isAlbum ? { label: 'Find Similar Tracks (OpenAI)', onClick: (e) => findSimilarTracksWithOpenAI(e, track) } : null,
      { label: 'Search for Album', onClick: () => handleFilterByAlbum(track.album) },
      { label: 'Search for Artist', onClick: () => handleFilterByArtist(track.artist) }
    ];

    setContextMenu({
      visible: true,
      x,
      y,
      options
    });
  }

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setIsPanelOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu({ visible: false });
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [])

  useEffect(() => {
    if (visible) {
      setIsPanelOpen(true);
    }

    if (filter && filter.length) {
      handleFilterChange({ target: { value: filter } });
    }
  }, [visible, filter]);

  useEffect(() => {
    // Fetch library stats
    const fetchLibraryStats = async () => {
      const stats = await libraryRepository.getStats();
      setLibraryStats({
        visible: true,
        ...stats
      });
    };

    fetchLibraryStats();
  }
  , []);

  return (
    <>
      <button 
        className="search-panel-toggle"
        onClick={() => setIsPanelOpen(!isPanelOpen)}
      >
        {isPanelOpen ? '✕' : '+ Add Songs'}
      </button>

      <div 
        ref={panelRef}
        className={`search-results-panel ${isPanelOpen ? 'open' : ''}`}
      >
        <div className="search-panel-header">
          <h2>Add Songs</h2>
          <button onClick={() => setIsPanelOpen(false)}>✕</button>
        </div>

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
          <button onClick={() => addSongs(selectedSearchResults)}>
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
          {searchResults.map((song) => (
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
                    {song.image_url && <div><img style={{height: 40}} src={song.image_url}/></div>}
                    <div>{song.artist || song.album_artist}</div>
                    <div><i>{song.album}</i></div>
                  </div>
                  <div className="grid-cell clickable" 
                    onContextMenu={(e) => handleContextMenu(e, song)}
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
              onAddSongs([track]);
              setShowLastFMSearch(false);
              closeContextMenu();
            }}
          />
        )}

        {contextMenu.visible && (
          <ContextMenu
            options={contextMenu.options}
            x={contextMenu.x}
            y={contextMenu.y}
            track={contextMenu.track}
            onClose={() => setContextMenu({ visible: false })}
          />
        )}

        {similarTracks && (
          <SimilarTracksPopup
            x={position.x}
            y={position.y}
            tracks={similarTracks}
            onClose={() => setSimilarTracks(null)}
            onAddTracks={(tracks) => onAddSongs(tracks)}
          />
        )}

        {showTrackDetails && (
          <TrackDetailsModal
            track={selectedTrack}
            onClose={() => setShowTrackDetails(false)}
          />
        )}

        {isScanning && (
          <div className="scan-overlay">
            <div className="scan-spinner"></div>
            <h2>Scanning...</h2>
          </div>
        )}

        {libraryStats.visible && (
          <div>
            <h2>Library Stats</h2>
            <p>{libraryStats.trackCount} tracks</p>
            <p>{libraryStats.albumCount} albums</p>
            <p>{libraryStats.artistCount} artists</p>
            <p>{secondsToDaysHoursMins(libraryStats.totalLength)} total length</p>
            <p>{libraryStats.missingTracks} missing tracks</p>
          </div>
        )}

        <button onClick={() => scanMusic(false)}>Scan Music</button>
        <button onClick={() => scanMusic(true)}>Full Scan Music</button>
        <button onClick={purgeData}>Purge Data</button>

        <button onClick={() => window.confirm("Really?") && playlistRepository.dumpLibrary(playlistID)}>TEST ONLY: Dump full library into this playlist</button>
      </div>
    </>
  );
};

export default SearchResultsGrid;