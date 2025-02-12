import React, { forwardRef, useEffect, useState } from 'react';
import EntryTypeBadge from '../EntryTypeBadge';
import '../../styles/PlaylistGrid.css';
import lastFMRepository from '../../repositories/LastFMRepository';

const PlaylistEntryRow = forwardRef(({ 
  track, 
  isChecked, 
  onClick, 
  onContextMenu,
  className,
  style,
  isDragging, // Add this prop
  ...props 
}, ref) => {
  const [imageUrl, setImageUrl] = useState(null);

  useEffect(() => {
    const fetchAlbumArt = async () => {
        const url = await lastFMRepository.fetchAlbumArt(track.artist, track.album);
        setImageUrl(url.image_url);
    }

    fetchAlbumArt();
  }, [track])

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
                <EntryTypeBadge type={track.entry_type} />
            </div>
        ))}
      </div>
      
      <div className="grid-cell artist-cell">
        <div className="track-info">
          <div className="artist truncate-text">{track.artist || track.album_artist}</div>
          <div className="album truncate-text" overflow="auto"><i>{track.album}</i></div>
        </div>
      </div>
      <div className="grid-cell truncate-text" overflow="auto">
        {track.title}
      </div>
    </div>
  );
});

PlaylistEntryRow.displayName = 'PlaylistEntryRow';

export default PlaylistEntryRow;