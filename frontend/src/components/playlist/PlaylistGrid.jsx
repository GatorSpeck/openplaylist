import React, { useState, useMemo, useEffect, useRef, memo } from 'react';
import { Droppable, Draggable, DragDropContext } from 'react-beautiful-dnd';
import Snackbar from '../Snackbar';
import mapToTrackModel from '../../lib/mapToTrackModel';
import '../../styles/PlaylistGrid.css';
import SearchResultsGrid from '../search/SearchResultsGrid';
import ContextMenu from '../common/ContextMenu';
import { FaUndo, FaRedo } from 'react-icons/fa';
import { useParams, useNavigate } from 'react-router-dom';
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
  const [loading, setLoading] = useState(false);
  const [openAILoading, setOpenAILoading] = useState(false);
  const [similarTracks, setSimilarTracks] = useState(null);
  const [showTrackDetails, setShowTrackDetails] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [albumArtList, setAlbumArtList] = useState([]);

  useEffect(() => {
    fetchPlaylistDetails();
  }, [playlistID, filter, sortColumn, sortDirection]); // Re-fetch when these change

  const fetchPlaylistDetails = async () => {
    try {
      // Get basic playlist info for the name
      const playlistInfo = await playlistRepository.getPlaylistDetailsUnpaginated(playlistID);
      setName(playlistInfo.data.name);
      
      // Use the filter_playlist endpoint via getPlaylistEntries
      const filterParams = {
        filter: filter, // Text search
        sortCriteria: sortColumn,
        sortDirection: sortDirection,
        // Optional pagination params if needed
        // limit: 100,
        // offset: 0
      };
      
      const filteredEntries = await playlistRepository.getPlaylistEntries(playlistID, filterParams);
      const mappedEntries = filteredEntries.map(entry => mapToTrackModel(entry));
      setEntries(mappedEntries);
    } catch (error) {
      console.error('Error fetching playlist details:', error);
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
    const newOrder = entries.length ? entries[entries.length - 1].order + 1 : 0;

    const tracksToAdd = (Array.isArray(tracks) ? tracks : [tracks]).map((track, idx) => ({
      ...mapToTrackModel(track),
      order: idx + newOrder, music_file_id: track.id, 
      entry_type: track.entry_type, url: track.url, details: track
    }));

    pushToHistory(entries);

    const newEntries = [
      ...entries,
      ...tracksToAdd
    ];
    
    setEntries(newEntries);

    playlistRepository.addTracks(playlistID, tracksToAdd);
      
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
    // identify indexes of tracks to remove
    const indexes = entries.map((entry, idx) => entry.album === album ? idx : null).filter(idx => idx !== null);
    
    playlistRepository.removeTracks(playlistID, indexes.map(i => entries[i]));
    setEntries(entries.filter((entry, idx) => !indexes.includes(idx)));
  }

  const onRemoveByArtist = async (artist) => {
    const indexes = entries.map((entry, idx) => entry.artist === artist ? idx : null).filter(idx => idx !== null);

    playlistRepository.removeTracks(playlistID, indexes.map(i => entries[i]));
    setEntries(entries.filter((entry, idx) => !indexes.includes(idx)));
  }

  const addSongsToPlaylist = async (songs) => {
    const songsArray = Array.isArray(songs) ? songs : [songs];
    await addTracksToPlaylist(songsArray);
    
    // Scroll to bottom using the List ref instead
    setTimeout(() => {
      if (listRef.current) {
        listRef.current.scrollToItem(entries.length - 1);
      }
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

    playlistRepository.removeTracks(playlistID, indexes.map(i => entries[i]));
  }

  const exportPlaylist = async (id) => {
    playlistRepository.export(id, "m3u");
  };

  const exportPlaylistToJson = async (id) => {
    playlistRepository.export(id, "json");
  }

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

      playlistRepository.reorderTracks(playlistID, [movedTrack], destination.index, false);
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
    // The effect will trigger a re-fetch with the new sort parameters
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

    setPosition({ x: e.clientX, y: e.clientY });
    setLoading(false);
  };

  const addSimilarTracks = (tracks) => {
    addSongsToPlaylist(tracks);
    setSimilarTracks(null);
  }

  const handleShowDetails = (track) => {
    setSelectedTrack(track);
    setShowTrackDetails(true);
  }

  const handleContextMenu = (e, track) => {
    e.preventDefault();

    const isAlbum = track.entry_type === 'requested_album' || track.entry_type === 'album';

    const options = [
      { label: 'Details', onClick: () => handleShowDetails(track) },
      { label: 'Send to Search', onClick: () => searchFor(track.title) },
      !isAlbum ? { label: 'Find Similar Tracks (Last.fm)', onClick: (e) => findSimilarTracks(e, track) } : null,
      !isAlbum ? { label: 'Find Similar Tracks (OpenAI)', onClick: (e) => findSimilarTracksWithOpenAI(e, track) } : null,
      { label: 'Search for Album', onClick: () => searchFor(track.album) },
      { label: 'Search for Artist', onClick: () => searchFor(track.artist) },
      { label: 'Remove', onClick: () => removeSongsFromPlaylist([track.order]) },
      { label: 'Remove by Artist', onClick: () => onRemoveByArtist(track.artist) },
      { label: 'Remove by Album', onClick: () => onRemoveByAlbum(track.album) }
    ];

    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      options
    });
  }

  const listRef = useRef(null);

  return (
    <div className="main-playlist-view">
      <div className="playlist-header">
        <AlbumArtGrid
          artList={albumArtList ? albumArtList.map(album => album.image_url) : []}
        />
        <h2 className="playlist-name">{name}</h2>
      </div>
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
            {entries.length} tracks {filter ? `(filtered from all)` : ''}
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
                {...provided.dragHandleProps}
                isDragging={snapshot.isDragging}
                track={entries[rubric.source.index]}
                isChecked={selectedEntries.includes(rubric.source.index)}
                handleContextMenu={handleContextMenu}
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
                      itemCount={entries.length}
                      itemSize={50}
                      width={width}
                      itemData={{
                        entries: entries,
                        toggleTrackSelection,
                        selectedEntries,
                        sortColumn,
                        handleContextMenu: handleContextMenu,
                        isDraggingOver: snapshot.isDraggingOver
                      }}
                      overscanCount={5}
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
      />

      {contextMenu.visible && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          track={contextMenu.track}
          onClose={() => setContextMenu({ visible: false })}
          options={contextMenu.options}
        />
      )}

      {similarTracks && (
        <SimilarTracksPopup
          x={position.x}
          y={position.y}
          tracks={similarTracks}
          onClose={() => setSimilarTracks(null)}
          onAddTracks={(tracks) => addSimilarTracks(tracks)}
        />
      )}

      {showTrackDetails && (
        <TrackDetailsModal
          track={selectedTrack}
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
    </div>
  );
};

export default PlaylistGrid;