import React, { useState, useMemo, useEffect, useRef, memo, useCallback } from 'react';
import { Droppable, Draggable, DragDropContext } from 'react-beautiful-dnd';
import Snackbar from '../Snackbar';
import mapToTrackModel from '../../lib/mapToTrackModel';
import '../../styles/PlaylistGrid.css';
import SearchResultsGrid, {SearchFilter} from '../search/SearchResultsGrid';
import ContextMenu from '../common/ContextMenu';
import { FaUndo, FaRedo } from 'react-icons/fa';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import BaseModal from '../common/BaseModal';
import playlistRepository from '../../repositories/PlaylistRepository';
import InfiniteScroll from 'react-infinite-scroll-component';
import PlaylistEntryRow from './PlaylistEntryRow';
import AutoSizer from 'react-virtualized-auto-sizer';
import { FixedSizeList as List, FixedSizeListProps } from 'react-window';
import TrackDetailsModal from '../common/TrackDetailsModal';
import openAIRepository from '../../repositories/OpenAIRepository';
import lastFMRepository from '../../repositories/LastFMRepository';
import libraryRepository from '../../repositories/LibraryRepository';
import SimilarTracksPopup from '../common/SimilarTracksPopup';
import AlbumArtGrid from './AlbumArtGrid';
import { BiLoaderAlt } from 'react-icons/bi';
import { formatDuration } from '../../lib/misc';
import Modal from '../common/Modal';
import MatchTrackModal from './MatchTrackModal';
import MatchAlbumModal from './MatchAlbumModal';
import EditItemModal from './EditItemModal';
import PlaylistEntry, {PlaylistEntryStub} from '../../lib/PlaylistEntry';
import SelectPlaylistModal from './SelectPlaylistModal';
import { setCookie, getCookie } from '../../lib/cookieUtils';
import SyncConfig from './SyncConfig'; // Import the SyncConfig component
import SyncLogModal from './SyncLogModal';

const BatchActions = ({ selectedCount, onRemove, onClear, onHide }) => (
  <div className="batch-actions" style={{ minHeight: '40px', visibility: selectedCount > 0 ? 'visible' : 'hidden' }}>
    <button onClick={onHide}>
      Hide {selectedCount} Selected Entries
    </button>
    <button onClick={onRemove}>
      Remove {selectedCount} Selected Entries
    </button>
    <button onClick={onClear}>
      Clear Selection
    </button>
  </div>
);

const Row = memo(({ data, index, style }) => {
  const { 
    entries,
    toggleTrackSelection, 
    handleContextMenu, 
    selectedEntries,
    sortColumn,
    provided,
    totalCount,
    visibleColumns,
    gridTemplate,
    updateEntryNotes
  } = data;

  if (index >= totalCount) {
    return null;
  }

  const track = ((index >= entries.length) || !entries[index]) ? null : new PlaylistEntry(entries[index]);

  // Check if we have real data for this index
  if (
    !track ||
    !track.hasDetails()
  ){
    // Return a placeholder/loading row
    return (
      <div 
        style={{
          ...style,
          gridTemplateColumns: gridTemplate,
        }}
        className={`playlist-grid-row loading-row ${index % 2 === 0 ? 'even-row' : 'odd-row'}`}
      >
        <div className="grid-cell">{selectedEntries.includes(index) ? "✔" : index + 1}</div>
        {visibleColumns.map((column, columnIndex) => (
          <div key={`loading-${column}-${columnIndex}`} className="grid-cell">
            {columnIndex === 0 ? "Loading..." : ""}
          </div>
        ))}
      </div>
    );
  }
  
  return (
    <Draggable 
      key={track.id}
      draggableId={`track-${track.id}`}
      index={index}
      isDragDisabled={sortColumn !== 'order'}
    >
      {(provided, snapshot) => (
        <PlaylistEntryRow 
          ref={provided.innerRef}
          {...provided.draggableProps}
          style={{
            ...style,
            ...provided.draggableProps.style,
            gridTemplateColumns: gridTemplate,
          }}
          className={`playlist-grid-row ${track.order % 2 === 0 ? 'even-row' : 'odd-row'} ${sortColumn !== 'order' ? 'drag-disabled' : ''}`}
          isDragging={snapshot.isDragging}
          onToggle={() => toggleTrackSelection(track.id)} // Use track.id consistently
          onContextMenu={(e) => handleContextMenu(e, track)}
          isChecked={selectedEntries.includes(track.id)} // Use track.id consistently
          entry={track}
          dragHandleProps={provided.dragHandleProps}
          visibleColumns={visibleColumns}
          onNotesUpdate={updateEntryNotes}
        />
      )}
    </Draggable>
  );
});

interface PlaylistGridProps {
  playlistID: number;
}

const PlaylistGrid: React.FC<PlaylistGridProps> = ({ playlistID }) => {
  // Add search params hook at the top of your component
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // Add this new state to track parameter initialization
  const [paramsInitialized, setParamsInitialized] = useState(false);

  // Get sort parameters from URL or use defaults
  const getSortColumnFromParam = (param: string | null): string => {
    const validColumns = ['order', 'title', 'artist', 'album', 'random'];
    
    // First check URL params
    if (param && validColumns.includes(param)) {
      return param;
    }
    
    // Then fall back to cookies
    const cookieValue = getCookie(`playlist_${playlistID}_sortColumn`);
    if (cookieValue && validColumns.includes(cookieValue)) {
      return cookieValue;
    }
    
    // Default if neither exists
    return 'order';
  };

  const getSortDirectionFromParam = (param: string | null): string => {
    // First check URL params
    if (param === 'asc' || param === 'desc') {
      return param;
    }
    
    // Then fall back to cookies
    const cookieValue = getCookie(`playlist_${playlistID}_sortDirection`);
    if (cookieValue === 'asc' || cookieValue === 'desc') {
      return cookieValue;
    }
    
    // Default if neither exists
    return 'asc';
  };

  // Replace your current parameter initialization useEffect with this one
  useEffect(() => {
    // Process URL params and cookies only once at component initialization
    const initialSortColumn = getSortColumnFromParam(searchParams.get('sort'));
    const initialSortDirection = getSortDirectionFromParam(searchParams.get('dir'));
    const initialFilter = searchParams.get('filter') || '';
    
    // Handle random seed
    const urlSeed = searchParams.get('seed');
    const cookieSeed = getCookie(`playlist_${playlistID}_randomSeed`);
    let initialSeed = null;
    
    if (initialSortColumn === 'random') {
      if (urlSeed && !isNaN(parseInt(urlSeed))) {
        initialSeed = parseInt(urlSeed);
      } else if (cookieSeed && !isNaN(parseInt(cookieSeed))) {
        initialSeed = parseInt(cookieSeed);
      } else {
        initialSeed = Math.floor(Math.random() * 1000000);
      }
      setRandomSeed(initialSeed);
      setIsRandomOrder(true);
    }
    
    // Restore scroll position from cookies
    const savedScrollPosition = getCookie(`playlist_${playlistID}_scrollPosition`);
    if (savedScrollPosition && !isNaN(parseFloat(savedScrollPosition))) {
      const position = parseFloat(savedScrollPosition);
      setScrollPosition(position);
      scrollPositionRef.current = position;
      isRestoringScroll.current = true;
    }
    
    // Set the state values all at once
    setSortColumn(initialSortColumn);
    setSortDirection(initialSortDirection);
    setFilter(initialFilter);
    
    // Update URL params to match the resolved values WITHOUT triggering navigation
    // This ensures URL and state are in sync without causing a re-render
    const newParams = new URLSearchParams(searchParams);
    let urlNeedsUpdate = false;
    
    if (searchParams.get('sort') !== initialSortColumn) {
      newParams.set('sort', initialSortColumn);
      urlNeedsUpdate = true;
    }
    
    if (searchParams.get('dir') !== initialSortDirection) {
      newParams.set('dir', initialSortDirection);
      urlNeedsUpdate = true;
    }
    
    if (initialFilter && searchParams.get('filter') !== initialFilter) {
      newParams.set('filter', initialFilter);
      urlNeedsUpdate = true;
    }
    
    if (initialSortColumn === 'random' && initialSeed !== null && searchParams.get('seed') !== initialSeed.toString()) {
      newParams.set('seed', initialSeed.toString());
      urlNeedsUpdate = true;
    }
    
    // Only update URL if it needs updating, and do it silently
    if (urlNeedsUpdate) {
      // Use navigate with the current pathname to ensure we don't lose the playlist name
      const currentPath = window.location.pathname;
      navigate(`${currentPath}?${newParams.toString()}`, { replace: true });
    }
    
    // Mark parameters as initialized
    setParamsInitialized(true);
  }, [playlistID]); // Only run when playlistID changes, NOT when searchParams change

  // Update your state initialization to use cookies and URL params
  const [sortColumn, setSortColumn] = useState('');
  const [sortDirection, setSortDirection] = useState('');
  const [filter, setFilter] = useState('');
  const [debouncedFilter, setDebouncedFilter] = useState('');
  const [entries, setEntries] = useState<PlaylistEntryStub[]>([]);
  const [name, setName] = useState('');
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'info'
  });
  const [selectedEntries, setSelectedEntries] = useState([]);
  const allEntriesSelected = selectedEntries.length === entries.length;
  const [allPlaylistEntriesSelected, setAllTracksSelected] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, track: null });
  const [searchFilter, setSearchFilter] = useState<SearchFilter>({"album": "", "artist": "", "title": ""});
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [playlistModalVisible, setPlaylistModalVisible] = useState(false);
  const [selectPlaylistModalVisible, setSelectPlaylistModalVisible] = useState(false);
  const gridContentRef = useRef(null);
  const [displayedItems, setDisplayedItems] = useState(50);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [openAILoading, setOpenAILoading] = useState(false);
  const [similarTracks, setSimilarTracks] = useState<PlaylistEntry[]>([]);
  const [showTrackDetails, setShowTrackDetails] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [selectedTrack, setSelectedTrack] = useState<PlaylistEntry | null>(null);
  const [albumArtList, setAlbumArtList] = useState([]);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [tracksToAddToOtherPlaylist, setTracksToAddToOtherPlaylist] = useState([]);
  const [syncLogModalOpen, setSyncLogModalOpen] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  // Add these state variables to track visible ranges
  const [visibleStartIndex, setVisibleStartIndex] = useState(0);
  const [visibleStopIndex, setVisibleStopIndex] = useState(0);
  const [pendingFetchPromise, setPendingFetchPromise] = useState(null);

  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [matchingTracks, setMatchingTracks] = useState([]);
  const [trackToMatch, setTrackToMatch] = useState<PlaylistEntry | null>(null);

  // Add these new state variables alongside your other states
  const [albumMatchModalOpen, setAlbumMatchModalOpen] = useState(false);
  const [albumMatchResults, setAlbumMatchResults] = useState([]);
  const [albumToMatch, setAlbumToMatch] = useState<PlaylistEntry | null>(null);

  // Add after your other state declarations
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<PlaylistEntry | null>(null);

  const [syncConfigOpen, setSyncConfigOpen] = useState(false);

  // Add new state for hidden entries
  const [showHidden, setShowHidden] = useState(false);
  const [hideByDefault, setHideByDefault] = useState(false); // For playlist preference

  // Add this near your other state declarations around line 255
  const [randomSeed, setRandomSeed] = useState<number | null>(null);
  const [isRandomOrder, setIsRandomOrder] = useState(false);

  // Column configuration
  type ColumnType = 'artistAlbum' | 'artist' | 'album' | 'title' | 'notes';
  
  const defaultColumns: ColumnType[] = ['artistAlbum', 'title'];
  
  const [visibleColumns, setVisibleColumns] = useState<ColumnType[]>(() => {
    const saved = getCookie(`playlist_${playlistID}_columns`);
    return saved ? JSON.parse(saved) : defaultColumns;
  });
  
  const [columnConfigOpen, setColumnConfigOpen] = useState(false);
  
  // Column widths state
  const defaultColumnWidths = {
    artistAlbum: 300,
    artist: 200,
    album: 200,
    title: 300,
    notes: 150
  };
  
  const [columnWidths, setColumnWidths] = useState(() => {
    const saved = getCookie(`playlist_${playlistID}_columnWidths`);
    return saved ? JSON.parse(saved) : defaultColumnWidths;
  });
  
  // Update column widths and save to cookies
  const updateColumnWidth = (column: ColumnType, width: number) => {
    const newWidths = { ...columnWidths, [column]: Math.max(80, width) }; // Min width 80px
    setColumnWidths(newWidths);
    setCookie(`playlist_${playlistID}_columnWidths`, JSON.stringify(newWidths));
  };
  
  // Column configuration options
  const availableColumns = [
    { key: 'artistAlbum' as ColumnType, label: 'Artist/Album', description: 'Combined artist and album info' },
    { key: 'artist' as ColumnType, label: 'Artist', description: 'Artist name only' },
    { key: 'album' as ColumnType, label: 'Album', description: 'Album name only' },
    { key: 'title' as ColumnType, label: 'Title', description: 'Song/track title' },
    { key: 'notes' as ColumnType, label: 'Notes', description: 'Additional notes or comments' }
  ];
  
  // Update column visibility and save to cookies
  const updateColumnVisibility = (columns: ColumnType[]) => {
    setVisibleColumns(columns);
    setCookie(`playlist_${playlistID}_columns`, JSON.stringify(columns));
  };
  
  // Generate CSS grid template based on visible columns and their widths
  const getGridTemplate = () => {
    const baseColumns = ['80px']; // Fixed width for checkbox/art column
    
    visibleColumns.forEach(col => {
      const width = columnWidths[col] || defaultColumnWidths[col];
      baseColumns.push(`${width}px`);
    });
    
    return baseColumns.join(' ');
  };

  // Apply debouncing to the filter
  useEffect(() => {
    // Set a timer to update the debounced filter after typing stops
    const timer = setTimeout(() => {
      setDebouncedFilter(filter.trim());
    }, 500); // 500ms debounce delay

    // Clean up the timer if filter changes before timeout completes
    return () => clearTimeout(timer);
  }, [filter]);

  // Replace your current useEffect for loading data with this one
  useEffect(() => {
    // Only fetch data after params are initialized
    if (paramsInitialized) {
      setPage(0); // Reset page on filter/sort changes
      
      // Don't automatically clear scroll position on filter/sort changes
      // Let the user manually scroll to where they want to be
      
      fetchPlaylistArtGrid();
      fetchPlaylistDetails(true);
    }
  }, [playlistID, debouncedFilter, sortColumn, sortDirection, paramsInitialized, showHidden]); // Add showHidden here

  const fetchPlaylistArtGrid = async () => {
    try {
      const artGrid = await playlistRepository.getArtGrid(playlistID);
      setAlbumArtList(artGrid);
    } catch (error) {
      console.error('Error fetching album art grid:', error);
    }
  }

  // Add a function to generate a new random order
  const shufflePlaylist = () => {
    const newSeed = Math.floor(Math.random() * 1000000);
    setRandomSeed(newSeed);
    setSortColumn('random');
    setIsRandomOrder(true);
    
    // Update cookies and URL
    setCookie(`playlist_${playlistID}_sortColumn`, 'random');
    setCookie(`playlist_${playlistID}_randomSeed`, newSeed.toString());
    
    const newParams = new URLSearchParams(searchParams);
    newParams.set('sort', 'random');
    newParams.set('seed', newSeed.toString());
    setSearchParams(newParams, { replace: true });
  };

  // Add this state variable with your other state declarations
  const [initialFetchComplete, setInitialFetchComplete] = useState(false);

  // Update the fetchPlaylistDetails function
  const fetchPlaylistDetails = useCallback(async (isInitialLoad = false, targetPosition = null) => {
    try {
      if (isInitialLoad) {
        setPlaylistLoading(true);
        setInitialFetchComplete(false); // Reset flag for new initial loads
        
        // Get basic playlist info for the name on initial load
        const playlistInfo = await playlistRepository.getPlaylistDetails(playlistID);
        setName(playlistInfo.name);
        
        // Initialize total count to set up the virtual list
        setIsLoadingMore(true);
        const countResponse = await playlistRepository.getPlaylistEntries(playlistID, {
          filter: debouncedFilter,
          sortCriteria: sortColumn,
          sortDirection: sortDirection,
          includeHidden: showHidden, // Add this line to count query
          countOnly: true
        });

        setTotalCount(countResponse.total || 0);

        // create placeholder entries
        const placeholders = new Array(countResponse.total).fill(null).map((_, index) => {
          let entry = new PlaylistEntryStub();
          entry.order = index;
          return entry;
        });
        setEntries(placeholders);
      }
      
      // Determine which range to fetch
      let offset = 0;
      
      if (targetPosition !== null) {
        // For targeted scrolling, fetch data centered around the target position
        offset = Math.max(0, Math.floor(targetPosition - pageSize/2));
        if (offset + pageSize > totalCount) {
          // Adjust offset to prevent fetching beyond the end
          offset = Math.max(0, totalCount - pageSize);
        }
        setIsLoadingMore(true);
      } else if (!isInitialLoad) {
        // For normal pagination, fetch next batch
        offset = entries.length;
        setIsLoadingMore(true);
      }
      
      const filterParams = {
        filter: debouncedFilter,
        sortCriteria: sortColumn,
        sortDirection: sortDirection,
        limit: pageSize,
        offset: offset,
        includeHidden: showHidden,
        randomSeed: sortColumn === 'random' ? randomSeed : undefined
      };
      
      const response = await playlistRepository.getPlaylistEntries(playlistID, filterParams);
      const filteredEntries = response.entries;
      const mappedEntries = filteredEntries.map(entry => new PlaylistEntry(entry));
      
      // Create a sparse array that handles the jumped position properly
      if (targetPosition !== null) {
        setEntries(prevEntries => {
          // Create a new array with the correct total size
          const newEntries = new Array(totalCount).fill(null).map((_, index) => {
            // Start with minimal placeholder objects
            let entry = new PlaylistEntryStub();
            entry.order = index;
            return entry;
          });
          
          // Copy existing entries (non-placeholder) to the new array
          prevEntries.forEach((entry, i) => {
            if ("getTitle" in entry) {
              newEntries[i] = entry as PlaylistEntry;
            }
          });
          
          // Place the fetched entries at their correct positions
          mappedEntries.forEach((entry, index) => {
            if (offset + index < newEntries.length) {
              newEntries[offset + index] = entry;
            }
          });
          
          return newEntries;
        });
      } else if (isInitialLoad) {
        // On initial load, just set the entries directly
        setEntries(mappedEntries);
      } else {
        // For normal pagination, append to existing entries
        setEntries(prevEntries => [...prevEntries, ...mappedEntries]);
      }
      
      // Update page based on the offset we fetched
      const newPage = Math.floor(offset / pageSize);
      setPage(newPage);
      
      if (isInitialLoad) {
        setInitialFetchComplete(true); // Mark initial fetch as complete
        
        // Restore scroll position after initial load is complete and we have entries
        if (isRestoringScroll.current && scrollPositionRef.current > 0 && mappedEntries.length > 0) {
          // Use a timeout to ensure the virtual list is fully rendered with the new data
          setTimeout(() => {
            if (listRef.current && listRef.current.scrollTo) {
              const targetPosition = scrollPositionRef.current;
              listRef.current.scrollTo(targetPosition);
              
              // Keep the restoration flag active longer to prevent scroll events from saving
              setTimeout(() => {
                isRestoringScroll.current = false;
              }, 2000);
            } else {
              isRestoringScroll.current = false;
            }
          }, 500);
        } else {
          // Reset the flag if we're not restoring
          if (isRestoringScroll.current) {
            isRestoringScroll.current = false;
          }
        }
      }
      
      return { 
        fetchedRange: { start: offset, end: offset + mappedEntries.length - 1 }
      };
    } catch (error) {
      console.error('Error fetching playlist details:', error);
      return null;
    } finally {
      setPlaylistLoading(false);
      setIsLoadingMore(false);
    }
  }, [playlistID, debouncedFilter, sortColumn, sortDirection, pageSize, totalCount, entries.length, showHidden]); // showHidden was already in dependencies

  const pushToHistory = (entries) => {
    const newHistory = history.slice(0, historyIndex + 1);
    setHistory([...newHistory, entries]);
    setHistoryIndex(historyIndex + 1);
  };

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setEntries(history[historyIndex - 1]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setEntries(history[historyIndex + 1]);
    }
  };

  const addTracksToPlaylist = async (tracks: PlaylistEntry[]) => {
    const newOrder = entries.length ? entries[entries.length - 1].order + 1 : 0;

    const tracksToAdd = (Array.isArray(tracks) ? tracks : [tracks]).map((track, idx) => {
      let thisTrack = track;
      thisTrack.order = idx + newOrder;
      thisTrack.music_file_id = track.id;

      // set ID to a random number if not set
      thisTrack.id = track.id || Math.floor(Math.random() * (10000000 - 1000000) + 1000000);
      
      thisTrack.entry_type = track.entry_type || 'requested';
      return thisTrack;
    });

    pushToHistory(entries);

    const newEntries = [
      ...entries,
      ...tracksToAdd
    ];
    
    setEntries(newEntries);
    setTotalCount(prevCount => prevCount + tracksToAdd.length);

    playlistRepository.addTracks(playlistID, tracksToAdd, false);
        
    setSnackbar({
      open: true,
      message: `Added ${tracksToAdd.length} entries to ${name}`,
      severity: 'success'
    });
  };

  const handleRenamePlaylist = async (playlistID: number, newName: String) => {
    setName(newName, async () => {
      await playlistRepository.rename(playlistID, newName);
    });
  };

  const onRemoveByAlbum = async (album: String) => {
    if (!album) return;

    // identify indexes of tracks to remove
    const indexes = entries.map((entry, idx) => entry.getAlbum() === album ? idx : null).filter(idx => idx !== null);

    if (!window.confirm(`Are you sure you want to remove ${indexes.length} entries from the playlist?`)) {
      return;
    }
    
    playlistRepository.removeTracks(playlistID, indexes.map(i => entries[i]), false);
    setEntries(entries.filter((entry, idx) => !indexes.includes(idx)));
    setTotalCount(prevCount => prevCount - indexes.length);
  }

  const onRemoveByArtist = async (artist: String) => {
    if (!artist) return;

    const indexes = entries.map((entry, idx) => ((entry.getAlbumArtist() === artist) || (entry.getArtist() === artist)) ? idx : null).filter(idx => idx !== null);

    if (!window.confirm(`Are you sure you want to remove ${indexes.length} entries from the playlist?`)) {
      return;
    }

    playlistRepository.removeTracks(playlistID, indexes.map(i => entries[i]), false);
    setEntries(entries.filter((entry, idx) => !indexes.includes(idx)));
    setTotalCount(prevCount => prevCount - indexes.length);
  }

  const addSongsToPlaylist = async (songs: PlaylistEntry[]) => {
    const dupsResult = await playlistRepository.checkForDuplicates(playlistID, songs);
    if (dupsResult.length > 0) {
      const dups = dupsResult.map(e => `${e.getArtist()} - ${e.getTitle()}`);
      if (!window.confirm(`The following entries already exist in the playlist: ${dups.join(", ")}. Do you want to continue?`)) {
        return;
      }
    }

    await addTracksToPlaylist(songs);
  };

  const removeSongsFromPlaylist = async (indexes: number[]) => {
    const length = indexes.length;
    if ((length > 1) && !window.confirm(`Are you sure you want to remove ${length} entries from the playlist?`)) {
      return;
    }

    pushToHistory(entries);

    const entriesToRemove = entries.filter((e) => indexes.includes(e.id));

    const newEntries = entries
      .filter((e) => !indexes.includes(e.id))
      .map((entry, index) => { let thisEntry = entry; thisEntry.order = index; return thisEntry; });
    
    setEntries(newEntries);
    setTotalCount(prevCount => prevCount - length);

    playlistRepository.removeTracks(playlistID, entriesToRemove, false);
  }

  const exportPlaylist = async (id: number) => {
    playlistRepository.export(id, "m3u");
  };

  const exportPlaylistToJson = async (id: number) => {
    playlistRepository.export(id, "json");
  }

  const onSyncToPlex = async (forcePush: boolean = false) => {
    try {
      const response = await playlistRepository.syncToPlex(playlistID, forcePush);
      
      // Store the sync result for the log modal
      setSyncResult(response);
      setSyncLogModalOpen(true);

      const playlistName = (await playlistRepository.getPlaylistDetails(playlistID)).name;

      setSnackbar({
        open: true,
        message: `'${playlistName}' synced to Plex - Click to view details`,
        severity: 'success',
        action: () => setSyncLogModalOpen(true)
      });

      // refresh view
      await refreshPlaylist();
    } catch (error) {
      console.error('Error syncing to Plex:', error);
      setSnackbar({
        open: true,
        message: 'Error syncing to Plex',
        severity: 'error'
      });
    }
  };

  const refreshPlaylist = async () => {
    // Re-fetch playlist details and art grid
    await Promise.all([
      fetchPlaylistDetails(true),
      fetchPlaylistArtGrid()
    ]);
  };

  const onDragEnd = async (result) => {
    if (!result.destination) return;

    if (sortColumn !== 'order') {
      return;
    }

    const { source, destination } = result;

    // If dragging within playlist
    if (source.droppableId === 'playlist' && destination.droppableId === 'playlist') {
      const updatedTracks = Array.from(entries);
      const trackToMove = new PlaylistEntryStub(updatedTracks[source.index]);
      const [movedTrack] = updatedTracks.splice(source.index, 1);
      updatedTracks.splice(destination.index, 0, movedTrack);
      
      const updatedEntries = updatedTracks.map((track, index) => {
        let updatedTrack = track;
        track.order = index;
        return updatedTrack;
      });

      pushToHistory(entries);

      setEntries(updatedEntries);

      console.log(trackToMove);
      console.log(`Moving to ${destination.index}`)

      playlistRepository.reorderTracks(playlistID, [trackToMove], destination.index, false);
    }
  };

  const toggleTrackSelection = (trackId: number) => {
    setSelectedEntries(prev => {
      const newSelection = prev.includes(trackId)
        ? prev.filter(i => i !== trackId)
        : [...prev, trackId];
    
      // Update the "all selected" state based on the new selection
      setAllTracksSelected(newSelection.length === entries.filter(entry => entry && entry.id).length);
      return newSelection;
    });
  };

  const clearTrackSelection = () => {
    setSelectedEntries([]);
    setAllTracksSelected(false);
  };

  const removeSelectedTracks = async () => {
    removeSongsFromPlaylist(selectedEntries);
    clearTrackSelection();
  };

  const toggleAllTracks = () => {
    if (allPlaylistEntriesSelected) {
      setSelectedEntries([]);
      setAllTracksSelected(false);
    } else {
      // Select all track IDs that exist
      const allTrackIds = entries
        .filter(entry => entry && entry.id) // Only include entries that have an ID
        .map(entry => entry.id);
      setSelectedEntries(allTrackIds);
      setAllTracksSelected(true);
    }
  };

  const handleSnackbarClose = () => {
    setSnackbar(prev => ({ ...prev, open: false }));
  };

  const handleSort = (column: String) => {
    let newDirection = sortDirection;
    let newSeed = randomSeed;
    
    if (column === 'random') {
      // Generate a new random seed when switching to random order
      if (sortColumn !== 'random') {
        newSeed = Math.floor(Math.random() * 1000000);
        setRandomSeed(newSeed);
        setIsRandomOrder(true);
      }
      newDirection = 'asc'; // Random doesn't need direction, but keep consistent
    } else {
      setIsRandomOrder(false);
      if (sortColumn === column) {
        newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        setSortDirection(newDirection);
      } else {
        setSortColumn(column.toString());
        newDirection = 'asc';
        setSortDirection('asc');
      }
    }
    
    if (column !== sortColumn) {
      setSortColumn(column.toString());
    }
    
    // Save to cookies
    setCookie(`playlist_${playlistID}_sortColumn`, column.toString());
    setCookie(`playlist_${playlistID}_sortDirection`, newDirection);
    if (newSeed !== null) {
      setCookie(`playlist_${playlistID}_randomSeed`, newSeed.toString());
    }
    
    // Update URL query parameters while preserving other params
    const newParams = new URLSearchParams(searchParams);
    newParams.set('sort', column.toString());
    newParams.set('dir', newDirection);
    if (column === 'random' && newSeed !== null) {
      newParams.set('seed', newSeed.toString());
    } else {
      newParams.delete('seed');
    }
    setSearchParams(newParams, { replace: true });
  };

  const searchFor = (newFilter: SearchFilter) => {
    setSearchFilter(newFilter);
    setSearchPanelOpen(true);
  }

  const getSortIndicator = (column: String) => {
    if (sortColumn !== column) return null;
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  };

  // TODO: should happen up through parent component
  const onDeletePlaylist = async () => {
    if (!window.confirm('Are you sure you want to delete this playlist?')) {
      return;
    }
    
    try {
      await playlistRepository.deletePlaylist(playlistID);
      navigate('/');
    } catch (error) {
      console.error('Error deleting playlist:', error);
    }
  }

  const findSimilarTracksWithOpenAI = async (e, track: PlaylistEntry) => {
    setOpenAILoading(true);

    const similars = await openAIRepository.findSimilarTracks(track);
    const localFiles = await libraryRepository.findLocalFiles(similars);

    if (similars.length === 0) {
      window.alert('No similar tracks found with OpenAI.');
    }

    // prefer local files
    setSimilarTracks(localFiles.map(track => new PlaylistEntry(track)));

    setPosition({ x: e.clientX, y: e.clientY });
    setOpenAILoading(false);
  };

  const findSimilarTracks = async (e, track: PlaylistEntry) => {
    setLoading(true);

    const similars = await lastFMRepository.findSimilarTracks(track);
    const localFiles = await libraryRepository.findLocalFiles(similars);

    if (similars.length === 0) {
      window.alert('No similar tracks found with Last.FM.');
    }

    // prefer local files
    setSimilarTracks(localFiles.map(track => new PlaylistEntry(track)));

    setPosition({ x: e.clientX, y: e.clientY });
    setLoading(false);
  };

  const addSimilarTracks = (tracks: PlaylistEntry[]) => {
    addSongsToPlaylist(tracks);
    setSimilarTracks([]);
  }

  const handleShowDetails = (track: PlaylistEntry) => {
    setSelectedTrack(track);
    setShowTrackDetails(true);
  }

  const handleAddToOtherPlaylist = (tracks: PlaylistEntry[]) => {
    setTracksToAddToOtherPlaylist(tracks);
    setSelectPlaylistModalVisible(true);
  }

  const handleContextMenu = (e, track: PlaylistEntry) => {
    e.preventDefault();

    const isAlbum = track.entry_type === 'requested_album' || track.entry_type === 'album';
    const isMusicFile = track.entry_type === 'music_file';
    const isRequestedTrack = track.entry_type === 'requested' || track.entry_type === 'lastfm';
    const canEdit = isRequestedTrack || (track.entry_type === 'requested_album');  // Track can be edited if it's a requested track or album
    const isHidden = track.isHidden();

    const options = [
      { label: 'Details', onClick: () => handleShowDetails(track) },
      canEdit ? { label: 'Edit Details', onClick: () => handleEditItem(track) } : null,
      { label: 'Add to Playlist...', onClick: () => handleAddToOtherPlaylist([track]) },
      { label: 'Send to Search', onClick: () => searchFor({"album": track.getAlbum(), "artist": track.getArtist(), "title": track.getTitle()}) },
      !isAlbum ? { label: 'Find Similar Tracks (Last.fm)', onClick: (e) => findSimilarTracks(e, track) } : null,
      !isAlbum ? { label: 'Find Similar Tracks (OpenAI)', onClick: (e) => findSimilarTracksWithOpenAI(e, track) } : null,
      { label: 'Search for Album', onClick: () => searchFor({"title": "", "album": track.getAlbum(), "artist": track.getArtist()}) },
      { label: 'Search for Artist', onClick: () => searchFor({"title": "", "album": "", "artist": track.getAlbumArtist()}) },
      // Add hide/unhide options
      isHidden 
        ? { label: 'Unhide', onClick: () => unhideEntry(track.id) }
        : { label: 'Hide', onClick: () => hideEntry(track.id) },
      { label: 'Remove', onClick: () => removeSongsFromPlaylist([track.order]) },
      { label: 'Remove by Artist', onClick: () => onRemoveByArtist(track.getArtist()) },
      { label: 'Remove by Album', onClick: () => onRemoveByAlbum(track.getAlbum()) },
    ].filter(Boolean);

    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      options: options.filter(option => option !== null)
    });
  };

  const listRef = useRef<any>(null);
  
  // Add scroll position state and persistence
  const [scrollPosition, setScrollPosition] = useState(0);
  const scrollPositionRef = useRef(0);
  const isRestoringScroll = useRef(false);
  const scrollSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Save scroll position when component unmounts or playlist changes
  useEffect(() => {
    return () => {
      // Save final scroll position on cleanup (only if > 0)
      if (scrollPositionRef.current > 0) {
        setCookie(`playlist_${playlistID}_scrollPosition`, scrollPositionRef.current.toString(), 7);
      }
    };
  }, [playlistID]);

  // Replace loadMoreItems function with this smart pagination function
  const loadItemsForVisibleRange = useCallback(async (startIndex, stopIndex) => {
    // Don't load additional items until initial fetch is complete
    if (!initialFetchComplete || isLoadingMore) return;
    
    // Expand the range slightly to account for fast scrolling
    const bufferSize = 10;
    const expandedStart = Math.max(0, startIndex - bufferSize);
    const expandedStop = Math.min(totalCount - 1, stopIndex + bufferSize);
    
    // Calculate if there are any missing entries in the expanded visible range
    const hasMissingEntriesInView = () => {
      for (let i = expandedStart; i <= expandedStop; i++) {
        if (i < entries.length && (!entries[i] || !entries[i].details || !entries[i].details.title)) {
          return true;
        }
      }
      return false;
    };
    
    // Case 1: We have missing entries in the visible range
    if (hasMissingEntriesInView()) {
      const midpoint = Math.floor((expandedStart + expandedStop) / 2);
      console.log(`Missing entries in visible range ${expandedStart}-${expandedStop}, fetching at position ${midpoint}`);
      await fetchPlaylistDetails(false, midpoint);
      return;
    }
    
    // Case 2: User has jumped far beyond loaded data
    if (startIndex >= entries.length) {
      console.log(`Jumped to position beyond loaded data: ${startIndex}`);
      await fetchPlaylistDetails(false, startIndex);
      return;
    }
    
    // Case 3: User is scrolling backwards to unloaded entries
    if (startIndex < 20 && entries.length > 0 && (!entries[0] || !entries[0].details)) {
      await fetchPlaylistDetails(false, startIndex);
      return;
    }
    
    // Case 4: We're approaching the end of loaded data - fetch the next batch
    if (stopIndex >= entries.length - 20 && entries.length < totalCount) {
      console.log(`Approaching end of loaded data, fetching next batch`);
      await fetchPlaylistDetails(false);
      return;
    }
  }, [entries, isLoadingMore, totalCount, fetchPlaylistDetails, initialFetchComplete]);

  const historyEnabled = false;

  const historyControls = (
    <div className="history-controls">
      <button 
        onClick={undo} 
        disabled={historyIndex <= 0}
        title="Undo"
      >
        <FaUndo />
      </button>
      <button 
        onClick={redo} 
        disabled={historyIndex >= history.length - 1}
        title="Redo"
      >
        <FaRedo />
      </button>
    </div>
  );

  const handleEditItem = (item: PlaylistEntry) => {
    setItemToEdit(item);
    setEditModalOpen(true);
  };

  const saveEditedItem = async (editedItem: PlaylistEntry) => {
    try {
      const isAlbum = editedItem.getEntryType() === 'requested_album' || editedItem.getEntryType() === 'album';
      
      // Create updated item with edited details
      let updatedItem = editedItem;
      
      // Update backend
      await playlistRepository.unlinkTrack(playlistID, updatedItem.id, updatedItem);
      
      // Update local state
      pushToHistory(entries);
      const newEntries = [...entries];
      const itemIndex = entries.findIndex((entry: PlaylistEntryStub) => entry.order === updatedItem.order);
      newEntries[itemIndex] = updatedItem;
      setEntries(newEntries);
      
      setEditModalOpen(false);
      
      setSnackbar({
        open: true,
        message: `${isAlbum ? 'Album' : 'Track'} details updated`,
        severity: 'success'
      });
    } catch (error) {
      console.error('Error updating item:', error);
      setSnackbar({
        open: true,
        message: `Error updating details: ${error.message}`,
        severity: 'error'
      });
    }
  };

  // Add function to hide a single entry
  const hideEntry = async (entryId: number) => {
    try {
      // Optimistically update local state first
      pushToHistory(entries);
      const newEntries = entries.map(entry => 
        entry.id === entryId 
          ? { ...entry, is_hidden: true, date_hidden: new Date().toISOString() }
          : entry
      );
      
      // If not showing hidden entries, filter them out
      if (!showHidden) {
        setEntries(newEntries.filter(entry => !entry.is_hidden));
        setTotalCount(prevCount => prevCount - 1);
      } else {
        setEntries(newEntries);
      }
      
      // Update backend asynchronously
      await playlistRepository.hideEntries(playlistID, [entryId], true);
      
      setSnackbar({
        open: true,
        message: 'Entry hidden',
        severity: 'success'
      });
      
    } catch (error) {
      console.error('Error hiding entry:', error);
      
      // Revert the optimistic update on error
      setEntries(entries);
      if (!showHidden) {
        setTotalCount(prevCount => prevCount + 1);
      }
      
      setSnackbar({
        open: true,
        message: `Error hiding entry: ${error.message}`,
        severity: 'error'
      });
    }
  };

  // Add function to hide selected entries
  const hideSelectedTracks = async () => {
    const length = selectedEntries.length;
    if (length === 0) return;
    
    if (!window.confirm(`Are you sure you want to hide ${length} entries?`)) {
      return;
    }

    try {
      // Optimistically update local state first
      pushToHistory(entries);
      const newEntries = entries.map(entry => 
        selectedEntries.includes(entry.id) 
          ? { ...entry, is_hidden: true, date_hidden: new Date().toISOString() }
          : entry
      );
      
      // If not showing hidden entries, filter them out
      if (!showHidden) {
        setEntries(newEntries.filter(entry => !entry.is_hidden));
        setTotalCount(prevCount => prevCount - length);
      } else {
        setEntries(newEntries);
      }
      
      clearTrackSelection();
      
      // Update backend asynchronously
      await playlistRepository.hideEntries(playlistID, selectedEntries, true);
      
      setSnackbar({
        open: true,
        message: `Hidden ${length} entries`,
        severity: 'success'
      });
      
    } catch (error) {
      console.error('Error hiding entries:', error);
      
      // Revert the optimistic update on error
      setEntries(entries);
      if (!showHidden) {
        setTotalCount(prevCount => prevCount + length);
      }
      
      setSnackbar({
        open: true,
        message: `Error hiding entries: ${error.message}`,
        severity: 'error'
      });
    }
  };

  // Add function to unhide entries
  const unhideEntry = async (entryId: number) => {
    try {
      // Optimistically update local state first
      pushToHistory(entries);
      const newEntries = entries.map(entry => 
        entry.id === entryId 
          ? { ...entry, is_hidden: false, date_hidden: null }
          : entry
      );
      setEntries(newEntries);
      
      // Update backend asynchronously
      await playlistRepository.hideEntries(playlistID, [entryId], false);
      
      setSnackbar({
        open: true,
        message: 'Entry unhidden',
        severity: 'success'
      });
      
    } catch (error) {
      console.error('Error unhiding entry:', error);
      
      // Revert the optimistic update on error
      setEntries(entries);
      
      setSnackbar({
        open: true,
        message: `Error unhiding entry: ${error.message}`,
        severity: 'error'
      });
    }
  };

  // Add function to update notes
  const updateEntryNotes = useCallback(async (entryId: number, notes: string) => {
    try {
      // Find the entry to update
      const entryIndex = entries.findIndex(entry => entry.id === entryId);
      if (entryIndex === -1) return;
      
      const originalEntry = entries[entryIndex];
      
      // Create updated entry with new notes
      const updatedEntry = new PlaylistEntry({
        ...originalEntry,
        notes,
        details: { ...originalEntry.details, notes }
      });
      
      // Optimistically update local state first
      pushToHistory(entries);
      const newEntries = [...entries];
      newEntries[entryIndex] = updatedEntry;
      setEntries(newEntries);
      
      // Update backend using the new updateEntryNotes method
      await playlistRepository.updateEntryNotes(playlistID, entryId, notes);
      
      setSnackbar({
        open: true,
        message: 'Notes updated',
        severity: 'success'
      });
      
    } catch (error) {
      console.error('Error updating notes:', error);
      
      // Revert the optimistic update on error
      setEntries(entries);
      
      setSnackbar({
        open: true,
        message: `Error updating notes: ${error.message}`,
        severity: 'error'
      });
    }
  }, [entries, pushToHistory, setEntries, setSnackbar, playlistID]);

  // Update BatchActions to include hide option
  const BatchActions = ({ selectedCount, onRemove, onClear, onHide }) => (
    <div className="batch-actions" style={{ minHeight: '40px', visibility: selectedCount > 0 ? 'visible' : 'hidden' }}>
      <button onClick={onHide}>
        Hide {selectedCount} Selected Entries
      </button>
      <button onClick={onRemove}>
        Remove {selectedCount} Selected Entries
      </button>
      <button onClick={onClear}>
        Clear Selection
      </button>
    </div>
  );

  // Update the render to include the show hidden checkbox and updated batch actions
  return (
    <div className="main-playlist-view">
      <div className="playlist-header">
        <AlbumArtGrid
          artList={
            albumArtList ? albumArtList.map((album) => album.image_url) : []
          }
        />
        <h2 className="playlist-name">{name}</h2>
      </div>
      <div className="playlist-controls">
        {historyEnabled && historyControls}
        <button
          className="playlist-options"
          onClick={() => setPlaylistModalVisible(true)}
        >
          ...
        </button>
        
        <button
          className="column-config-btn"
          onClick={() => {
            console.log('Column config button clicked');
            console.log('Current columnConfigOpen state:', columnConfigOpen);
            setColumnConfigOpen(true);
            console.log('Set columnConfigOpen to true');
          }}
          title="Configure columns"
        >
          Columns
        </button>

        <div className="filter-container">
          <input
            type="text"
            placeholder="Filter playlist..."
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
            }}
            className="filter-input"
          />

          {filter && (
            <button
              className="clear-filter"
              onClick={() => {
                setFilter("");
              }}
            >
              Clear
            </button>
          )}

          <label className="show-hidden-label">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(e) => {
                setShowHidden(e.target.checked);

                // This will trigger a re-fetch via the useEffect
              }}
            />
            Show Hidden
          </label>

          <span className="filter-count">
            {totalCount} tracks{" "}
            {filter
              ? filter.trim() !== debouncedFilter.trim()
                ? "(filtering...)"
                : "(filtered)"
              : ""}{" "}
            {showHidden ? "(including hidden)" : ""}
          </span>
        </div>

        <BatchActions
          selectedCount={selectedEntries.length}
          onRemove={removeSelectedTracks}
          onClear={clearTrackSelection}
          onHide={hideSelectedTracks} // Add this line
        />

        {/* Add random order button */}
        <button
          className={`random-button ${isRandomOrder ? "active" : ""}`}
          onClick={() => {
            if (isRandomOrder) {
              // Return to original order
              setSortColumn("order");
              setSortDirection("asc");
              setIsRandomOrder(false);
              setRandomSeed(null);

              const newParams = new URLSearchParams(searchParams);
              newParams.set("sort", "order");
              newParams.set("dir", "asc");
              newParams.delete("seed");
              setSearchParams(newParams, { replace: true });
            } else {
              shufflePlaylist();
            }
          }}
          title={
            isRandomOrder ? "Return to original order" : "Shuffle playlist"
          }
        >
          {isRandomOrder ? "🔁" : "🔀"} {isRandomOrder ? "Unshuffle" : "Shuffle"}
        </button>
      </div>

      <div className="playlist-container">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="playlist-grid-header-row" style={{ gridTemplateColumns: getGridTemplate() }}>
            <div className="grid-cell" style={{ overflow: 'visible' }}>
              <input
                type="checkbox"
                checked={allPlaylistEntriesSelected}
                onChange={toggleAllTracks}
              />
              <span className="clickable" onClick={() => handleSort("order")}>
                # {getSortIndicator("order")}
              </span>
            </div>
            
            {visibleColumns.map((column, index) => {
              const isLastColumn = index === visibleColumns.length - 1;
              
              const headerContent = (() => {
                switch (column) {
                  case 'artistAlbum':
                    return (
                      <span className="clickable" onClick={() => handleSort("artist")}>
                        Artist/Album {getSortIndicator("artist")}
                      </span>
                    );
                  case 'artist':
                    return (
                      <span className="clickable" onClick={() => handleSort("artist")}>
                        Artist {getSortIndicator("artist")}
                      </span>
                    );
                  case 'album':
                    return (
                      <span className="clickable" onClick={() => handleSort("album")}>
                        Album {getSortIndicator("album")}
                      </span>
                    );
                  case 'title':
                    return (
                      <span className="clickable" onClick={() => handleSort("title")}>
                        Title {getSortIndicator("title")}
                      </span>
                    );
                  case 'notes':
                    return <span>Notes</span>;
                  default:
                    return null;
                }
              })();
              
              return (
                <div key={column} className="grid-cell resizable-header" style={{ position: 'relative' }}>
                  {headerContent}
                  {(!isLastColumn || column === 'notes') && (
                    <div 
                      className="resize-handle"
                      style={{
                        position: 'absolute',
                        right: '-2px',
                        top: '0',
                        bottom: '0',
                        width: '4px',
                        cursor: 'col-resize',
                        backgroundColor: 'transparent',
                        zIndex: 10
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const startX = e.clientX;
                        const startWidth = columnWidths[column] || defaultColumnWidths[column];
                        
                        const handleMouseMove = (moveEvent: MouseEvent) => {
                          const diff = moveEvent.clientX - startX;
                          const newWidth = startWidth + diff;
                          updateColumnWidth(column, newWidth);
                        };
                        
                        const handleMouseUp = () => {
                          document.removeEventListener('mousemove', handleMouseMove);
                          document.removeEventListener('mouseup', handleMouseUp);
                        };
                        
                        document.addEventListener('mousemove', handleMouseMove);
                        document.addEventListener('mouseup', handleMouseUp);
                      }}
                    >
                      {/* Visual resize indicator */}
                      <div style={{
                        position: 'absolute',
                        right: '1px',
                        top: '20%',
                        bottom: '20%',
                        width: '2px',
                        backgroundColor: '#ddd',
                        opacity: 0,
                        transition: 'opacity 0.2s'
                      }} className="resize-indicator" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <Droppable
            droppableId="playlist"
            mode="virtual"
            renderClone={(provided, snapshot, rubric) => (
              <PlaylistEntryRow
                ref={provided.innerRef}
                {...provided.draggableProps}
                className="playlist-grid-row"
                style={{ gridTemplateColumns: getGridTemplate() }}
                isDragging={snapshot.isDragging}
                entry={new PlaylistEntry(entries[rubric.source.index])}
                isChecked={selectedEntries.includes(rubric.source.index)}
                handleContextMenu={handleContextMenu}
                dragHandleProps={provided.dragHandleProps}
                visibleColumns={visibleColumns}
                onNotesUpdate={updateEntryNotes}
              />
            )}
          >
            {(provided, snapshot) => (
              <div className="playlist-grid-content" ref={provided.innerRef}>
                <AutoSizer>
                  {({ height, width }) => (
                    <List
                      ref={listRef}
                      height={height}
                      itemCount={totalCount}
                      itemSize={50}
                      width={width}
                      itemData={{
                        entries: entries,
                        toggleTrackSelection,
                        selectedEntries,
                        sortColumn,
                        handleContextMenu: handleContextMenu,
                        isDraggingOver: snapshot.isDraggingOver,
                        totalCount: totalCount,
                        visibleColumns,
                        gridTemplate: getGridTemplate(),
                        updateEntryNotes,
                      }}
                      overscanCount={50} // Increased from 20 to handle fast scrolling better
                      onItemsRendered={({
                        visibleStartIndex,
                        visibleStopIndex,
                      }) => {
                        // Store the visible range
                        setVisibleStartIndex(visibleStartIndex);
                        setVisibleStopIndex(visibleStopIndex);

                        // Use requestAnimationFrame to ensure this runs after the render cycle
                        requestAnimationFrame(() => {
                          loadItemsForVisibleRange(
                            visibleStartIndex,
                            visibleStopIndex
                          );
                        });
                      }}
                      onScroll={({ scrollOffset }) => {
                        // During restoration, don't update the scroll position reference
                        // to preserve the target restoration position
                        if (!isRestoringScroll.current) {
                          scrollPositionRef.current = scrollOffset;
                          setScrollPosition(scrollOffset);
                          
                          // Debounce saving to cookies to avoid excessive writes
                          // Only save non-zero positions to avoid overwriting with reset positions
                          if (scrollOffset > 0) {
                            if (scrollSaveTimeoutRef.current) {
                              clearTimeout(scrollSaveTimeoutRef.current);
                            }
                            scrollSaveTimeoutRef.current = setTimeout(() => {
                              // Set cookie to expire in 7 days for better persistence across browser sessions
                              setCookie(`playlist_${playlistID}_scrollPosition`, scrollOffset.toString(), 7);
                            }, 1000); // Save after 1 second of no scrolling
                          }
                        }
                      }}
                    >
                      {Row}
                    </List>
                  )}
                </AutoSizer>
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>

      <BatchActions
        selectedCount={selectedEntries.length}
        onRemove={removeSelectedTracks}
        onClear={clearTrackSelection}
        onHide={hideSelectedTracks} // Add this line
      />

      <SearchResultsGrid
        filter={searchFilter}
        onAddSongs={addSongsToPlaylist}
        visible={searchPanelOpen}
        playlistID={playlistID}
        setSnackbar={setSnackbar}
        onPanelClose={() => setSearchPanelOpen(false)}
      />

      {contextMenu.visible && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu({ visible: false })}
          options={contextMenu.options}
        />
      )}

      {!!similarTracks.length && (
        <SimilarTracksPopup
          x={position.x}
          y={position.y}
          tracks={similarTracks}
          onClose={() => setSimilarTracks([])}
          onAddTracks={(tracks) => addSimilarTracks(tracks)}
        />
      )}

      {showTrackDetails && selectedTrack && (
        <TrackDetailsModal
          entry={selectedTrack}
          playlistId={playlistID}
          onClose={() => setShowTrackDetails(false)}
          onEntryUpdated={(updatedEntry) => {
            // Update the entry in your playlist state
            const newEntries = [...entries];
            const entryIndex = entries.findIndex(
              (e) => e.id === updatedEntry.id
            );
            if (entryIndex !== -1) {
              newEntries[entryIndex] = updatedEntry;
              setEntries(newEntries);
            }
          }}
        />
      )}

      {syncConfigOpen && (
        <SyncConfig
          playlistId={playlistID}
          onClose={() => setSyncConfigOpen(false)}
          visible={syncConfigOpen}
          onSyncResult={(result) => {
            setSyncResult(result);
            setSyncLogModalOpen(true);
          }}
        />
      )}

      {playlistModalVisible && (
        <BaseModal
          title="Playlist Options"
          options={[
            {
              label: "Export to m3u",
              action: () => exportPlaylist(playlistID),
            },
            {
              label: "Export to JSON",
              action: () => exportPlaylistToJson(playlistID),
            },
            {
              label: "Sync Options",
              action: () => {
                setSyncConfigOpen(true);
              },
            },
            { label: "Sync Now", action: () => onSyncToPlex(false) },
            { 
              label: "Force Push Sync", 
              action: () => {
                if (window.confirm(
                  "⚠️ Force Push will remove ALL items from remote playlists and replace them with your local playlist.\n\n" +
                  "This action cannot be undone and will overwrite any changes made directly in remote services.\n\n" +
                  "Are you sure you want to continue?"
                )) {
                  onSyncToPlex(true);
                }
              }
            },
            { label: "Delete Playlist", action: onDeletePlaylist },
          ]}
          onClose={() => setPlaylistModalVisible(false)}
          onBackdropClick={() => setPlaylistModalVisible(false)}
        />
      )}

      <Snackbar
        open={snackbar.open}
        message={snackbar.message}
        severity={snackbar.severity}
        onClose={handleSnackbarClose}
      />

      {playlistLoading && (
        <div className="loading-overlay">
          <div className="spinner-container">
            <BiLoaderAlt className="spinner-icon" />
          </div>
        </div>
      )}

      {editModalOpen && (
        <EditItemModal
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          item={itemToEdit}
          onSave={saveEditedItem}
        />
      )}

      {selectPlaylistModalVisible && (
        <SelectPlaylistModal
          isOpen={selectPlaylistModalVisible}
          onClose={() => setSelectPlaylistModalVisible(false)}
          selectedEntries={tracksToAddToOtherPlaylist}
          setSnackbar={setSnackbar}
        />
      )}

      {syncLogModalOpen && (
        <SyncLogModal
          open={syncLogModalOpen}
          onClose={() => setSyncLogModalOpen(false)}
          syncResult={syncResult}
          playlistName={name}
        />
      )}

      {/* Column Configuration Modal */}
      {(() => {
        console.log('Modal render check - columnConfigOpen:', columnConfigOpen);
        console.log('availableColumns:', availableColumns);
        console.log('visibleColumns:', visibleColumns);
        return null;
      })()}
      
      {/* Column Configuration Modal */}
      {columnConfigOpen && (
        <div style={{
          position: 'fixed',
          top: '0',
          left: '0',
          right: '0',
          bottom: '0',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }} onClick={() => setColumnConfigOpen(false)}>
          <div 
            className="column-config-modal"
            style={{
              background: 'white',
              borderRadius: '8px',
              padding: '0',
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
            <div className="column-config-content">
              <p>Select which columns to display and drag to reorder:</p>
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
                      />
                      <div>
                        <span className="column-label">{column.label}</span>
                        <small className="column-description">{column.description}</small>
                      </div>
                    </label>
                  );
                })}
                
                {/* Hidden columns that can be added */}
                {availableColumns
                  .filter(column => !visibleColumns.includes(column.key))
                  .map(column => (
                    <label key={column.key} className="column-checkbox-item hidden-column">
                      <span style={{ width: '20px', marginRight: '8px' }}></span>
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={(e) => {
                          if (e.target.checked) {
                            updateColumnVisibility([...visibleColumns, column.key]);
                          }
                        }}
                      />
                      <div>
                        <span className="column-label" style={{ opacity: 0.6 }}>{column.label}</span>
                        <small className="column-description" style={{ opacity: 0.6 }}>{column.description}</small>
                      </div>
                    </label>
                  ))
                }
              </div>
              <div className="column-config-actions">
                <button 
                  onClick={() => {
                    updateColumnVisibility(defaultColumns);
                    setColumnWidths(defaultColumnWidths);
                    setCookie(`playlist_${playlistID}_columnWidths`, JSON.stringify(defaultColumnWidths));
                  }}
                  className="reset-columns-btn"
                >
                  Reset to Default
                </button>
                <button 
                  onClick={() => setColumnConfigOpen(false)}
                  className="close-config-btn"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlaylistGrid;