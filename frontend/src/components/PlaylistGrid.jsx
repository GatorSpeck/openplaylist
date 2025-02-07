import React from 'react';
import { Droppable, Draggable } from 'react-beautiful-dnd';
import EntryTypeBadge from './EntryTypeBadge';

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
  return (
    <div>
      <h2>{playlist.name}</h2>

      <BatchActions 
        selectedCount={selectedEntries.length}
        onRemove={onRemove}
        onClear={onClear}
      />

      <Droppable droppableId="playlist">
        {(provided) => (
          <div className="playlist-grid" {...provided.droppableProps} ref={provided.innerRef}>
            <div className="playlist-grid-header">
              <input
                type="checkbox"
                checked={allEntriesSelected}
                onChange={onToggleAll}
              />
            </div>
            <div className="playlist-grid-header">Source</div>
            <div className="playlist-grid-header">Artist/Album</div>
            <div className="playlist-grid-header">Song</div>

            {playlistEntries.map((track, index) => (
              <Draggable 
                key={index} 
                draggableId={index.toString()} 
                index={index}
              >
                {(provided) => (
                  <React.Fragment>
                    <div className="playlist-grid-item" 
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      onClick={() => onToggleEntry(index)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedEntries.includes(index)}
                        onChange={() => onToggleEntry(index)}
                      />
                    </div>
                    <EntryTypeBadge className="playlist-grid-item" type={track.entry_type} />
                    <div className="playlist-grid-item">
                      <div>{track.artist || track.album_artist}</div>
                      <div><i>{track.album}</i></div>
                    </div>
                    <div 
                      className="playlist-grid-item clickable" 
                      onContextMenu={(e) => onContextMenu(e, track)}
                    >
                      {track.title}
                    </div>
                  </React.Fragment>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
};

export default PlaylistGrid;