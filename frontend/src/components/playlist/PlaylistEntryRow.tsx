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
  [key: string]: any;
}

const PlaylistEntryRow = forwardRef<HTMLDivElement, PlaylistEntryRowProps>(({ 
  entry, 
  isChecked, 
  onClick, 
  onContextMenu,
  className,
  style,
  isDragging,
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

  const contents = entry.isAlbum() ? (
    <div onClick={() => setIsExpanded(!isExpanded)}>
      {isExpanded ? entry.details?.tracks.map(track => track.linked_track.title).join(', ') : `(${entry.details?.tracks.length} tracks)`}
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