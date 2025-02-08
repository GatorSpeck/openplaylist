import React, { useState, useMemo } from 'react';
import { Droppable, Draggable } from 'react-beautiful-dnd';
import EntryTypeBadge from './EntryTypeBadge';
import '../styles/PlaylistGrid.css';

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

const PlaylistGrid = ({
  playlist,
  playlistEntries,
  selectedEntries,
  allEntriesSelected,
  onToggleAll,
  onToggleEntry,
  onContextMenu,
  onRemove,
  onClear
}) => {
  const [sortColumn, setSortColumn] = useState('order');
  const [sortDirection, setSortDirection] = useState('asc');
  const [filter, setFilter] = useState('');

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedEntries = [...playlistEntries].sort((a, b) => {
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

  const getSortIndicator = (column) => {
    if (sortColumn !== column) return null;
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  };

  return (
    <div>
      <h2>{playlist.name}</h2>

      <div className="playlist-controls">
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
            {filteredEntries.length} of {playlistEntries.length} tracks
          </span>
        </div>

        <BatchActions 
          selectedCount={selectedEntries.length}
          onRemove={onRemove}
          onClear={onClear}
        />
      </div>

      <div className="playlist-container">
        <div className="playlist-grid-header-row">
          <div className="grid-cell">
            <input type="checkbox" checked={allEntriesSelected} onChange={onToggleAll} />
          </div>
          <div className="grid-cell clickable" onClick={() => handleSort('type')}>
            Source {getSortIndicator('type')}
          </div>
          <div className="grid-cell clickable" onClick={() => handleSort('artist')}>
            Artist/Album {getSortIndicator('artist')}
          </div>
          <div className="grid-cell clickable" onClick={() => handleSort('title')}>
            Song {getSortIndicator('title')}
          </div>
        </div>

        <Droppable droppableId="playlist">
          {(provided) => (
            <div className="playlist-grid-content" {...provided.droppableProps} ref={provided.innerRef}>
              {filteredEntries.map((track, index) => (
                <Draggable key={index} draggableId={index.toString()} index={index}>
                  {(provided) => (
                    <div className="playlist-grid-row"
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      onClick={() => onToggleEntry(track.order)}
                      onContextMenu={(e) => onContextMenu(e, track)}
                    >
                      <div className="grid-cell">
                        <input
                          type="checkbox"
                          checked={selectedEntries.includes(track.order)}
                          readOnly
                        />
                      </div>
                      <div className="grid-cell">
                        <EntryTypeBadge type={track.entry_type} />
                        <span>{track.order + 1}</span>
                      </div>
                      <div className="grid-cell">
                        <div>{track.artist || track.album_artist}</div>
                        {track.album && <div><i>{track.album}</i></div>}
                      </div>
                      <div className="grid-cell"
                      >
                        {track.missing ? <s>{track.title}</s> : track.title}
                      </div>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </div>
    </div>
  );
};

export default PlaylistGrid;