import React, {useState, useEffect, useCallback, useRef, memo} from 'react';
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
import { FixedSizeList as List } from 'react-window';
import InfiniteLoader from 'react-window-infinite-loader';
import AutoSizer from 'react-virtualized-auto-sizer';

const secondsToDaysHoursMins = (seconds) => {
  const days = Math.floor(seconds / (3600 * 24));
  const hours = Math.floor(seconds % (3600 * 24) / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  return `${days} days, ${hours} hours, ${minutes} minutes`;
}

const SearchResultsGrid = ({ filter, onAddSongs, visible, playlistID, setSnackbar }) => {
  const [filterQuery, setFilterQuery] = useState(filter);
  const [selectedSearchResults, setSelectedSearchResults] = useState([]);
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
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [openAILoading, setOpenAILoading] = useState(false);

  // Add this state for advanced search toggle
  const [advancedSearch, setAdvancedSearch] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState({
    title: '',
    artist: '',
    album: ''
  });

  const ITEMS_PER_PAGE = 50;

  const extractSearchResults = (response) => {
    const results = response.data.map(s => mapToTrackModel({...s, music_file_id: s.id, entry_type: "music_file"}));
    return results;
  }

  const fetchSongs = async (query = '', pageNum = 1) => {
    if (query.length < 3) {
      return;
    }
    setIsLoading(true);
    try {
      const response = await axios.get(`/api/search`, {
        params: { 
          query: encodeURIComponent(query),
          offset: (pageNum - 1) * ITEMS_PER_PAGE,
          limit: ITEMS_PER_PAGE
        }
      });

      const results = extractSearchResults(response);
      
      if (pageNum === 1) {
        setSearchResults(results);
      } else {
        setSearchResults(prev => [...prev, ...results]);
      }

      setHasMore(results.length === ITEMS_PER_PAGE);
      setPage(pageNum);
      
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
    setIsLoading(true);

    const similars = await lastFMRepository.findSimilarTracks(track);
    const localFiles = await libraryRepository.findLocalFiles(similars);

    // prefer local files
    setSimilarTracks(localFiles);

    setPosition({ xj: e.clientX, y: e.clientY });
    setIsLoading(false);
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

  // Add this function to handle advanced filter changes
  const handleAdvancedFilterChange = (e) => {
    const { name, value } = e.target;
    setAdvancedFilters(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Update this function to handle advanced search
  const performAdvancedSearch = async () => {
    setIsLoading(true);
    try {
      const response = await axios.get(`/api/filter`, {
        params: { 
          title: advancedFilters.title || null,
          artist: advancedFilters.artist || null,
          album: advancedFilters.album || null,
          limit: ITEMS_PER_PAGE
        }
      });
      
      setSearchResults(extractSearchResults(response));
      setHasMore(false); // We don't have pagination for the filter endpoint
    } catch (error) {
      console.error('Error performing advanced search:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const searchFor = (query) => {
    setFilterQuery(query);
    fetchSongs(query);
  }

  const addSongs = (tracks) => {
    onAddSongs(tracks);
    clearSelectedSongs();

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
      // Start the scan
      await libraryRepository.scan(full);

      // Start polling for progress
      let polling = false;
      const pollInterval = setInterval(async () => {
        if (polling) return;
        polling = true;
        try {
          const response = (await axios.get('/api/scan/progress')).data;
          
          // Update snackbar with progress
          setSnackbar({
            open: true,
            message: `Scanning: ${response.progress}% - ${response.files_indexed} files indexed, ${response.files_updated} updated, ${response.files_missing} missing`,
            severity: 'info'
          });

          // Stop polling when scan is complete
          if (!response.in_progress) {
            clearInterval(pollInterval);
            setIsScanning(false);
            setSnackbar({
              open: true,
              message: 'Scan completed successfully',
              severity: 'success'
            });
            
            // Refresh library stats after scan completes
            const stats = await libraryRepository.getStats();
            setLibraryStats({
              visible: true,
              ...stats
            });
          }

          setTimeout(() => polling = false, 0);
        } catch (error) {
          console.error('Error polling scan progress:', error);
        }
      }, 5000); // Poll every second

    } catch (error) {
      console.error('Error scanning music:', error);
      setSnackbar({
        open: true,
        message: 'Error scanning music',
        severity: 'error'
      });
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

  const Row = memo(({ index, style }) => {
    const song = searchResults[index];
    if (!song) return null;

    useEffect(() => {
      const fn = async () => {
        if (song.artist && song.album) {
          const artwork = await lastFMRepository.fetchAlbumArt(song.artist, song.album);
          if (artwork) {
            song.image_url = artwork.image_url;
          }
        }
      }
      
      fn();
    }, [song.artist, song.album]);

    const isSelected = selectedSearchResults.some(s => s.id === song.id);

    const image = song.image_url;

    const artwork = (isSelected || !image) ? (
      <input 
        type="checkbox"
        checked={isSelected}
        readOnly
      />
    ) : (
      <img style={{height: 40}} src={image} alt=""/>
    );

    return (
      <div style={style}>
        <div 
          className="search-grid-row"
          onClick={() => toggleSongSelection(song)}
        >
          <div className="grid-cell">
            {artwork}
          </div>
          <div className="grid-cell">
            <div>{song.artist || song.album_artist}</div>
            <div><i>{song.album}</i></div>
          </div>
          <div 
            className="grid-cell clickable" 
            onContextMenu={(e) => handleContextMenu(e, song)}
          >
            {song.missing ? <s>{song.title}</s> : song.title}
          </div>
        </div>
      </div>
    );
  });

  const renderSearchResults = () => (
    <div style={{ height: '600px' }}> {/* Adjust height as needed */}
      <AutoSizer>
        {({ height, width }) => (
          <InfiniteLoader
            isItemLoaded={index => index < searchResults.length}
            itemCount={hasMore ? searchResults.length + 1 : searchResults.length}
            loadMoreItems={() => {
              if (!isLoading && hasMore) {
                return fetchSongs(filterQuery, page + 1);
              }
              return Promise.resolve();
            }}
          >
            {({ onItemsRendered, ref }) => (
              <List
                ref={ref}
                height={height}
                itemCount={searchResults.length}
                itemSize={80} // Adjust based on your row height
                width={width}
                onItemsRendered={onItemsRendered}
              >
                {Row}
              </List>
            )}
          </InfiniteLoader>
        )}
      </AutoSizer>
    </div>
  );

  const clearSearchResults = () => {
    setFilterQuery('');
    setSearchResults([]);
  };

  // Create a new function to directly add manual entries
  const addManualEntry = (title, artist, album, type = 'track') => {
    if (!title || !artist) {
      setSnackbar({
        open: true,
        message: 'Title and artist are required',
        severity: 'error'
      });
      return;
    }
    
    const newEntry = {
      entry_type: type === 'track' ? 'requested' : 'requested_album',
      title: title,
      artist: artist,
      album: type === 'track' ? album : null,
      tracks: type === 'album' ? [] : null
    };
    
    onAddSongs([newEntry]);
    
    setSnackbar({
      open: true,
      message: `Added requested ${type}: "${title}" by ${artist}`,
      severity: 'success'
    });
  };

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

        <div className="search-container">
          <div className="search-toggle">
            <button 
              className={`search-mode-btn ${!advancedSearch ? 'active' : ''}`}
              onClick={() => setAdvancedSearch(false)}
            >
              Basic Search
            </button>
            <button 
              className={`search-mode-btn ${advancedSearch ? 'active' : ''}`}
              onClick={() => setAdvancedSearch(true)}
            >
              Advanced Search
            </button>
          </div>
          
          {!advancedSearch ? (
            <div className="basic-search">
              <input
                type="text"
                placeholder="Search local files..."
                value={filterQuery}
                onChange={handleFilterChange}
              />
              <div className="basic-search-actions">
                <button onClick={() => clearSearchResults()}>Clear</button>
                {filterQuery.length > 2 && (
                  <>
                    <button onClick={() => {
                      // Switch to advanced search with the current query as title
                      setAdvancedFilters({
                        title: filterQuery,
                        artist: '',
                        album: ''
                      });
                      setAdvancedSearch(true);
                    }}>
                      Advanced Search
                    </button>
                    <button onClick={() => {
                      // Launch Last.FM search with current query
                      setShowLastFMSearch(true);
                    }}>
                      Search Last.FM
                    </button>
                    <button onClick={() => {
                      // Copy to manual entry
                      setManualTitle(filterQuery);
                      setManualArtist('');
                      setManualAlbum('');
                      setManualEntryOpen(true);
                    }}>
                      Add Manually
                    </button>
                    <button onClick={() => {
                      // Directly add as a manual entry
                      addManualEntry(filterQuery, '', '', 'track');
                    }}>
                      Add as Track
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="advanced-search">
              <div className="form-group">
                <label>Title:</label>
                <input 
                  type="text" 
                  name="title"
                  value={advancedFilters.title} 
                  onChange={handleAdvancedFilterChange}
                  placeholder="Track Title" 
                />
              </div>
              <div className="form-group">
                <label>Artist:</label>
                <input 
                  type="text" 
                  name="artist"
                  value={advancedFilters.artist} 
                  onChange={handleAdvancedFilterChange}
                  placeholder="Artist Name" 
                />
              </div>
              <div className="form-group">
                <label>Album:</label>
                <input 
                  type="text" 
                  name="album"
                  value={advancedFilters.album} 
                  onChange={handleAdvancedFilterChange}
                  placeholder="Album Name" 
                />
              </div>
              <div className="advanced-search-actions">
                <button onClick={performAdvancedSearch}>
                  Search Library
                </button>
                <button onClick={() => {
                  // Launch Last.FM search with the current advanced filters
                  setShowLastFMSearch(true);
                }}>
                  Search Last.FM
                </button>
                <button onClick={() => {
                  // Directly add as a manual track
                  addManualEntry(
                    advancedFilters.title,
                    advancedFilters.artist,
                    advancedFilters.album,
                    'track'
                  );
                }}>
                  Add as Track
                </button>
                <button onClick={() => {
                  // Directly add as a manual album
                  addManualEntry(
                    advancedFilters.title,
                    advancedFilters.artist,
                    null,
                    'album'
                  );
                }}>
                  Add as Album
                </button>
                <button onClick={() => {
                  setAdvancedFilters({ title: '', artist: '', album: '' });
                  clearSearchResults();
                }}>
                  Clear
                </button>
              </div>
            </div>
          )}
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

        {renderSearchResults()}

        {showLastFMSearch && (
          <LastFMSearch
            initialSearch={{
              title: advancedFilters.title,
              artist: advancedFilters.artist,
              album: advancedFilters.album
            }}
            onClose={() => setShowLastFMSearch(false)}
            onAddToPlaylist={(entries) => {
              onAddSongs(entries);
              setShowLastFMSearch(false);
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