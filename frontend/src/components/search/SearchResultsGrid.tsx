import React, {useState, useEffect, useCallback, useRef, memo} from 'react';
import { Droppable, Draggable } from 'react-beautiful-dnd';
import '../../styles/SearchResultsGrid.css';
import mapToTrackModel from '../../lib/mapToTrackModel';
import axios from 'axios';
import debounce from 'lodash/debounce';
import { ClipLoader } from 'react-spinners';
import LastFMSearch from './LastFMSearch';
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
import PlaylistEntry from '../../lib/PlaylistEntry';

const secondsToDaysHoursMins = (seconds) => {
  const days = Math.floor(seconds / (3600 * 24));
  const hours = Math.floor(seconds % (3600 * 24) / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  return `${days} days, ${hours} hours, ${minutes} minutes`;
}

export interface SearchFilter {
  title: string;
  artist: string;
  album: string;
}

interface SearchResultsGridProps {
  filter: SearchFilter;
  onAddSongs: (tracks: PlaylistEntry[]) => void;
  visible: boolean;
  playlistID: number;
  setSnackbar: (snackbar: { open: boolean; message: string; severity: string }) => void;
  onPanelClose: () => void;
}

const SearchResultsGrid: React.FC<SearchResultsGridProps> = ({ filter, onAddSongs, visible, playlistID, setSnackbar, onPanelClose }) => {
  const [selectedSearchResults, setSelectedSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [allSearchResultsSelected, setAllSongsSelected] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<PlaylistEntry | null>(null);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, track: null });
  const [showLastFMSearch, setShowLastFMSearch] = useState(false);
  const [searchResults, setSearchResults] = useState<PlaylistEntry[]>([]);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [showTrackDetails, setShowTrackDetails] = useState(false);
  const [similarTracks, setSimilarTracks] = useState<PlaylistEntry[]>([]);
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

  // Keep this part but rename it from "advancedFilters" to just "filters"
  const [filters, setFilters] = useState<SearchFilter>(filter);

  const ITEMS_PER_PAGE = 50;

  const extractSearchResults = (response) => {
    const results = response.data.map(s => new PlaylistEntry({...s, music_file_id: s.id, entry_type: "music_file"}));
    return results;
  }

  const fetchSongs = async (pageNum = 1) => {
    setIsLoading(true);
    try {
      const response = await axios.get(`/api/filter`, {
        params: { 
          title: filters.title || null,
          artist: filters.artist || null,
          album: filters.album || null,
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
    setSimilarTracks(localFiles.map(t => new PlaylistEntry(t)));

    setPosition({ x: e.clientX, y: e.clientY });
    setOpenAILoading(false);
  };

  const findSimilarTracks = async (e, track) => {
    setIsLoading(true);

    const similars = await lastFMRepository.findSimilarTracks(track);
    const localFiles = await libraryRepository.findLocalFiles(similars);

    // prefer local files
    setSimilarTracks(localFiles.map(t => new PlaylistEntry(t)));

    setPosition({ xj: e.clientX, y: e.clientY });
    setIsLoading(false);
  };

  const handleFilterByArtist = async (artist) => {
    setContextMenu({ visible: false });
    
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

  // Add this function to handle advanced filter changes
  const handleAdvancedFilterChange = (e) => {
    const { name, value } = e.target;
    
    setFilters(prev => ({
      ...prev,
      [name]: value
    }));
    // No need to call debounced function here - the effect will handle it
  };

  // Update this function to use pagination
  const performAdvancedSearch = async () => {
    return fetchSongs(1);
  };

  // 1. Create a reference to store the debounced function
  const debouncedSearchRef = useRef<ReturnType<typeof debounce>>();

  // 2. Setup the debounced function in an effect that updates when filters change
  useEffect(() => {
    // Clean up previous debounce if exists
    if (debouncedSearchRef.current) {
      debouncedSearchRef.current.cancel();
    }
    
    // Create new debounced function that will always use latest filters
    debouncedSearchRef.current = debounce(() => {
      if (filters.title.length > 1 || filters.artist.length > 1 || filters.album.length > 1) {
        performAdvancedSearch();
      }
    }, 500);
    
    // Trigger the search when filters change (debounced)
    debouncedSearchRef.current();
    
    // Cleanup on unmount
    return () => {
      if (debouncedSearchRef.current) {
        debouncedSearchRef.current.cancel();
      }
    };
  }, [filters]); // Re-run when filters change

  // Add this effect to SearchResultsGrid.tsx after your other useEffect hooks
  useEffect(() => {
    // Update local filters state when the filter prop changes from PlaylistGrid
    setFilters(filter);
  }, [filter]);

  const addSongs = (tracks:  PlaylistEntry[]) => {
    onAddSongs(tracks);
    clearSelectedSongs();

    // TODO: filter out songs that are already in the playlist
    // TODO: adding songs should remove them from the search results
  }

  const handleShowDetails = (track: PlaylistEntry) => {
    setSelectedTrack(track);
    setShowTrackDetails(true);
  }

  const scanMusic = async (full: boolean) => {
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

  const handleContextMenu = (e, track: PlaylistEntry) => {
    e.preventDefault();

    // Get the parent container's position
    const rect = e.currentTarget.getBoundingClientRect();
    
    // Calculate position relative to the clicked element
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const isAlbum = track.entry_type === 'requested_album' || track.entry_type === 'album';

    const options = [
      { label: 'Details', onClick: () => handleShowDetails(track) },
      { label: 'Send to Search', onClick: () => setFilters({"title": track.getTitle(), "artist": track.getAlbumArtist(), "album": track.getAlbum()}) },
      !isAlbum ? { label: 'Find Similar Tracks (Last.fm)', onClick: (e) => findSimilarTracks(e, track) } : null,
      !isAlbum ? { label: 'Find Similar Tracks (OpenAI)', onClick: (e) => findSimilarTracksWithOpenAI(e, track) } : null,
      { label: 'Search for Album', onClick: () => setFilters({"title": "", "artist": track.getAlbumArtist(), "album": track.getAlbum()}) },
      { label: 'Search for Artist', onClick: () => setFilters({"title": "", "artist": track.getAlbumArtist(), "album": ""}) }
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
        onPanelClose();
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
  }, [visible]);

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
        if (song.getArtist() && song.getAlbum()) {
          const artwork = await lastFMRepository.fetchAlbumArt(song.getArtist(), song.getAlbum());
          if (artwork) {
            song.image_url = artwork.image_url;
          }
        }
      }
      
      fn();
    }, [song.getArtist(), song.getAlbum()]);

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
            <div>{song.getArtist()}</div>
            <div><i>{song.getAlbum()}</i></div>
          </div>
          <div 
            className="grid-cell clickable" 
            onContextMenu={(e) => handleContextMenu(e, song)}
          >
            {song.missing ? <s>{song.getTitle()}</s> : song.getTitle()}
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
            loadMoreItems={(startIndex, stopIndex) => {
              if (!isLoading && hasMore) {
                console.log(`Loading more items from ${startIndex} to ${stopIndex}`);
                return fetchSongs(page + 1);
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
    setFilters({ title: '', artist: '', album: '' });
    setSearchResults([]);
  };

  // Create a new function to directly add manual entries
  const addManualEntry = (title: string, artist: string, album: string) => {
    const artistToUse = artist ? artist : 'Unknown Artist';
    const entryType = (album && !title) ? 'requested_album' : 'requested';
    
    const newEntry = new PlaylistEntry({
      entry_type: entryType,
      title: entryType === 'requested' ? title : album,
      artist: artistToUse,
      album: entryType === 'requested' ? album : null,
      tracks: entryType === 'requested_album' ? [] : null
    });
    
    onAddSongs([newEntry]);

    const titleToShow = entryType === 'requested' ? title : album;
    
    setSnackbar({
      open: true,
      message: `Added requested entry: "${titleToShow}" by ${artistToUse}`,
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
          <div className="advanced-search">
            <div className="form-group">
              <label>Title:</label>
              <input 
                type="text" 
                name="title"
                value={filters.title} 
                onChange={handleAdvancedFilterChange}
                placeholder="Track Title" 
              />
            </div>
            <div className="form-group">
              <label>Artist:</label>
              <input 
                type="text" 
                name="artist"
                value={filters.artist} 
                onChange={handleAdvancedFilterChange}
                placeholder="Artist Name" 
              />
            </div>
            <div className="form-group">
              <label>Album:</label>
              <input 
                type="text" 
                name="album"
                value={filters.album} 
                onChange={handleAdvancedFilterChange}
                placeholder="Album Name" 
              />
            </div>
            <div className="advanced-search-actions">
              {isLoading && (
                <div className="loading-indicator">
                  <ClipLoader size={20} color="#4A90E2" />
                  <span>Searching...</span>
                </div>
              )}
              <button onClick={() => {
                // Launch Last.FM search with the current advanced filters
                setShowLastFMSearch(true);
              }}>
                Search Last.FM
              </button>
              <button onClick={() => {
                // Directly add as a manual track
                addManualEntry(
                  filters.title,
                  filters.artist,
                  filters.album
                );
              }}>
                Add Requested Entry
              </button>
              <button onClick={() => {
                setFilters({ title: '', artist: '', album: '' });
                clearSearchResults();
              }}>
                Clear
              </button>
            </div>
          </div>
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
              title: filters.title,
              artist: filters.artist,
              album: filters.album,
              type: filters.title ? 'track' : 'album'
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

        {!!similarTracks.length && (
          <SimilarTracksPopup
            x={position.x}
            y={position.y}
            tracks={similarTracks}
            onClose={() => setSimilarTracks([])}
            onAddTracks={(tracks) => onAddSongs(tracks)}
          />
        )}

        {showTrackDetails && selectedTrack && (
          <TrackDetailsModal
            entry={selectedTrack}
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