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
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const fetchAlbumArt = async () => {
        if (track.details.art_url) {
          setImageUrl(track.details.art_url);
          return;
        }
        
        const artistToFetch = track.album_artist || track.artist;
        const url = await lastFMRepository.fetchAlbumArt(artistToFetch, track.album);
        if (!url) return;
        setImageUrl(url.image_url);
    }

    fetchAlbumArt();
  }, [track]);

  const isAlbum = track.entry_type === "album" || track.entry_type === "requested_album";

  const contents = isAlbum ? (
    <div onClick={() => setIsExpanded(!isExpanded)}>
      {isExpanded ? track.details.tracks.map(track => track.linked_track.title).join(', ') : `(${track.details.tracks.length} tracks)`}
    </div>
  ) : track.title;

  const artistToUse = track.artist || track.album_artist;
  const albumTitle = isAlbum ? track.title : track.album;

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
          <div className="artist truncate-text">{artistToUse}</div>
          <div className="album truncate-text" overflow="auto"><i>{albumTitle}</i></div>
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