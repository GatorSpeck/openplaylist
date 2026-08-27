import React, { forwardRef, useEffect, useState, useRef } from 'react';
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
  dragHandleProps?: any;
  visibleColumns?: ('artistAlbum' | 'artist' | 'album' | 'title' | 'notes')[];
  onNotesUpdate?: (entryId: number, notes: string) => void;
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
  dragHandleProps,
  visibleColumns = ['artistAlbum', 'title'],
  onNotesUpdate,
  ...props 
}, ref) => {
  const [imageUrl, setImageUrl] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [isLongPressing, setIsLongPressing] = useState(false);
  const [shouldScroll, setShouldScroll] = useState(false);
  const [shouldScrollArtist, setShouldScrollArtist] = useState(false);
  const [shouldScrollAlbum, setShouldScrollAlbum] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(entry.getNotes());
  const scrollingRef = useRef<HTMLDivElement>(null);
  const artistRef = useRef<HTMLDivElement>(null);
  const albumRef = useRef<HTMLDivElement>(null);
  const notesInputRef = useRef<HTMLInputElement>(null);

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

  const contentsHidden = entry.isHidden() ? (
    <s>{contents}</s>
  ) : (
    <span>{contents}</span>
  );

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onContextMenu(e);
  };

  const hiddenClass = entry.isHidden() ? 'opacity-60 bg-surface-subtle dark:bg-surface-dark' : '';

  const artist = entry.isHidden() ? (
    <s>{entry.getArtist()}</s>
  ) : (
    <span>{entry.getArtist()}</span>
  );

  const album = entry.isHidden() ? (
    <s>{entry.getAlbum()}</s>
  ) : (
    <span>{entry.getAlbum()}</span>
  );

  // Check if content overflows and should scroll
  useEffect(() => {
    const checkOverflow = () => {
      // Check title content
      if (scrollingRef.current) {
        const container = scrollingRef.current.parentElement;
        const content = scrollingRef.current;
        
        if (container && content) {
          const containerWidth = container.clientWidth;
          const contentWidth = content.scrollWidth;
          const shouldScrollTitle = contentWidth > containerWidth;
          setShouldScroll(shouldScrollTitle);
          
          // Set dynamic animation duration based on text length
          if (shouldScrollTitle) {
            const scrollDistance = contentWidth - containerWidth;
            // Base duration: 3 seconds minimum, add 0.05s per pixel of overflow
            const duration = Math.max(3, 3 + (scrollDistance * 0.05));
            content.style.animationDuration = `${duration}s`;
            content.style.animation = `move ${duration}s ease-in-out infinite`;
          }
        }
      }

      // Check artist content
      if (artistRef.current) {
        const container = artistRef.current.parentElement;
        const content = artistRef.current;
        
        if (container && content) {
          const containerWidth = container.clientWidth;
          const contentWidth = content.scrollWidth;
          const shouldScrollArtistContent = contentWidth > containerWidth;
          setShouldScrollArtist(shouldScrollArtistContent);
          
          if (shouldScrollArtistContent) {
            const scrollDistance = contentWidth - containerWidth;
            const duration = Math.max(3, 3 + (scrollDistance * 0.05));
            content.style.animationDuration = `${duration}s`;
            content.style.animation = `move ${duration}s ease-in-out infinite`;
          }
        }
      }

      // Check album content
      if (albumRef.current) {
        const container = albumRef.current.parentElement;
        const content = albumRef.current;
        
        if (container && content) {
          const containerWidth = container.clientWidth;
          const contentWidth = content.scrollWidth;
          const shouldScrollAlbumContent = contentWidth > containerWidth;
          setShouldScrollAlbum(shouldScrollAlbumContent);
          
          if (shouldScrollAlbumContent) {
            const scrollDistance = contentWidth - containerWidth;
            const duration = Math.max(3, 3 + (scrollDistance * 0.05));
            content.style.animationDuration = `${duration}s`;
            content.style.animation = `move ${duration}s ease-in-out infinite`;
          }
        }
      }
    };

    checkOverflow();
    
    // Recheck on window resize
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [contentsHidden, isMobile, artist, album]); // Re-run when content changes

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingNotes && notesInputRef.current) {
      notesInputRef.current.focus();
      notesInputRef.current.select();
    }
  }, [isEditingNotes]);

  // Keep local edits stable while typing; only sync from entry when not actively editing.
  useEffect(() => {
    if (!isEditingNotes) {
      setNotesValue(entry.getNotes());
    }
  }, [entry, isEditingNotes]);

  const handleNotesClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditingNotes(true);
  };

  const handleNotesKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      saveNotes();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelNotesEdit();
    }
  };

  const handleNotesBlur = () => {
    saveNotes();
  };

  const saveNotes = () => {
    if (notesValue !== entry.getNotes()) {
      onNotesUpdate?.(entry.id, notesValue);
    }
    setIsEditingNotes(false);
  };

  const cancelNotesEdit = () => {
    setNotesValue(entry.getNotes());
    setIsEditingNotes(false);
  };

  return (
    <div
      ref={ref}
      className={`playlist-entry-row grid !h-[50px] !min-h-[50px] !max-h-[50px] overflow-hidden items-center border-b border-border !text-text dark:border-border-dark dark:!text-text-dark ${className || ''} ${hiddenClass} ${isDragging ? 'shadow-sm' : ''}`}
      style={style}
      onContextMenu={onContextMenu}
      {...props}
    >
      {/* Apply dragHandleProps only to the first grid cell */}
      <div 
        className="grid-cell flex items-center justify-center !p-1" {...dragHandleProps}
        onClick={onToggle}
      >
        {isChecked ? (
                <span>✔</span>
        ) : (imageUrl ? (
            <div
              className="overflow-hidden rounded"
              style={{
                width: '38px',
                height: '38px',
                minWidth: '38px',
                minHeight: '38px',
                maxWidth: '38px',
                maxHeight: '38px',
                lineHeight: 0,
              }}
            >
                <img
                  src={imageUrl}
                  alt="Album Art"
                  style={{
                    width: '38px',
                    height: '38px',
                    minWidth: '38px',
                    minHeight: '38px',
                    maxWidth: '38px',
                    maxHeight: '38px',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
            </div>
        ) : (
            <div>
                <EntryTypeBadge type={entry.entry_type} />
            </div>
        ))}
      </div>
      
      {/* Render columns based on visibleColumns configuration */}
      {visibleColumns.map((column, index) => {
        switch (column) {
          case 'artistAlbum':
            return (
              <div key={`${column}-${index}`} className="grid-cell artist-cell px-2 py-1">
                <div className="track-info min-w-0">
                  <div className="artist scrolling-text overflow-hidden text-sm font-medium">
                    <div 
                      ref={artistRef}
                      className={`scrolling ${shouldScrollArtist ? 'should-scroll' : ''}`}
                    >
                      <span>{artist}</span>
                    </div>
                  </div>
                  <div className="album scrolling-text overflow-hidden text-xs opacity-80">
                    <div 
                      ref={albumRef}
                      className={`scrolling ${shouldScrollAlbum ? 'should-scroll' : ''}`}
                    >
                      <span><i>{album}</i></span>
                    </div>
                  </div>
                </div>
              </div>
            );
          case 'artist':
            return (
              <div key={`${column}-${index}`} className="grid-cell scrolling-text overflow-hidden px-2 py-1 text-sm">
                <div 
                  ref={artistRef}
                  className={`scrolling ${shouldScrollArtist ? 'should-scroll' : ''}`}
                >
                  <span>{artist}</span>
                </div>
              </div>
            );
          case 'album':
            return (
              <div key={`${column}-${index}`} className="grid-cell scrolling-text overflow-hidden px-2 py-1 text-sm opacity-90">
                <div 
                  ref={albumRef}
                  className={`scrolling ${shouldScrollAlbum ? 'should-scroll' : ''}`}
                >
                  <span><i>{album}</i></span>
                </div>
              </div>
            );
          case 'title':
            return (
              <div key={`${column}-${index}`} className="grid-cell scrolling-text relative overflow-hidden px-2 py-1 pr-8 text-sm">
                <div 
                  ref={scrollingRef}
                  className={`scrolling ${shouldScroll ? 'should-scroll' : ''}`}
                >
                  <span>{contentsHidden}</span>
                </div>
                {isMobile && (<button 
                  className="mobile-menu-button absolute right-1 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-base text-text/70 hover:bg-surface-muted dark:text-text-dark/70 dark:hover:bg-surface-dark-elevated"
                  onClick={handleMenuClick}
                  aria-label="More options"
                >
                  ⋮
                </button>)}
              </div>
            );
          case 'notes':
            return (
              <div key={`${column}-${index}`} className="grid-cell notes-cell px-2 py-1 text-xs italic" onClick={!isEditingNotes ? handleNotesClick : undefined}>
                {isEditingNotes ? (
                  <input
                    ref={notesInputRef}
                    type="text"
                    value={notesValue}
                    onChange={(e) => setNotesValue(e.target.value)}
                    onKeyDown={handleNotesKeyDown}
                    onBlur={handleNotesBlur}
                    className="notes-input w-full rounded border border-accent/60 bg-surface px-1.5 py-1 text-xs text-text outline-none ring-1 ring-accent/20 dark:bg-surface-dark dark:text-text-dark"
                    placeholder="Add notes..."
                  />
                ) : (
                  <span 
                    className="notes-display block min-h-4 rounded px-1 hover:bg-surface-muted dark:hover:bg-surface-dark-elevated"
                  >
                    {entry.getNotes()}
                  </span>
                )}
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
});

PlaylistEntryRow.displayName = 'PlaylistEntryRow';

export default PlaylistEntryRow;