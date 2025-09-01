import React, { useState, useEffect, useRef, useCallback } from 'react';
import libraryRepository from '../../repositories/LibraryRepository';
import '../../styles/AnniversaryTimeline.css';

interface Anniversary {
  id: number;
  album: string;
  artist: string;
  original_release_date: string;
  anniversary_date: string;
  years_since_release: number;
  art_url?: string;
}

interface AnniversaryTimelineProps {
  onAlbumClick?: (anniversary: Anniversary) => void;
}

interface DateRange {
  start: Date;
  end: Date;
}

const AnniversaryTimeline: React.FC<AnniversaryTimelineProps> = ({
  onAlbumClick
}) => {
  const [anniversaries, setAnniversaries] = useState<Anniversary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true); // Track if this is the initial load
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - 7); // 7 days behind
    const end = new Date(today);
    end.setDate(today.getDate() + 30); // 30 days ahead
    return { start, end };
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const userHasScrolled = useRef(false); // Track if user has manually scrolled

  const CHUNK_SIZE = 7; // Days to load at once (reduced for arrow navigation)
  const SCROLL_AMOUNT = 3; // Number of days to scroll per arrow click

  const fetchAnniversariesForRange = async (start: Date, end: Date): Promise<Anniversary[]> => {
    const startDateStr = start.toISOString().split('T')[0];
    const endDateStr = end.toISOString().split('T')[0];
    
    return await libraryRepository.getAnniversariesInDateRange(startDateStr, endDateStr);
  };

  const loadInitialData = async () => {
    try {
      setLoading(true);
      setError(null);
      setIsInitialLoad(true); // Mark as initial load
      const data = await fetchAnniversariesForRange(dateRange.start, dateRange.end);
      setAnniversaries(data);
    } catch (err) {
      console.error('Error fetching anniversaries:', err);
      setError('Failed to load anniversaries');
    } finally {
      setLoading(false);
    }
  };

  // Add this useEffect to trigger initial data fetch
  useEffect(() => {
    loadInitialData();
  }, []); // Empty dependency array means this runs once on mount

  const loadMoreData = async (direction: 'past' | 'future') => {
    if (loadingRef.current) return;
    
    loadingRef.current = true;
    setLoadingMore(true);

    try {
      let newStart: Date, newEnd: Date;
      
      if (direction === 'past') {
        // Load data before the current start date
        newEnd = new Date(dateRange.start);
        newEnd.setDate(newEnd.getDate() - 1); // Don't overlap
        newStart = new Date(newEnd);
        newStart.setDate(newStart.getDate() - CHUNK_SIZE + 1);
      } else {
        // Load data after the current end date
        newStart = new Date(dateRange.end);
        newStart.setDate(newStart.getDate() + 1); // Don't overlap
        newEnd = new Date(newStart);
        newEnd.setDate(newEnd.getDate() + CHUNK_SIZE - 1);
      }

      const newData = await fetchAnniversariesForRange(newStart, newEnd);
      
      // Store current scroll position before updating data
      const currentScrollLeft = scrollContainerRef.current?.scrollLeft || 0;
      
      setAnniversaries(prev => {
        const combined = direction === 'past' ? [...newData, ...prev] : [...prev, ...newData];
        // Remove duplicates based on id and date
        const unique = combined.filter((item, index, self) => 
          index === self.findIndex(t => t.id === item.id && t.anniversary_date === item.anniversary_date)
        );
        return unique;
      });

      setDateRange(prev => ({
        start: direction === 'past' ? newStart : prev.start,
        end: direction === 'future' ? newEnd : prev.end
      }));

      // Restore scroll position after DOM update (for past direction)
      if (direction === 'past') {
        setTimeout(() => {
          if (scrollContainerRef.current && userHasScrolled.current) {
            const dayWidth = 304;
            const addedDays = newData.length > 0 ? CHUNK_SIZE : 0;
            const scrollOffset = addedDays * dayWidth;
            scrollContainerRef.current.scrollLeft = currentScrollLeft + scrollOffset;
          }
        }, 50);
      }

    } catch (err) {
      console.error('Error loading more anniversaries:', err);
    } finally {
      setLoadingMore(false);
      loadingRef.current = false;
    }
  };

  const scrollToToday = () => {
    if (!scrollContainerRef.current) return;
    
    const todayElement = scrollContainerRef.current.querySelector('.timeline-day.today');
    if (todayElement) {
      userHasScrolled.current = false; // Reset when manually going to today
      todayElement.scrollIntoView({ behavior: 'smooth', inline: 'center' });
    }
  };

  const scrollTimeline = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;

    userHasScrolled.current = true; // Mark that user has scrolled
    
    const container = scrollContainerRef.current;
    const dayWidth = 304; // 280px min-width + 24px gap
    const scrollDistance = dayWidth * SCROLL_AMOUNT;
    
    const currentScroll = container.scrollLeft;
    const maxScroll = container.scrollWidth - container.clientWidth;
    
    if (direction === 'left') {
      const newScroll = Math.max(0, currentScroll - scrollDistance);
      container.scrollTo({ left: newScroll, behavior: 'smooth' });
      
      // Load more data if near the beginning
      if (newScroll < dayWidth * 2) {
        loadMoreData('past');
      }
    } else {
      const newScroll = Math.min(maxScroll, currentScroll + scrollDistance);
      container.scrollTo({ left: newScroll, behavior: 'smooth' });
      
      // Load more data if near the end
      if (newScroll > maxScroll - dayWidth * 2) {
        loadMoreData('future');
      }
    }
  };

  // Auto-scroll to today on initial load only
  useEffect(() => {
    if (!loading && anniversaries.length > 0 && isInitialLoad) {
      setTimeout(() => {
        scrollToToday();
        setIsInitialLoad(false); // Mark initial load as complete
      }, 100);
    }
  }, [loading, anniversaries, isInitialLoad]);

  // Add scroll event listener to track manual scrolling
  useEffect(() => {
    const handleManualScroll = () => {
      userHasScrolled.current = true;
    };

    const scrollContainer = scrollContainerRef.current;
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleManualScroll);
      return () => scrollContainer.removeEventListener('scroll', handleManualScroll);
    }
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric'
    });
  };

  const formatFullDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      month: 'long', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const isToday = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isPast = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const groupAnniversariesByDate = () => {
    const grouped: { [key: string]: Anniversary[] } = {};
    
    anniversaries.forEach(anniversary => {
      const date = anniversary.anniversary_date;
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(anniversary);
    });

    // Sort dates chronologically
    const sortedEntries = Object.entries(grouped).sort(([a], [b]) => 
      new Date(a).getTime() - new Date(b).getTime()
    );

    return Object.fromEntries(sortedEntries);
  };

  const handleAlbumClick = (anniversary: Anniversary) => {
    if (onAlbumClick) {
      onAlbumClick(anniversary);
    }
  };

  if (loading) {
    return (
      <div className="anniversary-timeline loading">
        <div className="timeline-header">
          <h3>Album Anniversaries</h3>
        </div>
        <div className="loading-message">Loading anniversaries...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="anniversary-timeline error">
        <div className="timeline-header">
          <h3>Album Anniversaries</h3>
        </div>
        <div className="error-message">{error}</div>
        <button onClick={loadInitialData} className="retry-button">
          Retry
        </button>
      </div>
    );
  }

  if (anniversaries.length === 0) {
    return (
      <div className="anniversary-timeline empty">
        <div className="timeline-header">
          <h3>Album Anniversaries</h3>
        </div>
        <div className="empty-message">
          No anniversaries found in the current date range.
        </div>
      </div>
    );
  }

  const groupedAnniversaries = groupAnniversariesByDate();

  return (
    <div className="anniversary-timeline">
      <div className="timeline-header">
        <h3>Album Anniversaries</h3>
        <div className="timeline-controls">
          <button onClick={scrollToToday} className="today-button">
            Today
          </button>
        </div>
      </div>

      <div className="timeline-wrapper">
        <button 
          className="timeline-arrow left-arrow"
          onClick={() => scrollTimeline('left')}
          disabled={loadingMore}
        >
          ←
        </button>

        <div className="timeline-content" ref={scrollContainerRef}>
          {loadingMore && (
            <div className="loading-indicator left">
              <div className="spinner">⟳</div>
            </div>
          )}
          
          {Object.entries(groupedAnniversaries).map(([date, dayAnniversaries]) => (
            <div 
              key={date} 
              className={`timeline-day ${isToday(date) ? 'today' : ''} ${isPast(date) ? 'past' : ''}`}
            >
              <div className="day-header">
                <div className="day-date">
                  <span className="day-short">{formatDate(date)}</span>
                  <span className="day-full">{formatFullDate(date)}</span>
                </div>
                {isToday(date) && <span className="today-badge">Today</span>}
              </div>

              <div className="day-anniversaries">
                {dayAnniversaries.map(anniversary => (
                  <div 
                    key={`${anniversary.id}-${date}`}
                    className="anniversary-item"
                    onClick={() => handleAlbumClick(anniversary)}
                  >
                    <div className="album-info">
                      <div className="album-title">{anniversary.album}</div>
                      <div className="album-artist">{anniversary.artist}</div>
                      <div className="anniversary-info">
                        <span className="years-badge">
                          {anniversary.years_since_release} year{anniversary.years_since_release !== 1 ? 's' : ''}
                        </span>
                        <span className="original-date">
                          Released {formatFullDate(anniversary.original_release_date)}
                        </span>
                      </div>
                    </div>
                    
                    {anniversary.art_url && (
                      <div className="album-art">
                        <img src={anniversary.art_url} alt={`${anniversary.album} cover`} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {loadingMore && (
            <div className="loading-indicator right">
              <div className="spinner">⟳</div>
            </div>
          )}
        </div>

        <button 
          className="timeline-arrow right-arrow"
          onClick={() => scrollTimeline('right')}
          disabled={loadingMore}
        >
          →
        </button>
      </div>
    </div>
  );
};

export default AnniversaryTimeline;