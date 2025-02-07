import React from 'react';
import { Droppable, Draggable } from 'react-beautiful-dnd';
import EntryTypeBadge from './EntryTypeBadge';
import '../styles/PlaylistGrid.css';  // Add this import


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

      <div className="playlist-container">
        <div className="playlist-grid-header-row">
          <div className="grid-cell">
            <input type="checkbox" checked={allEntriesSelected} onChange={onToggleAll} />
          </div>
          <div className="grid-cell">Source</div>
          <div className="grid-cell">Artist/Album</div>
          <div className="grid-cell">Song</div>
        </div>

        <Droppable droppableId="playlist">
          {(provided) => (
            <div className="playlist-grid-content" {...provided.droppableProps} ref={provided.innerRef}>
              {playlistEntries.map((track, index) => (
                <Draggable key={index} draggableId={index.toString()} index={index}>
                  {(provided) => (
                    <div className="playlist-grid-row"
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                    >
                      <div className="grid-cell">
                        <input
                          type="checkbox"
                          checked={selectedEntries.includes(index)}
                          onChange={() => onToggleEntry(index)}
                        />
                      </div>
                      <div className="grid-cell">
                        <EntryTypeBadge type={track.entry_type} />
                      </div>
                      <div className="grid-cell">
                        <div>{track.artist || track.album_artist}</div>
                        <div><i>{track.album}</i></div>
                      </div>
                      <div className="grid-cell clickable"
                        onContextMenu={(e) => onContextMenu(e, track)}
                      >
                        {track.title}
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