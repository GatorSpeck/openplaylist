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
import { setCookie, getCookie } from '../../lib/cookieUtils';
import { formatDuration } from '../../lib/misc';

const secondsToDaysHoursMins = (seconds: number) => {
  const days = Math.floor(seconds / (3600 * 24));
  const hours = Math.floor(seconds % (3600 * 24) / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  return `${days} days, ${hours} hours, ${minutes} minutes`;
}

export interface SearchFilter {
  title: string;
  artist: string;
  album: string;
  genre: string;
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
  const [selectedSearchResults, setSelectedSearchResults] = useState<PlaylistEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [allSearchResultsSelected, setAllSearchResultsSelected] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<PlaylistEntry | null>(null);
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; track: PlaylistEntry | null; options?: any[] }>({ visible: false, x: 0, y: 0, track: null });
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
  const [panelWidth, setPanelWidth] = useState(400); // Default width
  const [isResizing, setIsResizing] = useState(false);

  // Keep this part but rename it from "advancedFilters" to just "filters"
  const [filters, setFilters] = useState<SearchFilter>({
    ...filter,
    genre: filter.genre || ''
  });

  // support artist pick-list
  const [artistList, setArtistList] = useState<string[]>([]);
  const [showArtistDropdown, setShowArtistDropdown] = useState(false);
  const artistInputRef = useRef(null);

  // Add these new state variables
  const [albumList, setAlbumList] = useState<string[]>([]);
  const [showAlbumDropdown, setShowAlbumDropdown] = useState(false);
  const albumInputRef = useRef(null);

  // Column configuration
  type ColumnType = 'artist' | 'album' | 'albumArtist' | 'title' | 'genres' | 'year' | 'length' | 'trackNumber' | 'discNumber' | 'kind' | 'rating' | 'publisher';
  
  // Column configuration options
  const availableColumns = [
    { key: 'artist' as ColumnType, label: 'Artist', description: 'Artist name' },
    { key: 'album' as ColumnType, label: 'Album', description: 'Album name' },
    { key: 'albumArtist' as ColumnType, label: 'Album Artist', description: 'Album artist (if different from artist)' },
    { key: 'title' as ColumnType, label: 'Title', description: 'Song/track title' },
    { key: 'genres' as ColumnType, label: 'Genres', description: 'Music genres' },
    { key: 'year' as ColumnType, label: 'Year', description: 'Release year' },
    { key: 'length' as ColumnType, label: 'Length', description: 'Track duration' },
    { key: 'trackNumber' as ColumnType, label: 'Track #', description: 'Track number' },
    { key: 'discNumber' as ColumnType, label: 'Disc #', description: 'Disc number' },
    { key: 'kind' as ColumnType, label: 'Format', description: 'File format (MP3, FLAC, etc.)' },
    { key: 'rating' as ColumnType, label: 'Rating', description: 'Track rating' },
    { key: 'publisher' as ColumnType, label: 'Label', description: 'Record label/publisher' }
  ];
  
  const defaultColumns: ColumnType[] = ['artist', 'title'];
  
  const [visibleColumns, setVisibleColumns] = useState<ColumnType[]>(() => {
    const saved = getCookie('search_results_columns');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.every(col => availableColumns.some(ac => ac.key === col))) {
          return parsed;
        }
      } catch (e) {
        console.warn('Failed to parse saved search columns:', e);
      }
    }
    return defaultColumns;
  });
  const [columnConfigOpen, setColumnConfigOpen] = useState(false);
  
  // Sorting state
  const [sortColumn, setSortColumn] = useState<ColumnType | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  // Column widths state
  const defaultColumnWidths = {
    artist: 200,
    album: 200,
    albumArtist: 200,
    title: 300,
    genres: 150,
    year: 80,
    length: 100,
    trackNumber: 80,
    discNumber: 80,
    kind: 80,
    rating: 80,
    publisher: 150
  };
  
  const [columnWidths, setColumnWidths] = useState(() => {
    const saved = getCookie('search_results_column_widths');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (typeof parsed === 'object' && parsed !== null) {
          return { ...defaultColumnWidths, ...parsed };
        }
      } catch (e) {
        console.warn('Failed to parse saved search column widths:', e);
      }
    }
    return defaultColumnWidths;
  });
  
  // Update column widths
  const updateColumnWidth = (column: ColumnType, width: number) => {
    const constrainedWidth = Math.max(80, Math.min(600, width)); // Min 80px, Max 600px
    const newWidths = { ...columnWidths, [column]: constrainedWidth };
    setColumnWidths(newWidths);
    setCookie('search_results_column_widths', JSON.stringify(newWidths));
  };
  
  // Update column visibility
  const updateColumnVisibility = (columns: ColumnType[]) => {
    setVisibleColumns(columns);
    setCookie('search_results_columns', JSON.stringify(columns));
  };
  
  // Generate CSS grid template based on visible columns and their widths
  const getGridTemplate = () => {
    const baseColumns = ['50px']; // Fixed width for checkbox column
    
    visibleColumns.forEach(col => {
      const width = columnWidths[col] || defaultColumnWidths[col];
      baseColumns.push(`${width}px`);
    });
    
    baseColumns.push('40px'); // Fixed width for settings button
    
    return baseColumns.join(' ');
  };

  const ITEMS_PER_PAGE = 50;

  const extractSearchResults = (response: any) => {
    const results = response.data.map(s => new PlaylistEntry({...s, id: s.id, music_file_id: s.id, entry_type: "music_file"}));
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
          genre: filters.genre || null,
          offset: (pageNum - 1) * ITEMS_PER_PAGE,
          limit: ITEMS_PER_PAGE,
          sort_by: sortColumn,
          sort_direction: sortDirection
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

  const handleFilterByAlbum = async (album: string) => {
    setContextMenu({ visible: false, x: 0, y: 0, track: null });
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

    setPosition({ x: e.clientX, y: e.clientY });
    setIsLoading(false);
  };

  const handleFilterByArtist = async (artist: string) => {
    setContextMenu({ visible: false, x: 0, y: 0, track: null });
    
    try {
      const response = await axios.get(`/api/filter`, {
        params: { artist }
      });

      setSearchResults(extractSearchResults(response));
    } catch (error) {
      console.error('Error filtering by artist:', error);
    }
  };

  const toggleSongSelection = (song: PlaylistEntry) => {
    setSelectedSearchResults(prev => {
      const newSelection = prev.some(s => s.id === song.id)
        ? prev.filter(s => s.id !== song.id)
        : [...prev, song];
      setAllSearchResultsSelected(newSelection.length === searchResults.length);
      return newSelection;
    });
  };

  const clearSelectedSongs = () => {
    setSelectedSearchResults([]);
    setAllSearchResultsSelected(false);
  };

  const toggleAllSongs = () => {
    if (allSearchResultsSelected) {
      setSelectedSearchResults([]);
    } else {
      setSelectedSearchResults(searchResults);
    }
    setAllSearchResultsSelected(!allSearchResultsSelected);
  };

  // Add this function to handle advanced filter changes
  const handleAdvancedFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  // Handle column sort
  const handleColumnSort = (column: ColumnType) => {
    let newDirection: 'asc' | 'desc' = 'asc';
    
    if (sortColumn === column) {
      // If clicking the same column, toggle direction
      newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    }
    
    setSortColumn(column);
    setSortDirection(newDirection);
    
    // Reset to first page and refetch
    setPage(1);
    setSearchResults([]);
  };

  // Refetch when sort changes
  useEffect(() => {
    if (sortColumn) {
      fetchSongs(1);
    }
  }, [sortColumn, sortDirection]);

  // Add this function to fetch artists
  const fetchArtistList = async () => {
    try {
      const response = await libraryRepository.getArtistList();
      setArtistList(response || []);
    } catch (error) {
      console.error('Error fetching artist list:', error);
    }
  };

  // Modify the fetchAlbumList function to accept an artist parameter
  const fetchAlbumList = async (artist?: string) => {
    try {
      const response = await libraryRepository.getAlbumList(artist);
      setAlbumList(response || []);
    } catch (error) {
      console.error('Error fetching album list:', error);
    }
  };

  // 1. Create a reference for the album filtering debounce function
  const debouncedAlbumFetchRef = useRef<ReturnType<typeof debounce>>();

  // 2. Replace the existing useEffect that watches filters.artist with this debounced version
  useEffect(() => {
    // Clean up previous debounce if exists
    if (debouncedAlbumFetchRef.current) {
      debouncedAlbumFetchRef.current.cancel();
    }
    
    // Create new debounced function for album fetching
    debouncedAlbumFetchRef.current = debounce(async () => {
      // Only fetch albums if we have an artist with some length
      if (filters.artist && filters.artist.length > 1) {
        // Fetch albums for this specific artist
        fetchAlbumList(filters.artist);
      } else if (!filters.artist || filters.artist.length === 0) {
        // Clear album list or fetch all albums when artist is cleared
        fetchAlbumList();
      }
    }, 300); // Use a shorter delay for better responsiveness in the dropdown
    
    // Trigger the album fetch when artist changes (debounced)
    debouncedAlbumFetchRef.current();
    
    // Cleanup on unmount or when filters.artist changes again
    return () => {
      if (debouncedAlbumFetchRef.current) {
        debouncedAlbumFetchRef.current.cancel();
      }
    };
  }, [filters.artist]); // Re-run when artist filter changes

  // Update the initial useEffect to only fetch artists initially
  useEffect(() => {
    fetchArtistList();
    // Don't fetch albums here anymore since we'll do it when artist changes
  }, []);

  // Add this function to filter artists based on input
  const getFilteredArtists = () => {
    const artistQuery = filters.artist;
    if (artistQuery.length === 0) return [];
    
    return artistList
      .filter(artist => artist.toLowerCase().includes(filters.artist.toLowerCase()))
      .slice(0, 50); // Limit to 50 results max
  };

  // Add this function to filter albums based on input
  const getFilteredAlbums = () => {
    const albumQuery = filters.album;
    if (filters.artist.length === 0 && albumQuery.length === 0) return [];
    
    return albumList
      .filter(album => album.toLowerCase().includes(filters.album.toLowerCase()))
      .slice(0, 50); // Limit to 50 results max
  };

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
            message: `Scanning: ${response.progress}% - ${response.files_indexed} new files indexed, ${response.files_updated} updated, ${response.files_missing} missing`,
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

    // Use absolute positioning relative to the viewport
    const x = e.clientX;
    const y = e.clientY;

    const isAlbum = track.getEntryType() === 'requested_album' || track.getEntryType() === 'album';

    const options = [
      { label: 'Details', onClick: () => handleShowDetails(track) },
      { label: 'Send to Search', onClick: () => setFilters({"title": track.getTitle(), "artist": track.getAlbumArtist(), "album": track.getAlbum(), "genre": ""}) },
      !isAlbum ? { label: 'Find Similar Tracks (Last.fm)', onClick: (e) => findSimilarTracks(e, track) } : null,
      !isAlbum ? { label: 'Find Similar Tracks (OpenAI)', onClick: (e) => findSimilarTracksWithOpenAI(e, track) } : null,
      { label: 'Search for Album', onClick: () => setFilters({"title": "", "artist": track.getAlbumArtist(), "album": track.getAlbum(), "genre": ""}) },
      { label: 'Search for Artist', onClick: () => setFilters({"title": "", "artist": track.getAlbumArtist(), "album": "", "genre": ""}) }
    ];

    setContextMenu({
      visible: true,
      x,
      y,
      track,
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
      setContextMenu({ visible: false, x: 0, y: 0, track: null });
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  // Add this effect to close the artist dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (artistInputRef.current && !artistInputRef.current.contains(event.target)) {
        setShowArtistDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Add this effect to close the album dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (albumInputRef.current && !albumInputRef.current.contains(event.target)) {
        setShowAlbumDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  // 3. Add a cleanup effect for component unmount
  useEffect(() => {
    return () => {
      // Clean up all debounce functions on unmount
      if (debouncedSearchRef.current) {
        debouncedSearchRef.current.cancel();
      }
      if (debouncedAlbumFetchRef.current) {
        debouncedAlbumFetchRef.current.cancel();
      }
    };
  }, []);

  // Add resize functionality
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const newWidth = window.innerWidth - e.clientX;
      // Constrain width between 300px and 90% of window width
      const maxWidth = Math.floor(window.innerWidth * 0.9);
      const constrainedWidth = Math.max(300, Math.min(maxWidth, newWidth));
      setPanelWidth(constrainedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

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
        onClick={() => toggleSongSelection(song)}
        style={{ cursor: 'pointer' }}
      />
    ) : (
      <img 
        style={{height: 40, cursor: 'pointer'}} 
        src={image} 
        alt=""
        onClick={() => toggleSongSelection(song)}
      />
    );

    const renderColumn = (column: ColumnType) => {
      switch (column) {
        case 'artist':
          return <div>{song.getArtist()}</div>;
        case 'album':
          return <div><i>{song.getAlbum()}</i></div>;
        case 'albumArtist':
          return <div>{song.getAlbumArtist() || song.getArtist()}</div>;
        case 'title':
          return (
            <div>
              {song.missing ? <s>{song.getTitle()}</s> : song.getTitle()}
            </div>
          );
        case 'genres':
          return <div>{song.getGenres ? song.getGenres().join(', ') : ''}</div>;
        case 'year':
          return <div>{song.details?.year || ''}</div>;
        case 'length':
          return <div>{song.details?.length ? formatDuration(song.details.length) : ''}</div>;
        case 'trackNumber':
          return <div>{song.details?.track_number || ''}</div>;
        case 'discNumber':
          return <div>{song.details?.disc_number || ''}</div>;
        case 'kind':
          return <div>{song.details?.kind || ''}</div>;
        case 'rating':
          return <div>{song.details?.rating ? `${song.details.rating}/100` : ''}</div>;
        case 'publisher':
          return <div>{song.details?.publisher || ''}</div>;
        default:
          return null;
      }
    };

    return (
      <div style={style}>
        <div 
          className="search-grid-row"
          style={{
            gridTemplateColumns: getGridTemplate()
          }}
          onContextMenu={(e) => handleContextMenu(e, song)}
        >
          <div className="grid-cell">
            {artwork}
          </div>
          {visibleColumns.map((column, index) => (
            <div key={`${column}-${index}`} className="grid-cell">
              {renderColumn(column)}
            </div>
          ))}
        </div>
      </div>
    );
  });

  const clearSearchResults = () => {
    setFilters({ title: '', artist: '', album: '', genre: '' });
    setSearchResults([]);
  };

  // Create a new function to directly add manual entries
  const addManualEntry = (title: string, artist: string, album: string) => {
    const artistToUse = artist ? artist : 'Unknown Artist';
    const entryType = (album && !title) ? 'requested_album' : 'music_file';
    
    const newEntry = new PlaylistEntry({
      entry_type: entryType,
      title: entryType === 'music_file' ? title : album,
      artist: artistToUse,
      album: entryType === 'music_file' ? album : null,
      tracks: entryType === 'requested_album' ? [] : null
    });
    
    onAddSongs([newEntry]);

    const titleToShow = entryType === 'music_file' ? title : album;
    
    setSnackbar({
      open: true,
      message: `Added requested entry: "${titleToShow}" by ${artistToUse}`,
      severity: 'success'
    });
  }

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
        style={{
          '--panel-width': `${panelWidth}px`
        } as React.CSSProperties}
      >
        {/* Resize handle */}
        <div 
          className="resize-handle-bar"
          onMouseDown={handleResizeStart}
        />
        
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
              <div className="artist-input-container">
                <input 
                  ref={artistInputRef}
                  type="text" 
                  name="artist"
                  value={filters.artist} 
                  onChange={(e) => {
                    setFilters({...filters, artist: e.target.value});
                  }}
                  onFocus={() => setShowArtistDropdown(true)}
                  placeholder="Artist Name" 
                />

                {showArtistDropdown && !!(filters.artist.length) && (
                  <div className="artist-dropdown">
                    {getFilteredArtists().map((artist, index) => (
                      <div 
                        key={index}
                        className="artist-option"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setFilters(prevFilters => ({...prevFilters, artist}));  // Use functional update pattern
                          setShowArtistDropdown(false);
                        }}
                      >
                        {artist}
                      </div>
                    ))}
                    {!!(filters.artist.length) && (getFilteredArtists().length === 0) && (
                      <div className="artist-option no-results">No matching artists</div>
                    )}
                  </div>
                )}

              </div>
            </div>
            <div className="form-group">
              <label>Album:</label>
              <div className="album-input-container">
                <input 
                  ref={albumInputRef}
                  type="text" 
                  name="album"
                  value={filters.album} 
                  onChange={(e) => {
                    setFilters({...filters, album: e.target.value});
                  }}
                  onFocus={() => setShowAlbumDropdown(true)}
                  placeholder="Album Name" 
                />

                {showAlbumDropdown && !!(filters.artist.length || filters.album.length) && (
                  <div className="album-dropdown">
                    {getFilteredAlbums().map((album, index) => (
                      <div 
                        key={index}
                        className="album-option"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          console.log(`Selected album: ${album}`);
                          setFilters(prevFilters => ({...prevFilters, album}));
                          setShowAlbumDropdown(false);
                        }}
                      >
                        {album}
                      </div>
                    ))}
                    {!!(filters.album.length) && (getFilteredAlbums().length === 0) && (
                      <div className="album-option no-results">No matching albums</div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <div className="form-group">
              <label>Genre:</label>
              <div className="album-input-container">
                <input 
                  type="text" 
                  value={filters.genre}
                  onChange={(e) => {
                    setFilters({...filters, genre: e.target.value});
                  }}
                  placeholder="Genre (e.g., rock, pop, jazz)" 
                />
              </div>
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

        <div 
          style={{ 
            minHeight: '40px', 
            display: selectedSearchResults.length > 0 ? 'block' : 'none',
            backgroundColor: '#f0f0f0',
            padding: '10px',
            border: '1px solid #ccc',
            margin: '10px 0',
            zIndex: 9999,
            position: 'relative'
          }}
        >
          <button 
            onClick={() => addSongs(selectedSearchResults)}
            style={{ marginRight: '10px', padding: '8px 16px', backgroundColor: 'lightblue' }}
          >
            Add {selectedSearchResults.length} Selected to Playlist
          </button>
          <button 
            onClick={() => clearSelectedSongs()}
            style={{ padding: '8px 16px', backgroundColor: 'lightcoral' }}
          >
            Clear Selection
          </button>
        </div>

        <div className="search-grid-container" style={{
          overflowX: 'auto',
          overflowY: 'hidden',
          maxHeight: '600px',
          border: '1px solid #ddd',
          borderRadius: '4px'
        }}>
          <div style={{
            minWidth: 'fit-content'
          }}>
            <div className="search-grid-header-row" style={{
              gridTemplateColumns: getGridTemplate(),
              position: 'sticky',
              top: 0,
              zIndex: 10
            }}>
              <div className="grid-cell">
                <input
                  type="checkbox"
                  checked={allSearchResultsSelected}
                  onChange={toggleAllSongs}
                />
              </div>
              {visibleColumns.map((column, index) => {
                const columnInfo = availableColumns.find(col => col.key === column);
                const isLastColumn = index === visibleColumns.length - 1;
                const prevColumn = index > 0 ? visibleColumns[index - 1] : null;
                
                return (
                  <div key={column} className="grid-cell resizable-header" style={{ position: 'relative' }}>
                    <div 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        cursor: 'pointer'
                      }}
                      onClick={() => handleColumnSort(column)}
                      title={`Sort by ${columnInfo?.label}`}
                    >
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span>{columnInfo?.label}</span>
                        {sortColumn === column && (
                          <span style={{ marginLeft: '4px', fontSize: '12px' }}>
                            {sortDirection === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                      {isLastColumn && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation(); // Prevent sort when clicking settings
                            setColumnConfigOpen(true);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '14px',
                            color: '#666',
                            marginLeft: '8px'
                          }}
                          title="Configure columns"
                        >
                          ⚙️
                        </button>
                      )}
                    </div>
                    {prevColumn && (
                      <div 
                        className="resize-handle-bar"
                        style={{
                          position: 'absolute',
                          right: '0px',
                          top: '0',
                          bottom: '0',
                          width: '6px',
                          cursor: 'col-resize',
                          backgroundColor: 'transparent',
                          zIndex: 100,
                          marginRight: '-3px'
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const startX = e.clientX;
                          const leftColumn = prevColumn;
                          const rightColumn = column;
                          const startLeftWidth = columnWidths[leftColumn] || defaultColumnWidths[leftColumn];
                          const startRightWidth = columnWidths[rightColumn] || defaultColumnWidths[rightColumn];
                          
                          console.log(`Resizing between ${leftColumn} (${startLeftWidth}px) and ${rightColumn} (${startRightWidth}px)`);
                          
                          const handleMouseMove = (moveEvent: MouseEvent) => {
                            const diff = moveEvent.clientX - startX;
                            const newLeftWidth = Math.max(80, startLeftWidth + diff);
                            const newRightWidth = Math.max(80, startRightWidth - diff);
                            
                            // Only update if both columns can maintain minimum width
                            if (newLeftWidth >= 80 && newRightWidth >= 80) {
                              const newWidths = {
                                ...columnWidths,
                                [leftColumn]: newLeftWidth,
                                [rightColumn]: newRightWidth
                              };
                              setColumnWidths(newWidths);
                            }
                          };
                          
                          const handleMouseUp = () => {
                            document.removeEventListener('mousemove', handleMouseMove);
                            document.removeEventListener('mouseup', handleMouseUp);
                            document.body.style.cursor = '';
                            document.body.style.userSelect = '';
                            console.log(`Finished resizing. New widths: ${leftColumn}=${columnWidths[leftColumn]}px, ${rightColumn}=${columnWidths[rightColumn]}px`);
                          };
                          
                          document.body.style.cursor = 'col-resize';
                          document.body.style.userSelect = 'none';
                          document.addEventListener('mousemove', handleMouseMove);
                          document.addEventListener('mouseup', handleMouseUp);
                        }}
                      >
                        {/* Visual resize indicator */}
                        <div style={{
                          position: 'absolute',
                          right: '2px',
                          top: '25%',
                          bottom: '25%',
                          width: '2px',
                          backgroundColor: '#ccc',
                          borderRadius: '1px',
                          transition: 'background-color 0.2s'
                        }}></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ 
              height: '540px',
              overflowY: 'auto',
              overflowX: 'hidden'
            }}>
              <AutoSizer disableWidth>
                {({ height }) => (
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
                        itemSize={80}
                        width="100%" 
                        onItemsRendered={onItemsRendered}
                        style={{ overflowX: 'hidden' }}
                      >
                        {Row}
                      </List>
                    )}
                  </InfiniteLoader>
                )}
              </AutoSizer>
            </div>
          </div>
        </div>

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
            onClose={() => setContextMenu({ visible: false, x: 0, y: 0, track: null })}
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

        {/* Column Configuration Modal */}
        {columnConfigOpen && (
          <div className="modal-overlay" onClick={() => setColumnConfigOpen(false)}>
            <div 
              className="modal-content"
              style={{
                maxWidth: '500px',
                width: '90vw',
                maxHeight: '80vh',
                overflow: 'auto',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ padding: '20px', borderBottom: '1px solid #eee' }}>
                <h3 style={{ margin: '0', fontSize: '18px' }}>Configure Columns</h3>
              </div>
              <div className="column-config-content" style={{ padding: '20px' }}>
                <p>Select which columns to display:</p>
                <div className="column-checkboxes">
                  {visibleColumns.map((columnKey, index) => {
                    const column = availableColumns.find(col => col.key === columnKey);
                    if (!column) return null;
                    
                    return (
                      <label 
                        key={column.key} 
                        className="column-checkbox-item draggable-column"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', index.toString());
                          e.currentTarget.style.opacity = '0.5';
                        }}
                        onDragEnd={(e) => {
                          e.currentTarget.style.opacity = '1';
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const dragIndex = parseInt(e.dataTransfer.getData('text/plain'));
                          const dropIndex = index;
                          
                          if (dragIndex !== dropIndex) {
                            const newColumns = [...visibleColumns];
                            const draggedColumn = newColumns[dragIndex];
                            newColumns.splice(dragIndex, 1);
                            newColumns.splice(dropIndex, 0, draggedColumn);
                            updateColumnVisibility(newColumns);
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          marginBottom: '10px',
                          padding: '8px',
                          border: '1px solid #eee',
                          borderRadius: '4px',
                          cursor: 'grab'
                        }}
                      >
                        <span className="drag-handle" style={{ cursor: 'grab', marginRight: '8px' }}>⋮⋮</span>
                        <input
                          type="checkbox"
                          checked={true}
                          onChange={(e) => {
                            if (!e.target.checked && visibleColumns.length > 1) {
                              updateColumnVisibility(visibleColumns.filter(col => col !== column.key));
                            }
                          }}
                          disabled={visibleColumns.length === 1}
                          style={{ marginRight: '10px' }}
                        />
                        <div>
                          <div style={{ fontWeight: 'bold' }}>{column.label}</div>
                          <div style={{ fontSize: '12px', color: '#666' }}>{column.description}</div>
                        </div>
                      </label>
                    );
                  })}
                  
                  {/* Hidden columns that can be added */}
                  {availableColumns
                    .filter(column => !visibleColumns.includes(column.key))
                    .map(column => (
                      <label 
                        key={column.key} 
                        className="column-checkbox-item"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          marginBottom: '10px',
                          padding: '8px',
                          border: '1px solid #eee',
                          borderRadius: '4px',
                          opacity: 0.6
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={false}
                          onChange={(e) => {
                            if (e.target.checked) {
                              updateColumnVisibility([...visibleColumns, column.key]);
                            }
                          }}
                          style={{ marginRight: '10px' }}
                        />
                        <div>
                          <div style={{ fontWeight: 'bold' }}>{column.label}</div>
                          <div style={{ fontSize: '12px', color: '#666' }}>{column.description}</div>
                        </div>
                      </label>
                    ))
                  }
                </div>
                <div style={{ 
                  display: 'flex', 
                  gap: '10px', 
                  justifyContent: 'flex-end',
                  marginTop: '20px',
                  borderTop: '1px solid #eee',
                  paddingTop: '15px'
                }}>
                  <button 
                    onClick={() => {
                      updateColumnVisibility(defaultColumns);
                      setColumnWidths(defaultColumnWidths);
                    }}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#f0f0f0',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Reset to Default
                  </button>
                  <button 
                    onClick={() => setColumnConfigOpen(false)}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#4CAF50',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
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