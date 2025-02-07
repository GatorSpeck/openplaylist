import React from 'react';
import { Droppable, Draggable } from 'react-beautiful-dnd';
import '../styles/SearchResultsGrid.css';

const SearchResultsGrid = ({ filteredSongs, selectedSearchResults, allSearchResultsSelected, onToggleAll, onToggleSelection, onContextMenu }) => {
  return (
    <div className="search-results-container">
      <div className="search-grid-header-row">
        <div className="grid-cell">
          <input
            type="checkbox"
            checked={allSearchResultsSelected}
            onChange={onToggleAll}
          />
        </div>
        <div className="grid-cell">Artist/Album</div>
        <div className="grid-cell">Title</div>
      </div>

      <Droppable droppableId="search-results">
        {(provided) => (
          <div className="search-grid-content" {...provided.droppableProps} ref={provided.innerRef}>
            {filteredSongs.map((song, index) => (
              <Draggable key={song.id} draggableId={`song-${song.id}`} index={index}>
                {(provided) => (
                  <div className="search-grid-row"
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                  >
                    <div className="grid-cell">
                      <input 
                        type="checkbox"
                        checked={selectedSearchResults.some(s => s.id === song.id)}
                        onChange={() => onToggleSelection(song)}
                      />
                    </div>
                    <div className="grid-cell">
                      <div>{song.artist || song.album_artist}</div>
                      <div><i>{song.album}</i></div>
                    </div>
                    <div className="grid-cell clickable" 
                      onContextMenu={(e) => onContextMenu(e, song)}
                    >
                      {song.title}
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
  );
};

export default SearchResultsGrid;