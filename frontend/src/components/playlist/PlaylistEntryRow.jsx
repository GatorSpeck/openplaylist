import React, { forwardRef, useEffect, useState } from 'react';
import EntryTypeBadge from '../EntryTypeBadge';
import '../../styles/PlaylistGrid.css';
import lastFMRepository from '../../repositories/LastFMRepository';

const PlaylistEntryRow = forwardRef(({ 
  entry, 
  isChecked, 
  onClick, 
  onContextMenu,
  className,
  style,
  isDragging, // Add this prop
  ...props 
}, ref) => {
  const [imageUrl, setImageUrl] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const fetchAlbumArt = async () => {
        if (entry.art_url) {
          setImageUrl(entry.art_url);
          return;
        }
        
        const url = await lastFMRepository.fetchAlbumArt(entry.getAlbumArtist(), entry.album);
        if (!url) return;
        setImageUrl(url.image_url);
    }

    fetchAlbumArt();
  }, [entry]);

  const contents = entry.isAlbum() ? (
    <div onClick={() => setIsExpanded(!isExpanded)}>
      {isExpanded ? entry.tracks.map(track => track.linked_track.title).join(', ') : `(${entry.tracks.length} tracks)`}
    </div>
  ) : entry.getTitle();

  return (
    <div 
      ref={ref}
      className={`${className} ${isDragging ? 'dragging' : ''}`}
      style={style}
      onClick={onClick}
      onContextMenu={onContextMenu}
      {...props}
    >
      <div className="grid-cell">
        {isChecked ? (
                <span>✔</span>
        ) : (imageUrl ? (
            <div className="album-art">
                <img src={imageUrl} alt="Album Art" />
            </div>
        ) : (
            <div>
                <EntryTypeBadge type={entry.entry_type} />
            </div>
        ))}
      </div>
      
      <div className="grid-cell artist-cell">
        <div className="track-info">
          <div className="artist truncate-text">{entry.getArtist()}</div>
          <div className="album truncate-text" overflow="auto"><i>{entry.getAlbum()}</i></div>
        </div>
      </div>
      <div className="grid-cell truncate-text" overflow="auto">
        <span>{contents}</span>
      </div>
    </div>
  );
});

PlaylistEntryRow.displayName = 'PlaylistEntryRow';

export default PlaylistEntryRow;