import React, { useState, useMemo, useEffect, useRef, memo } from 'react';
import { Droppable, Draggable, DragDropContext } from 'react-beautiful-dnd';
import Snackbar from '../Snackbar';
import mapToTrackModel from '../../lib/mapToTrackModel';
import '../../styles/PlaylistGrid.css';
import SearchResultsGrid from '../search/SearchResultsGrid';
import PlaylistItemContextMenu from './PlaylistItemContextMenu';
import { FaUndo, FaRedo } from 'react-icons/fa';
import { useParams, useNavigate } from 'react-router-dom';
import PlaylistModal from './PlaylistModal';
import playlistRepository from '../../repositories/PlaylistRepository';
import InfiniteScroll from 'react-infinite-scroll-component';
import PlaylistEntryRow from './PlaylistEntryRow';
import AutoSizer from 'react-virtualized-auto-sizer';
import { FixedSizeList as List } from 'react-window';

const BatchActions = ({ selectedCount, onRemove, onClear }) => (
  <div className="batch-actions" style={{ minHeight: '40px', visibility: selectedCount > 0 ? 'visible' : 'hidden' }}>
    <button onClick={onRemove}>
      Remove {selectedCount} Selected Tracks
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
    provided 
  } = data;
  const track = entries[index];

  return (
    <Draggable 
      key={track.order}
      draggableId={`track-${track.order}`}
      index={index}
      isDragDisabled={sortColumn !== 'order'}
    >
      {(provided, snapshot) => (
        <PlaylistEntryRow 
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          style={{
            ...style,
            ...provided.draggableProps.style,
          }}
          className={`playlist-grid-row ${sortColumn !== 'order' ? 'drag-disabled' : ''}`}
          isDragging={snapshot.isDragging}
          onClick={() => toggleTrackSelection(track.order)}
          onContextMenu={(e) => handleContextMenu(e, track)}
          isChecked={selectedEntries.includes(track.order)}
          track={track}
        />
      )}
    </Draggable>
  );
});

const PlaylistGrid = ({ playlistID }) => {
  const [sortColumn, setSortColumn] = useState('order');
  const [sortDirection, setSortDirection] = useState('asc');
  const [filter, setFilter] = useState('');
  const [entries, setEntries] = useState([]);
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
  const [searchFilter, setSearchFilter] = useState('');
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [playlistModalVisible, setPlaylistModalVisible] = useState(false);
  const gridContentRef = useRef(null);
  const [displayedItems, setDisplayedItems] = useState(50);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    fetchPlaylistDetails(playlistID);
  }, [playlistID]); // Only re-fetch when playlistID changes

  useEffect(() => {
    if (!isInitialLoad) {
      writeToDB();
    } else {
      setIsInitialLoad(false);
    }
  }, [entries]);

  const fetchPlaylistDetails = async (playlistId) => {
    try {
      const playlist = await playlistRepository.getPlaylistDetails(playlistId);
      setName(playlist.name);
      setIsInitialLoad(true);  // Set flag before updating entries
      setEntries(playlist.entries.map(entry => mapToTrackModel(entry)))
    } catch (error) {
      console.error('Error fetching playlist details:', error);
    }
  };

  const writeToDB = async () => {
    try {
      await playlistRepository.updateEntries(playlistID, entries);
    } catch (error) {
      console.error('Error writing playlist to DB:', error);
    }
  };

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

  const addTracksToPlaylist = async (tracks) => {
    const tracksToAdd = Array.isArray(tracks) ? tracks : [tracks];

    pushToHistory(entries);

    const newEntries = [
      ...entries,
      ...tracksToAdd.map((s, idx) => ({
        ...mapToTrackModel(s),
        order: idx + entries.length, music_file_id: s.id, 
        entry_type: s.entry_type, url: s.url, details: s
      }))
    ];
    
    setEntries(newEntries);
      
    setSnackbar({
      open: true,
      message: `Added ${tracksToAdd.length} tracks to ${name}`,
      severity: 'success'
    });
  };

  const handleRenamePlaylist = async (playlistID, newName) => {
    setName(newName, async () => {
      await playlistRepository.rename(playlistID, newName);
    });
  };

  const onRemoveByAlbum = async (album) => {
    setEntries(entries.filter(entry => entry.album === album).map(entry => entry.order));
  }

  const onRemoveByArtist = async (artist) => {
    setEntries(entries.filter(entry => entry.artist === artist).map(entry => entry.order));
  }

  const addSongsToPlaylist = async (songs) => {
    const songsArray = Array.isArray(songs) ? songs : [songs];
    await addTracksToPlaylist(songsArray);
    
    // Scroll to bottom after state update
    setTimeout(() => {
      gridContentRef.current?.scrollTo({
        top: gridContentRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }, 100);
  };

  const removeSongsFromPlaylist = async (indexes) => {
    if ((indexes.length > 1) && !window.confirm(`Are you sure you want to remove ${indexes.length} entries from the playlist?`)) {
      return;
    }

    pushToHistory(entries);

    const newEntries = entries
      .filter((_, index) => !indexes.includes(index))
      .map((entry, index) => ({ ...entry, order: index }));
    
    setEntries(newEntries);
  }

  const exportPlaylist = async (id) => {
    playlistRepository.export(id);
  };

  const onSyncToPlex = async () => {
    try {
      await playlistRepository.syncToPlex(playlistID);

      setSnackbar({
        open: true,
        message: `'${name}' synced to Plex`
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
      
      const updatedEntries = updatedTracks.map((track, index) => ({
        ...track,
        order: index,
      }));

      pushToHistory(entries);

      setEntries(updatedEntries);
    }
  };

  const toggleTrackSelection = (index) => {
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

  const handleShowTrackDetails = (track) => {
    setSelectedTrack(track);
    setShowTrackDetails(true);
  };

  const handleContextMenu = (e, track) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      track: track
    });
  };

  const handleSnackbarClose = () => {
    setSnackbar(prev => ({ ...prev, open: false }));
  };

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedEntries = [...entries].sort((a, b) => {
    const multiplier = sortDirection === 'asc' ? 1 : -1;
    
    switch (sortColumn) {
      case 'order':
        return (a.order - b.order) * multiplier;
      case 'type':
        return a.entry_type.localeCompare(b.entry_type) * multiplier;
      case 'artist':
        return (a.artist || a.album_artist || '').localeCompare(b.artist || b.album_artist || '') * multiplier;
      case 'title':
        return a.title.localeCompare(b.title) * multiplier;
      default:
        return 0;
    }
  });

  const filteredEntries = useMemo(() => {
    if (!filter) return sortedEntries;
    
    const searchTerm = filter.toLowerCase();
    return sortedEntries.filter(entry => {
      const title = entry.details?.title?.toLowerCase() || '';
      const artist = entry.details?.artist?.toLowerCase() || '';
      const album = entry.details?.album?.toLowerCase() || '';
      const source = entry.entry_type?.toLowerCase() || '';
      
      return title.includes(searchTerm) ||
             artist.includes(searchTerm) ||
             album.includes(searchTerm) ||
             source.includes(searchTerm);
    });
  }, [sortedEntries, filter]);

  const searchFor = (query) => {
    setSearchFilter(query);
    setSearchPanelOpen(true);
  }

  const getSortIndicator = (column) => {
    if (sortColumn !== column) return null;
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  };

  const navigate = useNavigate();

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

  const fetchMoreData = () => {
    if (displayedItems >= filteredEntries.length) {
      setHasMore(false);
      return;
    }
    
    setTimeout(() => {
      setDisplayedItems(displayedItems + 50);
    }, 500);
  };

  const listRef = useRef(null);

  return (
    <div>
      <h2>{name}</h2>
      <div className="playlist-controls">
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
          <button onClick={() => setPlaylistModalVisible(true)}>
            ...
          </button>
        </div>

        <div className="filter-container">
          <input
            type="text"
            placeholder="Filter playlist..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="filter-input"
          />
          {filter && (
            <button 
              className="clear-filter"
              onClick={() => setFilter('')}
            >
              Clear
            </button>
          )}
          <span className="filter-count">
            {filteredEntries.length} of {entries.length} tracks
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
            </div>
            <div className="grid-cell clickable" onClick={() => handleSort('order')}>
              Source {getSortIndicator('order')}
            </div>
            <div className="grid-cell clickable" onClick={() => handleSort('artist')}>
              Artist/Album {getSortIndicator('artist')}
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
                {...provided.dragHandleProps}
                isDragging={snapshot.isDragging}
                track={filteredEntries[rubric.source.index]}
                isChecked={selectedEntries.includes(rubric.source.index)}
                className="playlist-grid-row"
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
                      itemCount={filteredEntries.length}
                      itemSize={60}
                      width={width}
                      itemData={{
                        entries: filteredEntries,
                        toggleTrackSelection,
                        handleContextMenu,
                        selectedEntries,
                        sortColumn,
                        isDraggingOver: snapshot.isDraggingOver
                      }}
                      overscanCount={10}
                      className="playlist-virtual-list"
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

      <SearchResultsGrid
        filter={searchFilter}
        onAddSongs={addSongsToPlaylist}
        visible={searchPanelOpen}
        playlistID={playlistID}
      />

      {contextMenu.visible && (
        <PlaylistItemContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          track={contextMenu.track}
          onClose={() => setContextMenu({ visible: false })}
          onFilterByAlbum={() => searchFor(contextMenu.track.album)}
          onFilterByArtist={() => searchFor(contextMenu.track.artist)}
          onAddTracks={(tracks) => addSongsToPlaylist(tracks)}
        />
      )}

      {playlistModalVisible && (
        <PlaylistModal
          open={playlistModalVisible}
          onClose={() => setPlaylistModalVisible(false)}
          onSyncToPlex={onSyncToPlex}
          onDelete={onDeletePlaylist}
        />
      )}

      <Snackbar
        open={snackbar.open}
        message={snackbar.message}
        severity={snackbar.severity}
        onClose={handleSnackbarClose}
      />
    </div>
  );
};

export default PlaylistGrid;