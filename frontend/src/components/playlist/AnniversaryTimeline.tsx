import React, { useState, useEffect, useRef, useCallback } from 'react';
import libraryRepository from '../../repositories/LibraryRepository';

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
    // Parse date as local date to avoid timezone issues
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric'
    });
  };

  const formatFullDate = (dateString: string) => {
    // Parse date as local date to avoid timezone issues
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      month: 'long', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const isToday = (dateString: string) => {
    // Parse date as local date to avoid timezone issues
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const today = new Date();
    
    return date.getFullYear() === today.getFullYear() &&
           date.getMonth() === today.getMonth() &&
           date.getDate() === today.getDate();
  };

  const isPast = (dateString: string) => {
    // Parse date as local date to avoid timezone issues
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    
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

    // Sort dates chronologically using proper date parsing
    const sortedEntries = Object.entries(grouped).sort(([a], [b]) => {
      const [yearA, monthA, dayA] = a.split('-').map(Number);
      const [yearB, monthB, dayB] = b.split('-').map(Number);
      const dateA = new Date(yearA, monthA - 1, dayA);
      const dateB = new Date(yearB, monthB - 1, dayB);
      return dateA.getTime() - dateB.getTime();
    });

    return Object.fromEntries(sortedEntries);
  };

  const handleAlbumClick = (anniversary: Anniversary) => {
    if (onAlbumClick) {
      onAlbumClick(anniversary);
    }
  };

  if (loading) {
    return (
      <div className="w-full overflow-hidden rounded-lg border border-border bg-surface p-4 dark:border-border-dark dark:bg-surface-dark-elevated">
        <div className="mb-4 flex items-center justify-between border-b-2 border-accent pb-3">
          <h3 className="m-0 text-lg font-semibold">Album Anniversaries</h3>
        </div>
        <div className="p-8 text-center text-sm opacity-80">Loading anniversaries...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full overflow-hidden rounded-lg border border-border bg-surface p-4 dark:border-border-dark dark:bg-surface-dark-elevated">
        <div className="mb-4 flex items-center justify-between border-b-2 border-accent pb-3">
          <h3 className="m-0 text-lg font-semibold">Album Anniversaries</h3>
        </div>
        <div className="p-8 text-center text-sm text-red-600">{error}</div>
        <button
          onClick={loadInitialData}
          className="mx-auto mt-2 block rounded bg-red-600 px-4 py-2 text-sm font-medium text-text-dark transition hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (anniversaries.length === 0) {
    return (
      <div className="w-full overflow-hidden rounded-lg border border-border bg-surface p-4 dark:border-border-dark dark:bg-surface-dark-elevated">
        <div className="mb-4 flex items-center justify-between border-b-2 border-accent pb-3">
          <h3 className="m-0 text-lg font-semibold">Album Anniversaries</h3>
        </div>
        <div className="p-8 text-center text-sm opacity-80">
          No anniversaries found in the current date range.
        </div>
      </div>
    );
  }

  const groupedAnniversaries = groupAnniversariesByDate();

  const anniversaryCards = Object.entries(groupedAnniversaries).map(([date, dayAnniversaries]) => {
    const today = isToday(date);
    const past = isPast(date);

    return (
    <div
      key={date}
      className={`timeline-day relative min-w-[200px] flex-shrink-0 border-t-4 pt-4 sm:min-w-[240px] md:min-w-[280px] ${today ? 'today border-accent' : 'border-border dark:border-border-dark'} ${past ? 'past opacity-70' : ''}`}
    >
      <div
        className={`day-header relative mb-3 min-h-[76px] rounded-md border px-2 py-2 text-center ${today ? 'border-accent/40 bg-accent/10 dark:border-accent/60 dark:bg-accent/20' : 'border-border bg-surface-subtle dark:border-border-dark dark:bg-surface-dark'}`}
      >
        <div className="day-date flex flex-col items-center gap-1.5">
          <span className="day-short rounded-full bg-surface-muted px-3 py-1 text-sm font-semibold tracking-wide text-text dark:bg-surface-dark dark:text-text-dark sm:text-base">
            {formatDate(date)}
          </span>
          <span className="day-full rounded-md bg-surface-subtle px-2.5 py-1 text-xs font-medium opacity-85 dark:bg-surface-dark sm:text-sm">{formatFullDate(date)}</span>
        </div>
        {today && (
          <span className="today-badge pointer-events-none absolute right-2 top-2 inline-flex rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-text-dark shadow-sm">
            Today
          </span>
        )}
      </div>

      <div className="day-anniversaries flex flex-col gap-2">
        {dayAnniversaries.map(anniversary => (
          <div
            key={`${anniversary.id}-${date}`}
            className="anniversary-item flex min-h-[100px] cursor-pointer flex-col rounded-md border border-border bg-surface-subtle p-3 transition hover:-translate-y-0.5 hover:border-accent hover:bg-surface-muted hover:shadow-sm dark:border-border-dark dark:bg-surface-dark dark:hover:bg-surface-dark-elevated md:min-h-[120px]"
            onClick={() => handleAlbumClick(anniversary)}
          >
            <div className="album-info flex flex-1 flex-col">
              <div className="album-title mb-1 rounded-md bg-surface-muted px-2.5 py-1.5 text-sm font-semibold leading-tight text-text dark:bg-surface-dark dark:text-text-dark">{anniversary.album}</div>
              <div className="album-artist mb-2 inline-flex w-fit rounded-full bg-surface-subtle px-2.5 py-1 text-xs font-medium leading-tight text-text/85 dark:bg-surface-dark dark:text-text-dark/90">{anniversary.artist}</div>
              <div className="anniversary-info mt-auto flex flex-col gap-1 border-t border-border pt-2 dark:border-border-dark">
                {(() => {
                  const badgeMeta = getAnniversaryBadgeMeta(anniversary.years_since_release);
                  return (
                    <span className={`years-badge ${badgeMeta.className}`} title={badgeMeta.title}>
                      <span aria-hidden="true" className="mr-1">{badgeMeta.marker}</span>
                      {anniversary.years_since_release} year{anniversary.years_since_release !== 1 ? 's' : ''}
                    </span>
                  );
                })()}
                <span className="original-date inline-flex w-fit rounded-md bg-surface-subtle px-2 py-1 text-[11px] font-medium text-text/70 dark:bg-surface-dark dark:text-text-dark/75">
                  Released {formatFullDate(anniversary.original_release_date)}
                </span>
              </div>
            </div>

            {anniversary.art_url && (
              <div className="album-art mx-auto mt-2 h-10 w-10 flex-shrink-0 self-center overflow-hidden rounded">
                <img className="h-full w-full object-cover" src={anniversary.art_url} alt={`${anniversary.album} cover`} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )});

  return (
    <div className="w-full max-w-full overflow-hidden rounded-lg border border-border bg-surface p-4 dark:border-border-dark dark:bg-surface-dark-elevated">
      <div className="mb-4 flex items-center justify-between border-b-2 border-accent pb-3">
        <h3 className="m-0 text-lg font-semibold">Album Anniversaries</h3>
        <div className="timeline-controls flex gap-2">
          <button
            onClick={scrollToToday}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-text-dark transition hover:bg-emerald-700"
          >
            Today
          </button>
        </div>
      </div>

      <div className="timeline-wrapper flex w-full items-center">
        <button 
          className="timeline-arrow left-arrow mr-2 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-text-dark shadow-sm transition hover:scale-105 hover:bg-accent-hover disabled:opacity-50 disabled:hover:scale-100 sm:mr-3 sm:h-9 sm:w-9 sm:text-base md:h-10 md:w-10 md:text-lg"
          onClick={() => scrollTimeline('left')}
          disabled={loadingMore}
        >
          ←
        </button>

        <div className="timeline-content flex flex-1 gap-3 overflow-x-auto overflow-y-hidden py-4 sm:gap-4 md:gap-6" ref={scrollContainerRef}>
          {loadingMore && (
            <div className="loading-indicator left order-first flex h-full min-w-20 flex-shrink-0 items-center justify-center">
              <div className="spinner animate-spin text-2xl text-accent">⟳</div>
            </div>
          )}
          
          {anniversaryCards}

          {loadingMore && (
            <div className="loading-indicator right flex h-full min-w-20 flex-shrink-0 items-center justify-center">
              <div className="spinner animate-spin text-2xl text-accent">⟳</div>
            </div>
          )}
        </div>

        <button 
          className="timeline-arrow right-arrow ml-2 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-text-dark shadow-sm transition hover:scale-105 hover:bg-accent-hover disabled:opacity-50 disabled:hover:scale-100 sm:ml-3 sm:h-9 sm:w-9 sm:text-base md:h-10 md:w-10 md:text-lg"
          onClick={() => scrollTimeline('right')}
          disabled={loadingMore}
        >
          →
        </button>
      </div>
    </div>
  );
};

export function getAnniversaryBadgeMeta(years: number): { className: string; marker: string; title: string } {
  if (years <= 0) {
    return {
      className: 'inline-flex w-fit items-center rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-text-dark ring-1 ring-emerald-300/70 shadow-sm',
      marker: '●',
      title: 'New release anniversary',
    };
  } else if (years % 10 === 0) {
    return {
      className: 'inline-flex w-fit items-center rounded-full bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 px-2.5 py-1 text-[11px] font-semibold text-amber-950 ring-1 ring-amber-200/90 shadow-sm',
      marker: '🥇',
      title: 'Gold milestone anniversary',
    };
  } else if (years % 5 === 0) {
    return {
      className: 'inline-flex w-fit items-center rounded-full bg-gradient-to-r from-slate-200 via-slate-300 to-slate-400 px-2.5 py-1 text-[11px] font-semibold text-slate-900 ring-1 ring-slate-200/80 shadow-sm',
      marker: '🥈',
      title: 'Silver milestone anniversary',
    };
  } else {
    return {
      className: 'inline-flex w-fit items-center rounded-full bg-gradient-to-r from-amber-700 via-orange-600 to-amber-800 px-2.5 py-1 text-[11px] font-semibold text-amber-50 ring-1 ring-amber-500/50 shadow-sm',
      marker: '🥉',
      title: 'Bronze anniversary',
    };
  }
}

export default AnniversaryTimeline;