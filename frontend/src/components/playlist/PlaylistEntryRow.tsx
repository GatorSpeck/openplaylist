import React, { forwardRef, useEffect, useState } from 'react';
import EntryTypeBadge from '../EntryTypeBadge';
import '../../styles/PlaylistGrid.css';
import lastFMRepository from '../../repositories/LastFMRepository';
import PlaylistEntry from '../../lib/PlaylistEntry';

interface PlaylistEntryRowProps {
  entry: PlaylistEntry;
  isChecked: boolean;
  onClick: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  className?: string;
  style?: React.CSSProperties;
  isDragging?: boolean;
  dragHandleProps?: any; // Add this prop to receive drag handle props
  [key: string]: any;
}

const PlaylistEntryRow = forwardRef<HTMLDivElement, PlaylistEntryRowProps>(({ 
  entry, 
  isChecked, 
  onToggle, 
  onContextMenu,
  className,
  style,
  isDragging,
  dragHandleProps, // Add this parameter
  ...props 
}, ref) => {
  const [imageUrl, setImageUrl] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const fetchAlbumArt = async () => {
        if (entry.details.art_url) {
          setImageUrl(entry.details.art_url);
          return;
        }
        
        const url = await lastFMRepository.fetchAlbumArt(entry.getAlbumArtist(), entry.details.album);
        if (!url) return;
        setImageUrl(url.image_url);
    }

    fetchAlbumArt();
  }, [entry]);

  let tracksDisplay = null;
  if (entry.isAlbum()) {
    if (entry.getTracks().length > 0) {
      if (isExpanded) {
        tracksDisplay = entry.getTracks().map(track => track.linked_track.title).join(', ');
      }
      else {
        tracksDisplay = `(${entry.getTracks().length} tracks)`;
      }
    }
  }

  const contents = entry.isAlbum() ? (
    <div onClick={() => setIsExpanded(!isExpanded)}>
      {tracksDisplay}
    </div>
  ) : entry.getTitle();

  return (
    <div 
      ref={ref}
      className={`${className} ${isDragging ? 'dragging' : ''}`}
      style={style}
      onContextMenu={onContextMenu}
      {...props}
    >
      {/* Apply dragHandleProps only to the first grid cell */}
      <div 
        className="grid-cell" {...dragHandleProps}
        onClick={onToggle}
      >
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