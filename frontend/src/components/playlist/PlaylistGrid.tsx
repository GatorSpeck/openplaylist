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
import { FixedSizeList as List } from 'react-window';
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

const BatchActions = ({ selectedCount, onRemove, onClear }) => (
  <div className="batch-actions" style={{ minHeight: '40px', visibility: selectedCount > 0 ? 'visible' : 'hidden' }}>
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
    totalCount
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
        style={style}
        className={`playlist-grid-row loading-row ${index % 2 === 0 ? 'even-row' : 'odd-row'}`}
      >
        <div className="grid-cell">{selectedEntries.includes(index) ? "✔" : index + 1}</div>
        <div className="grid-cell">Loading...</div>
        <div className="grid-cell"></div>
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
          {...provided.draggableProps} // Spread draggableProps on the main component
          style={{
            ...style,
            ...provided.draggableProps.style,
          }}
          className={`playlist-grid-row ${track.order % 2 === 0 ? 'even-row' : 'odd-row'} ${sortColumn !== 'order' ? 'drag-disabled' : ''}`}
          isDragging={snapshot.isDragging}
          onToggle={() => toggleTrackSelection(track.id)}
          onContextMenu={(e) => handleContextMenu(e, track)}
          isChecked={selectedEntries.includes(track.id)}
          entry={track}
          dragHandleProps={provided.dragHandleProps} // Pass dragHandleProps separately
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
    const validColumns = ['order', 'title', 'artist', 'album'];
    
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

  const getInitialFilter = (): string => {
    // First check URL params
    const filterParam = searchParams.get('filter');
    if (filterParam) {
      return filterParam;
    }
  };

  // Replace your current parameter initialization with this useEffect
  useEffect(() => {
    // Process URL params and cookies only once at component initialization
    const initialSortColumn = getSortColumnFromParam(searchParams.get('sort'));
    const initialSortDirection = getSortDirectionFromParam(searchParams.get('dir'));
    const initialFilter = getInitialFilter();
    
    // Set the state values all at once
    setSortColumn(initialSortColumn);
    setSortDirection(initialSortDirection);
    setFilter(initialFilter);
    
    // Mark parameters as initialized
    setParamsInitialized(true);
  }, [playlistID]); // Only run when playlistID changes

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

  // Apply debouncing to the filter
  useEffect(() => {
    // Set a timer to update the debounced filter after typing stops
    const timer = setTimeout(() => {
      setDebouncedFilter(filter);
    }, 500); // 500ms debounce delay

    // Clean up the timer if filter changes before timeout completes
    return () => clearTimeout(timer);
  }, [filter]);

  // Replace your current useEffect for loading data with this one
  useEffect(() => {
    // Only fetch data after params are initialized
    if (paramsInitialized) {
      setPage(0); // Reset page on filter/sort changes
      fetchPlaylistArtGrid();
      fetchPlaylistDetails(true);
    }
  }, [playlistID, debouncedFilter, sortColumn, sortDirection, paramsInitialized]);

  const fetchPlaylistArtGrid = async () => {
    try {
      const artGrid = await playlistRepository.getArtGrid(playlistID);
      setAlbumArtList(artGrid);
    } catch (error) {
      console.error('Error fetching album art grid:', error);
    }
  }

  const fetchPlaylistDetails = useCallback(async (isInitialLoad = false, targetPosition = null) => {
    try {
      if (isInitialLoad) {
        setPlaylistLoading(true);
        // Get basic playlist info for the name on initial load
        const playlistInfo = await playlistRepository.getPlaylistDetails(playlistID);
        setName(playlistInfo.name);
        
        // Initialize total count to set up the virtual list
        setIsLoadingMore(true);
        const countResponse = await playlistRepository.getPlaylistEntries(playlistID, {
          filter: debouncedFilter,
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
        offset: offset
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
  }, [playlistID, debouncedFilter, sortColumn, sortDirection, pageSize, totalCount, entries.length]);

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

  const onSyncToPlex = async () => {
    try {
      await playlistRepository.syncToPlex(playlistID);

      const playlistName = (await playlistRepository.getPlaylistDetails(playlistID)).name;

      setSnackbar({
        open: true,
        message: `'${playlistName}' synced to Plex`
      })
    } catch (error) {
      console.error('Error exporting playlist:', error);
    }
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
      const [movedTrack] = updatedTracks.splice(source.index, 1);
      updatedTracks.splice(destination.index, 0, movedTrack);
      
      const updatedEntries = updatedTracks.map((track, index) => {
        let updatedTrack = track;
        track.order = index;
        return updatedTrack;
      });

      pushToHistory(entries);

      setEntries(updatedEntries);

      playlistRepository.reorderTracks(playlistID, [movedTrack], destination.index, false);
    }
  };

  const toggleTrackSelection = (index: number) => {
    setSelectedEntries(prev => {
      const newSelection = prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index];
      setAllTracksSelected(newSelection.length === entries.length);
      return newSelection;
    });
  };

  const clearTrackSelection = () => {
    setSelectedEntries([]);
  };

  const removeSelectedTracks = async () => {
    removeSongsFromPlaylist(selectedEntries);
    clearTrackSelection();
  };

  const toggleAllTracks = () => {
    if (allPlaylistEntriesSelected) {
      setSelectedEntries([]);
    } else {
      setSelectedEntries(entries.map((_, index) => index));
    }
    setAllTracksSelected(!allPlaylistEntriesSelected);
  };

  const handleSnackbarClose = () => {
    setSnackbar(prev => ({ ...prev, open: false }));
  };

  const handleSort = (column: String) => {
    let newDirection = sortDirection;
    
    if (sortColumn === column) {
      newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      setSortDirection(newDirection);
    } else {
      setSortColumn(column.toString());
      newDirection = 'asc';
      setSortDirection('asc');
    }
    
    // Save to cookies
    setCookie(`playlist_${playlistID}_sortColumn`, column.toString());
    setCookie(`playlist_${playlistID}_sortDirection`, newDirection);
    
    // Update URL query parameters while preserving other params
    const newParams = new URLSearchParams(searchParams);
    newParams.set('sort', column.toString());
    newParams.set('dir', newDirection);
    setSearchParams(newParams, { replace: true }); // Replace instead of push to avoid extra history entries
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

    // prefer local files
    setSimilarTracks(localFiles.map(track => new PlaylistEntry(track)));

    setPosition({ x: e.clientX, y: e.clientY });
    setOpenAILoading(false);
  };

  const findSimilarTracks = async (e, track: PlaylistEntry) => {
    setLoading(true);

    const similars = await lastFMRepository.findSimilarTracks(track);
    const localFiles = await libraryRepository.findLocalFiles(similars);

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

  const unMatchTrack = (track: PlaylistEntry) => {
    // convert this music track to a RequestedTrack
    let newTrack = track;
    track.entry_type = "requested";

    // Update backend
    playlistRepository.replaceTrack(playlistID, track.id, newTrack);

    // Update local state
    pushToHistory(entries);
    const newEntries = [...entries];
    const trackIndex = entries.findIndex(entry => entry.order === track.order);
    newEntries[trackIndex] = mapToTrackModel(newTrack);
    setEntries(newEntries);
  }

  const matchTrack = async (track: PlaylistEntry) => {
    try {
      setPlaylistLoading(true);

      console.log(track);
      
      // Search for potential matches based on track info
      const searchQuery = `${track.getArtist()} ${track.getTitle()}`;
      const potentialMatches = await libraryRepository.searchLibrary(searchQuery);
      
      if (!potentialMatches || potentialMatches.length === 0) {
        setSnackbar({
          open: true,
          message: `No matching entries found for "${track.getTitle()}"`,
          severity: 'warning'
        });
      }
      
      // Set up the modal state
      setMatchingTracks(potentialMatches);
      setTrackToMatch(track);
      setMatchModalOpen(true);
    } catch (error) {
      console.error('Error matching entry:', error);
      setSnackbar({
        open: true,
        message: `Error matching entry: ${error.message}`,
        severity: 'error'
      });
    } finally {
      setPlaylistLoading(false);
    }
  };

  const replaceTrackWithMatch = async (selectedMatch: PlaylistEntry) => {
    try {
      if (!trackToMatch) return;
      
      // Get the track index in the playlist
      const trackIndex = entries.findIndex(entry => entry.order === trackToMatch.order);
      if (trackIndex === -1) return;
      
      // Create the new track entry
      const newTrack = {
        ...mapToTrackModel(selectedMatch),
        id: trackToMatch.id,
        order: trackToMatch.order,
        music_file_id: selectedMatch.id,
        entry_type: 'music_file',
        details: selectedMatch.details
      };
      
      // Update backend
      console.log(trackToMatch.id);
      if (!trackToMatch.id) {
        console.error('No track ID found for track to match');
        return;
      }
      await playlistRepository.replaceTrack(playlistID, trackToMatch.id, newTrack);
      
      // Update local state
      pushToHistory(entries);
      const newEntries = [...entries];
      newEntries[trackIndex] = newTrack;
      setEntries(newEntries);
      
      setMatchModalOpen(false);
      
      setSnackbar({
        open: true,
        message: `Entry "${trackToMatch.getTitle()}" matched to "${selectedMatch.getTitle()}"`,
        severity: 'success'
      });
    } catch (error) {
      console.error('Error replacing entry:', error);
      setSnackbar({
        open: true,
        message: `Error replacing entry: ${error.message}`,
        severity: 'error'
      });
    }
  };

  const matchAlbum = async (album: PlaylistEntry) => {
    try {
      setPlaylistLoading(true);
      
      setAlbumToMatch(album);
      setAlbumMatchModalOpen(true);
    } catch (error) {
      console.error('Error matching album:', error);
      setSnackbar({
        open: true,
        message: `Error searching for album: ${error.message}`,
        severity: 'error'
      });
    } finally {
      setPlaylistLoading(false);
    }
  };
  
  const replaceAlbumWithMatch = async (selectedMatch: PlaylistEntry) => {
    try {
      if (!albumToMatch) return;
      
      // Get the track index in the playlist
      const trackIndex = entries.findIndex(entry => entry.order === albumToMatch.order);
      if (trackIndex === -1) return;
      
      // Create a new album entry with the Last.fm metadata
      let newAlbum = selectedMatch.toRequestedAlbum();
      newAlbum.id = albumToMatch.id;
      newAlbum.order = albumToMatch.order;
      
      // Update backend
      if (!albumToMatch.id) {
        console.error('No album ID found for album to match');
        return;
      }

      await playlistRepository.replaceTrack(playlistID, albumToMatch.id, newAlbum);
      
      // Update local state
      pushToHistory(entries);
      const newEntries = [...entries];
      newEntries[trackIndex] = newAlbum;
      setEntries(newEntries);
      
      setAlbumMatchModalOpen(false);
      
      setSnackbar({
        open: true,
        message: `Album matched to "${selectedMatch.getAlbum()}" by ${selectedMatch.getArtist()}`,
        severity: 'success'
      });
    } catch (error) {
      console.error('Error replacing album:', error);
      setSnackbar({
        open: true,
        message: `Error replacing album: ${error.message}`,
        severity: 'error'
      });
    }
  };

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
  
    const options = [
      { label: 'Details', onClick: () => handleShowDetails(track) },
      canEdit ? { label: 'Edit Details', onClick: () => handleEditItem(track) } : null,
      { label: 'Add to Playlist...', onClick: () => handleAddToOtherPlaylist([track]) },
      { label: 'Send to Search', onClick: () => searchFor({"album": track.getAlbum(), "artist": track.getArtist(), "title": track.getTitle()}) },
      !isAlbum ? { label: 'Find Similar Tracks (Last.fm)', onClick: (e) => findSimilarTracks(e, track) } : null,
      !isAlbum ? { label: 'Find Similar Tracks (OpenAI)', onClick: (e) => findSimilarTracksWithOpenAI(e, track) } : null,
      { label: 'Search for Album', onClick: () => searchFor({"title": "", "album": track.getAlbum(), "artist": track.getArtist()}) },
      { label: 'Search for Artist', onClick: () => searchFor({"title": "", "album": "", "artist": track.getAlbumArtist()}) },
      { label: 'Remove', onClick: () => removeSongsFromPlaylist([track.order]) },
      { label: 'Remove by Artist', onClick: () => onRemoveByArtist(track.getArtist()) },
      { label: 'Remove by Album', onClick: () => onRemoveByAlbum(track.getAlbum()) },
      isRequestedTrack ? { label: 'Match to Music File', onClick: () => matchTrack(track) } : null,
      isMusicFile ? { label: 'Re-Match Track', onClick: () => matchTrack(track) } : null,
      isMusicFile ? { label: 'Unmatch Track', onClick: () => unMatchTrack(track) } : null,
      isAlbum ? { label: 'Match Album on Last.fm', onClick: () => matchAlbum(track) } : null
    ].filter(Boolean);
  
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      options: options.filter(option => option !== null)
    });
  }

  const listRef = useRef(null);

  // Replace loadMoreItems function with this smart pagination function
  const loadItemsForVisibleRange = useCallback(async (startIndex, stopIndex) => {
    // If we're already loading data, skip this request
    if (isLoadingMore) return;
    
    // Calculate if there are any missing entries in the visible range
    const hasMissingEntriesInView = () => {
      for (let i = startIndex; i <= stopIndex; i++) {
        if (i < entries.length && (!entries[i] || !entries[i].details || !entries[i].details.title)) {
          return true;
        }
      }
      return false;
    };
    
    // Case 1: We have missing entries in the visible range
    if (hasMissingEntriesInView()) {
      const midpoint = Math.floor((startIndex + stopIndex) / 2);
      console.log(`Missing entries in visible range, fetching at position ${midpoint}`);
      await fetchPlaylistDetails(false, midpoint);
      return;
    }
    
    // Case 2: User has jumped far beyond loaded data
    if (startIndex >= entries.length) {
      console.log(`Jumped to position beyond loaded data: ${startIndex}`);
      fetchPlaylistDetails(false, startIndex);
      return;
    }
    
    // Case 3: User is scrolling backwards to unloaded entries
    if (startIndex < 20 && entries[0] === null) {
      console.log(`Scrolling backwards to unloaded entries, fetching at position ${startIndex}`);
      fetchPlaylistDetails(false, startIndex);
      return;
    }
    
    // Case 4: We're approaching the end of loaded data - fetch the next batch
    if (stopIndex >= entries.length - 20 && entries.length < totalCount) {
      console.log(`Approaching end of loaded data, fetching next batch`);
      fetchPlaylistDetails(false);
      return;
    }
  }, [entries, isLoadingMore, totalCount, fetchPlaylistDetails]);

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
      await playlistRepository.replaceTrack(playlistID, updatedItem.id, updatedItem);
      
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

  return (
    <div className="main-playlist-view">
      <div className="playlist-header">
        <AlbumArtGrid
          artList={albumArtList ? albumArtList.map(album => album.image_url) : []}
        />
        <h2 className="playlist-name">{name}</h2>
      </div>
      <div className="playlist-controls">
        {historyEnabled && historyControls}
        <button onClick={() => setPlaylistModalVisible(true)}>
          ...
        </button>
        <div className="filter-container">
          <input
            type="text"
            placeholder="Filter playlist..."
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              // Direct cookie update isn't needed here as we handle it in useEffect with the debounced value
            }}
            className="filter-input"
          />

          {filter && (
            <button 
              className="clear-filter"
              onClick={() => {
                setFilter('');
              }}
            >
              Clear
            </button>
          )}
          <span className="filter-count">
            {totalCount} tracks {filter ? 
              (filter !== debouncedFilter ? '(filtering...)' : '(filtered)') 
              : ''}
          </span>
        </div>

        <BatchActions 
          selectedCount={selectedEntries.length}
          onRemove={removeSelectedTracks}
          onClear={clearTrackSelection}
        />
      </div>

      <div className="playlist-container">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="playlist-grid-header-row">
            <div className="grid-cell">
              <input type="checkbox" checked={allEntriesSelected} onChange={toggleAllTracks} />
              <span className="clickable" onClick={() => handleSort('order')}>
                # {getSortIndicator('order')}
              </span>
            </div>
            
            <div className="grid-cell clickable" onClick={() => handleSort('artist')}>
              Artist {getSortIndicator('artist')}
            </div>
            <div className="grid-cell clickable" onClick={() => handleSort('title')}>
              Song {getSortIndicator('title')}
            </div>
          </div>

          <Droppable
            droppableId="playlist"
            mode="virtual"
            renderClone={(provided, snapshot, rubric) => (
              <PlaylistEntryRow
                ref={provided.innerRef}
                {...provided.draggableProps}
                className="playlist-grid-row"
                isDragging={snapshot.isDragging}
                entry={new PlaylistEntry(entries[rubric.source.index])}
                isChecked={selectedEntries.includes(rubric.source.index)}
                handleContextMenu={handleContextMenu}
                dragHandleProps={provided.dragHandleProps}
              />
            )}
          >
            {(provided, snapshot) => (
              <div 
                className="playlist-grid-content" 
                ref={provided.innerRef}
              >
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
                        totalCount: totalCount
                      }}
                      overscanCount={20} // Increased overscan for jumping around
                      onItemsRendered={({ visibleStartIndex, visibleStopIndex }) => {
                        // Store the visible range
                        setVisibleStartIndex(visibleStartIndex);
                        setVisibleStopIndex(visibleStopIndex);
                        
                        // ALWAYS check if we need to load data for the current visible range
                        // Don't just check for the end of the list
                        loadItemsForVisibleRange(visibleStartIndex, visibleStopIndex);
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

      {!!(similarTracks.length) && (
        <SimilarTracksPopup
          x={position.x}
          y={position.y}
          tracks={similarTracks}
          onClose={() => setSimilarTracks([])}
          onAddTracks={(tracks) => addSimilarTracks(tracks)}
        />
      )}

      {showTrackDetails && (
        <TrackDetailsModal
          entry={selectedTrack}
          onClose={() => setShowTrackDetails(false)}
        />
      )}

      {playlistModalVisible && (
        <BaseModal
          title="Playlist Options"
          options={[
            { label: 'Export to m3u', action: () => exportPlaylist(playlistID) },
            { label: 'Export to JSON', action: () => exportPlaylistToJson(playlistID) },
            { label: 'Sync to Plex', action: onSyncToPlex },
            { label: 'Delete Playlist', action: onDeletePlaylist }
          ]}
          onClose={() => setPlaylistModalVisible(false)}
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

      {matchModalOpen && (
        <MatchTrackModal
          isOpen={matchModalOpen}
          onClose={() => setMatchModalOpen(false)}
          track={trackToMatch}
          initialMatches={matchingTracks.map(track => new PlaylistEntry(track))}
          onMatchSelect={replaceTrackWithMatch}
          setSnackbar={setSnackbar}
        />
      )}

      {albumMatchModalOpen && (
        <MatchAlbumModal
          isOpen={albumMatchModalOpen}
          onClose={() => setAlbumMatchModalOpen(false)}
          track={albumToMatch}
          onMatchSelect={replaceAlbumWithMatch}
          setSnackbar={setSnackbar}
        />
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
    </div>
  );
};

export default PlaylistGrid;