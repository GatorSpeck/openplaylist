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
  const [isMobile, setIsMobile] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [isLongPressing, setIsLongPressing] = useState(false);

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

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768 || 'ontouchstart' in window);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const triggerContextMenu = (e: any) => {
    onContextMenu(e);
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  };

  const startLongPress = (clientX: number, clientY: number) => {
    console.log("Starting long press");
    const timer = setTimeout(() => {
      console.log("Long press triggered");
      setIsLongPressing(true);
      const contextEvent = {
        preventDefault: () => {},
        clientX,
        clientY
      };
      triggerContextMenu(contextEvent);
    }, 500);
    
    setLongPressTimer(timer);
  };

  const endLongPress = () => {
    console.log("Ending long press");
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    setTimeout(() => setIsLongPressing(false), 100);
  };

  // Touch events for real mobile devices
  const handleTouchStart = (e: React.TouchEvent) => {
    console.log("Touch start");
    const touch = e.touches[0];
    startLongPress(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = () => {
    console.log("Touch end");
    endLongPress();
  };

  // Mouse events for desktop simulation
  const handleMouseDown = (e: React.MouseEvent) => {
    console.log("Mouse down - simulating long press");
    // Only simulate long press in responsive mode when not on actual mobile
    if (isMobile && !('ontouchstart' in window)) {
      startLongPress(e.clientX, e.clientY);
    }
  };

  const handleMouseUp = () => {
    console.log("Mouse up");
    if (isMobile && !('ontouchstart' in window)) {
      endLongPress();
    }
  };

  const handleMouseLeave = () => {
    // Cancel long press if mouse leaves the element
    if (isMobile && !('ontouchstart' in window)) {
      endLongPress();
    }
  };

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
      className={`${className} ${isDragging ? 'dragging' : ''} ${isLongPressing ? 'long-pressing' : ''}`}
      style={style}
      onContextMenu={onContextMenu}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
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