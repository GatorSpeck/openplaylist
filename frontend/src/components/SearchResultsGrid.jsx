import React, { memo } from 'react';
import { Droppable, Draggable } from 'react-beautiful-dnd';
import { ClipLoader } from 'react-spinners';

const SearchResultsGrid = memo(({
  isLoading,
  filteredSongs,
  selectedSearchResults,
  allSearchResultsSelected,
  onToggleAll,
  onToggleSelection,
  onContextMenu,
}) => {
  return (
    <>
      {isLoading ? (
        <div className="spinner-container">
          <ClipLoader size={30} color={"#123abc"} />
        </div>
      ) : (
        <Droppable droppableId="songs">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef} className="search-result-grid">
              <div className="playlist-grid">
                <input
                  type="checkbox"
                  checked={allSearchResultsSelected}
                  onChange={onToggleAll}
                />
              </div>
              <div className="playlist-grid-header">Artist/Album</div>
              <div className="playlist-grid-header">Title</div>
              
              {filteredSongs.map((song, index) => (
                <Draggable 
                  key={song.id} 
                  draggableId={`song-${song.id}`} 
                  index={index}
                >
                  {(provided) => (
                    <React.Fragment>
                      <div 
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        ref={provided.innerRef}
                        className="playlist-grid-item"
                        onClick={() => onToggleSelection(song)}
                      >
                        <input 
                          type="checkbox"
                          checked={selectedSearchResults.some(s => s.id === song.id)}
                          onChange={() => onToggleSelection(song)}
                        />
                      </div>
                      <div className="playlist-grid-item">
                        <div>{song.artist ? song.artist : song.album_artist}</div>
                        <div><i>{song.album}</i></div>
                      </div>
                      <div 
                        className="playlist-grid-item" 
                        onContextMenu={(e) => onContextMenu(e, song)}
                      >
                        {song.title}
                      </div>
                    </React.Fragment>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      )}
    </>
  );
});

export default SearchResultsGrid;