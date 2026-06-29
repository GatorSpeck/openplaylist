import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import libraryRepository from '../../repositories/LibraryRepository';
import {
  Anniversary,
  AnniversaryColumn,
  buildCarouselColumns,
  formatDateKey,
  formatFullDate,
  formatShortDate,
  getAnniversaryBadgeMeta,
  mergeAnniversaryGroups,
} from './anniversaryTimelineUtils';

interface AnniversaryTimelineProps {
  onAlbumClick?: (anniversary: Anniversary) => void;
}

interface DateRange {
  start: Date;
  end: Date;
}

const INITIAL_DAYS_BEFORE = 7;
const INITIAL_DAYS_AFTER = 7;
const LOAD_DAYS = 7;
const NAV_SCROLL_COLUMNS = 3;
const COLUMN_WIDTH_PX = 288;
const COLUMN_GAP_PX = 16;
const EDGE_THRESHOLD_COLUMNS = 2;

const logTimeline = (...args: unknown[]) => {
  console.log('[AnniversaryTimeline]', ...args);
};

const createInitialRange = (): DateRange => {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - INITIAL_DAYS_BEFORE);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + INITIAL_DAYS_AFTER);
  return { start, end };
};

const AnniversaryTimeline: React.FC<AnniversaryTimelineProps> = ({
  onAlbumClick
}) => {
  const [anniversaries, setAnniversaries] = useState<Anniversary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingDirection, setLoadingDirection] = useState<'past' | 'future' | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>(createInitialRange);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const hasCenteredTodayRef = useRef(false);
  const centerRetryRef = useRef(0);
  const scrollRafRef = useRef<number | null>(null);
  const pendingScrollAdjustmentRef = useRef<{ previousScrollLeft: number; previousScrollWidth: number } | null>(null);
  const dragStateRef = useRef({
    isDragging: false,
    pointerId: null as number | null,
    startX: 0,
    startScrollLeft: 0,
    moved: false,
  });
  const suppressClickRef = useRef(false);

  const fetchAnniversariesForRange = useCallback(async (start: Date, end: Date): Promise<Anniversary[]> => {
    return libraryRepository.getAnniversariesInDateRange(formatDateKey(start), formatDateKey(end));
  }, []);

  const loadInitialData = useCallback(async () => {
    try {
      logTimeline('loadInitialData:start');
      setLoading(true);
      setError(null);
      setLoadingDirection(null);
      hasCenteredTodayRef.current = false;
      centerRetryRef.current = 0;
      pendingScrollAdjustmentRef.current = null;

      const initialRange = createInitialRange();
      setDateRange(initialRange);

      const data = await fetchAnniversariesForRange(initialRange.start, initialRange.end);
      logTimeline('loadInitialData:success', {
        rangeStart: formatDateKey(initialRange.start),
        rangeEnd: formatDateKey(initialRange.end),
        count: data.length,
      });
      setAnniversaries(data);
    } catch (err) {
      logTimeline('loadInitialData:error', err);
      console.error('Error fetching anniversaries:', err);
      setError('Failed to load anniversaries');
    } finally {
      setLoading(false);
    }
  }, [fetchAnniversariesForRange]);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  const loadMoreData = useCallback(async (direction: 'past' | 'future') => {
    if (loadingRef.current || loadingDirection) return;

    logTimeline('loadMoreData:start', {
      direction,
      currentRange: {
        start: formatDateKey(dateRange.start),
        end: formatDateKey(dateRange.end),
      },
    });
    loadingRef.current = true;
    setLoadingDirection(direction);

    try {
      let newStart: Date;
      let newEnd: Date;

      if (direction === 'past') {
        newEnd = new Date(dateRange.start.getFullYear(), dateRange.start.getMonth(), dateRange.start.getDate() - 1);
        newStart = new Date(newEnd.getFullYear(), newEnd.getMonth(), newEnd.getDate() - LOAD_DAYS + 1);
      } else {
        newStart = new Date(dateRange.end.getFullYear(), dateRange.end.getMonth(), dateRange.end.getDate() + 1);
        newEnd = new Date(newStart.getFullYear(), newStart.getMonth(), newStart.getDate() + LOAD_DAYS - 1);
      }

      const newData = await fetchAnniversariesForRange(newStart, newEnd);
      logTimeline('loadMoreData:success', {
        direction,
        requestedRange: {
          start: formatDateKey(newStart),
          end: formatDateKey(newEnd),
        },
        count: newData.length,
      });

      if (direction === 'past' && scrollContainerRef.current) {
        pendingScrollAdjustmentRef.current = {
          previousScrollLeft: scrollContainerRef.current.scrollLeft,
          previousScrollWidth: scrollContainerRef.current.scrollWidth,
        };
      }

      setAnniversaries(prev => mergeAnniversaryGroups(prev, newData, direction));

      setDateRange(prev => ({
        start: direction === 'past' ? newStart : prev.start,
        end: direction === 'future' ? newEnd : prev.end,
      }));
    } catch (err) {
      console.error('Error loading more anniversaries:', err);
      logTimeline('loadMoreData:error', { direction, err });
    } finally {
      setLoadingDirection(null);
      loadingRef.current = false;
    }
  }, [dateRange.end, dateRange.start, fetchAnniversariesForRange, loadingDirection]);

  const scrollToDate = useCallback((dateKey: string, behavior: ScrollBehavior = 'smooth') => {
    const container = scrollContainerRef.current;
    if (!container) {
      logTimeline('scrollToDate:missingContainer', { dateKey, behavior });
      return;
    }

    const target = container.querySelector<HTMLElement>(`[data-date="${dateKey}"]`);
    logTimeline('scrollToDate', {
      dateKey,
      behavior,
      found: Boolean(target),
      containerWidth: container.clientWidth,
      scrollWidth: container.scrollWidth,
      scrollLeft: container.scrollLeft,
    });
    if (target) {
      const nextScrollLeft = Math.max(
        0,
        Math.min(
          target.offsetLeft - (container.clientWidth / 2) + (target.offsetWidth / 2),
          Math.max(0, container.scrollWidth - container.clientWidth)
        )
      );

      logTimeline('scrollToDate:applyOffset', {
        dateKey,
        nextScrollLeft,
        targetOffsetLeft: target.offsetLeft,
        targetOffsetWidth: target.offsetWidth,
      });

      container.scrollTo({ left: nextScrollLeft, behavior });
    }
  }, []);

  const scrollToToday = useCallback((behavior: ScrollBehavior = 'auto') => {
    scrollToDate(formatDateKey(new Date()), behavior);
  }, [scrollToDate]);

  useLayoutEffect(() => {
    if (loading || hasCenteredTodayRef.current || anniversaries.length === 0) return;

    let cancelled = false;

    const tryCenter = () => {
      const container = scrollContainerRef.current;
      if (!container) {
        return false;
      }

      const target = container.querySelector<HTMLElement>(`[data-date="${formatDateKey(new Date())}"]`);
      if (!target) {
        logTimeline('centerOnToday:missingTarget', { attempt: centerRetryRef.current });
        return false;
      }

      const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
      if (maxScrollLeft <= 0) {
        logTimeline('centerOnToday:waitingForOverflow', {
          attempt: centerRetryRef.current,
          containerClientWidth: container.clientWidth,
          containerScrollWidth: container.scrollWidth,
        });
        return false;
      }

      logTimeline('centerOnToday:apply', {
        attempt: centerRetryRef.current,
        containerClientWidth: container.clientWidth,
        containerScrollWidth: container.scrollWidth,
        targetOffsetLeft: target.offsetLeft,
        targetOffsetWidth: target.offsetWidth,
      });
      scrollToToday('auto');
      hasCenteredTodayRef.current = true;
      return true;
    };

    const scheduleRetry = () => {
      if (cancelled || hasCenteredTodayRef.current) return;

      if (centerRetryRef.current >= 6) {
        logTimeline('centerOnToday:gaveUp', { attempts: centerRetryRef.current });
        hasCenteredTodayRef.current = true;
        return;
      }

      centerRetryRef.current += 1;
      window.requestAnimationFrame(() => {
        if (cancelled || hasCenteredTodayRef.current) return;
        if (!tryCenter()) {
          scheduleRetry();
        }
      });
    };

    logTimeline('centerOnToday:layoutEffect', {
      attempt: centerRetryRef.current,
      loading,
      anniversaries: anniversaries.length,
    });

    if (!tryCenter()) {
      scheduleRetry();
    }

    return () => {
      cancelled = true;
    };
  }, [anniversaries.length, loading, scrollToToday]);

  useEffect(() => {
    const adjustment = pendingScrollAdjustmentRef.current;
    if (!adjustment) return;

    const frame = window.requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const scrollDelta = container.scrollWidth - adjustment.previousScrollWidth;
      logTimeline('applyScrollAdjustment', {
        previousScrollLeft: adjustment.previousScrollLeft,
        previousScrollWidth: adjustment.previousScrollWidth,
        nextScrollWidth: container.scrollWidth,
        scrollDelta,
      });
      container.scrollLeft = adjustment.previousScrollLeft + scrollDelta;
      pendingScrollAdjustmentRef.current = null;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [anniversaries, dateRange]);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  const handleScroll = useCallback(() => {
    if (scrollRafRef.current !== null) return;

    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;

      const container = scrollContainerRef.current;
      if (!container || loadingRef.current) return;

      logTimeline('scroll', {
        scrollLeft: container.scrollLeft,
        clientWidth: container.clientWidth,
        scrollWidth: container.scrollWidth,
        maxScrollLeft: container.scrollWidth - container.clientWidth,
      });
      const edgeThreshold = (COLUMN_WIDTH_PX + COLUMN_GAP_PX) * EDGE_THRESHOLD_COLUMNS;
      const leftEdge = container.scrollLeft;
      const rightEdge = container.scrollLeft + container.clientWidth;

      if (leftEdge <= edgeThreshold) {
        logTimeline('scroll:triggerLoadPast', { leftEdge, edgeThreshold });
        void loadMoreData('past');
      }

      if (container.scrollWidth - rightEdge <= edgeThreshold) {
        logTimeline('scroll:triggerLoadFuture', { rightEdge, edgeThreshold, remaining: container.scrollWidth - rightEdge });
        void loadMoreData('future');
      }
    });
  }, [loadMoreData]);

  const scrollByColumns = useCallback((direction: 'left' | 'right') => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const step = (COLUMN_WIDTH_PX + COLUMN_GAP_PX) * NAV_SCROLL_COLUMNS;
    logTimeline('scrollByColumns', {
      direction,
      step,
      scrollLeft: container.scrollLeft,
      clientWidth: container.clientWidth,
      scrollWidth: container.scrollWidth,
    });
    container.scrollBy({ left: direction === 'left' ? -step : step, behavior: 'smooth' });
  }, []);

  const logViewportMetrics = useCallback((reason: string) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const viewport = container.firstElementChild as HTMLElement | null;
    logTimeline('viewportMetrics', {
      reason,
      containerClientWidth: container.clientWidth,
      containerScrollWidth: container.scrollWidth,
      containerScrollLeft: container.scrollLeft,
      viewportClientWidth: viewport?.clientWidth,
      viewportScrollWidth: viewport?.scrollWidth,
      viewportOffsetWidth: viewport?.offsetWidth,
      viewportComputedWidth: viewport ? window.getComputedStyle(viewport).width : null,
    });
  }, []);

  const beginDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    logTimeline('pointerdown', {
      pointerType: event.pointerType,
      pointerId: event.pointerId,
      target: (event.target as HTMLElement | null)?.tagName,
      currentTarget: (event.currentTarget as HTMLElement | null)?.tagName,
    });
    if (event.pointerType !== 'mouse') return;

    const container = scrollContainerRef.current;
    if (!container) return;

    logViewportMetrics('pointerdown');

    dragStateRef.current = {
      isDragging: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: container.scrollLeft,
      moved: false,
    };

    container.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const updateDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState.isDragging || dragState.pointerId !== event.pointerId) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    const delta = event.clientX - dragState.startX;
    if (Math.abs(delta) > 4) {
      dragState.moved = true;
    }

    const nextScrollLeft = dragState.startScrollLeft - delta;
    logTimeline('pointermove', {
      pointerId: event.pointerId,
      delta,
      startScrollLeft: dragState.startScrollLeft,
      nextScrollLeft,
      clampedNextScrollLeft: Math.max(0, Math.min(nextScrollLeft, (container.scrollWidth || 0) - (container.clientWidth || 0))),
    });
    container.scrollLeft = nextScrollLeft;
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState.isDragging || dragState.pointerId !== event.pointerId) return;

    const container = scrollContainerRef.current;
    if (container && container.hasPointerCapture(event.pointerId)) {
      container.releasePointerCapture(event.pointerId);
    }

    if (dragState.moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }

    logTimeline('pointerup', {
      pointerId: event.pointerId,
      moved: dragState.moved,
      suppressClick: dragState.moved,
    });

    dragStateRef.current = {
      isDragging: false,
      pointerId: null,
      startX: 0,
      startScrollLeft: 0,
      moved: false,
    };
  };

  const cancelDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState.isDragging || dragState.pointerId !== event.pointerId) return;

    logTimeline('pointercancel-or-leave', {
      pointerId: event.pointerId,
      target: (event.target as HTMLElement | null)?.tagName,
    });

    const container = scrollContainerRef.current;
    if (container && container.hasPointerCapture(event.pointerId)) {
      container.releasePointerCapture(event.pointerId);
    }

    dragStateRef.current = {
      isDragging: false,
      pointerId: null,
      startX: 0,
      startScrollLeft: 0,
      moved: false,
    };
  };

  const handleAlbumClick = (anniversary: Anniversary) => {
    logTimeline('albumClick', {
      id: anniversary.id,
      album: anniversary.album,
      artist: anniversary.artist,
      date: anniversary.anniversary_date,
      suppressed: suppressClickRef.current,
    });
    if (suppressClickRef.current) return;

    if (onAlbumClick) {
      onAlbumClick(anniversary);
    }
  };

  const columns: AnniversaryColumn[] = useMemo(
    () => buildCarouselColumns(dateRange.start, dateRange.end, anniversaries),
    [anniversaries, dateRange.end, dateRange.start]
  );

  if (loading) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center rounded-2xl border border-border bg-surface px-4 py-10 text-text shadow-sm dark:border-border-dark dark:bg-surface-dark-elevated dark:text-text-dark">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-accent/20 border-t-accent" />
          <div>
            <h3 className="text-lg font-semibold">Album anniversaries</h3>
            <p className="mt-1 text-sm text-text/70 dark:text-text-dark/70">Loading the carousel...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-4 text-text shadow-sm dark:text-text-dark">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Album anniversaries</h3>
            <p className="mt-1 text-sm text-rose-900/90 dark:text-rose-100/90">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => { void loadInitialData(); }}
            className="rounded-full bg-rose-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-rose-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (columns.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface px-4 py-8 text-text shadow-sm dark:border-border-dark dark:bg-surface-dark-elevated dark:text-text-dark">
        <div className="flex flex-col items-center gap-2 text-center">
          <h3 className="text-lg font-semibold">Album anniversaries</h3>
          <p className="text-sm text-text/70 dark:text-text-dark/70">No anniversary data found for the current range.</p>
          <button
            type="button"
            onClick={scrollToToday}
            className="mt-2 rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-white transition hover:bg-accent-hover"
          >
            Center on today
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-border bg-surface/95 p-4 shadow-sm dark:border-border-dark dark:bg-surface-dark-elevated">
      <div className="mb-4 flex items-start justify-between gap-4 border-b border-border pb-3 dark:border-border-dark">
        <div>
          <h3 className="text-lg font-semibold text-text dark:text-text-dark">Album anniversaries</h3>
          <p className="mt-1 text-sm text-text/70 dark:text-text-dark/70">
            Browse past and upcoming album birthdays in a fixed-width horizontal carousel.
          </p>
        </div>
        <button
          type="button"
          onClick={scrollToToday}
          className="rounded-full bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={loadingDirection !== null}
        >
          Today
        </button>
      </div>

      <div className="grid w-full min-w-0 max-w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 md:gap-3">
        <button
          type="button"
          aria-label="Scroll anniversary carousel left"
          onClick={() => {
            logTimeline('navClick', { direction: 'left' });
            logViewportMetrics('nav-left-click');
            scrollByColumns('left');
          }}
          disabled={loadingDirection !== null}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-border bg-surface text-base font-semibold text-text shadow-sm transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60 dark:border-border-dark dark:bg-surface-dark dark:text-text-dark"
        >
          ←
        </button>

        <div className="relative min-w-0 max-w-full overflow-hidden">
          {loadingDirection && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-1">
              <div className="rounded-full border border-border bg-surface/95 px-3 py-1 text-xs font-medium text-text shadow-sm dark:border-border-dark dark:bg-surface-dark dark:text-text-dark">
                Loading more {loadingDirection === 'past' ? 'history' : 'future'}
              </div>
            </div>
          )}

          <div
            ref={scrollContainerRef}
            className="block w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden scroll-smooth px-1 py-2 [scrollbar-width:thin]"
            style={{ width: '100%', maxWidth: '100%' }}
            tabIndex={0}
            role="region"
            aria-label="Anniversary carousel"
            onFocus={() => {
              const container = scrollContainerRef.current;
              logTimeline('focusCarousel', {
                clientWidth: container?.clientWidth,
                scrollWidth: container?.scrollWidth,
                scrollLeft: container?.scrollLeft,
              });
            }}
            onScroll={handleScroll}
            onKeyDown={(event) => {
              logTimeline('keydown', { key: event.key, target: (event.target as HTMLElement | null)?.tagName });
              if (event.key === 'ArrowLeft') {
                event.preventDefault();
                scrollByColumns('left');
              } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                scrollByColumns('right');
              } else if (event.key === 'Home') {
                event.preventDefault();
                scrollToToday();
              }
            }}
            onPointerDown={beginDrag}
            onPointerMove={updateDrag}
            onPointerUp={endDrag}
            onPointerCancel={cancelDrag}
            onPointerLeave={cancelDrag}
          >
            <div className="inline-flex w-max snap-x snap-mandatory gap-4">
              {columns.map((column) => {
                const isToday = column.date === formatDateKey(new Date());

                return (
                  <section
                    key={column.date}
                    data-date={column.date}
                    className={`flex h-[34rem] w-[18rem] max-w-[18rem] shrink-0 snap-center flex-col overflow-hidden rounded-2xl border shadow-sm transition ${
                      isToday
                        ? 'border-accent/60 bg-accent/5 ring-1 ring-accent/20 dark:border-accent/70 dark:bg-accent/10'
                        : 'border-border bg-surface-subtle dark:border-border-dark dark:bg-surface-dark'
                    }`}
                  >
                    <header className={`sticky top-0 z-10 border-b px-4 py-3 ${isToday ? 'border-accent/20 bg-accent/10' : 'border-border bg-surface/95 dark:border-border-dark dark:bg-surface-dark/95'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text/50 dark:text-text-dark/45">Anniversary date</p>
                          <p className="mt-1 text-lg font-semibold text-text dark:text-text-dark">{formatShortDate(column.date)}</p>
                          <p className="mt-1 text-sm text-text/70 dark:text-text-dark/70">{formatFullDate(column.date)}</p>
                        </div>

                        {isToday && (
                          <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
                            Today
                          </span>
                        )}
                      </div>
                    </header>

                    <div className="min-h-0 flex-1 overflow-y-auto p-3">
                      {column.anniversaries.length === 0 ? (
                        <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border/70 bg-black/[0.02] px-4 text-center text-sm text-text/55 dark:border-border-dark dark:bg-white/[0.03] dark:text-text-dark/55">
                          No anniversaries on this date
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          {column.anniversaries.map((anniversary) => {
                            const badgeMeta = getAnniversaryBadgeMeta(anniversary.years_since_release);

                            return (
                              <button
                                key={`${anniversary.id}-${column.date}`}
                                type="button"
                                onClick={() => handleAlbumClick(anniversary)}
                                className="group flex w-full flex-col gap-3 rounded-xl border border-border/80 bg-surface p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-md dark:border-border-dark dark:bg-surface-dark-elevated"
                              >
                                <div className="flex items-start gap-3">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold leading-snug text-text dark:text-text-dark">{anniversary.album}</p>
                                    <p className="mt-1 text-xs font-medium uppercase tracking-wide text-text/60 dark:text-text-dark/60">
                                      {anniversary.artist}
                                    </p>
                                  </div>

                                  {anniversary.art_url ? (
                                    <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg border border-border/70 bg-black/[0.03] dark:border-border-dark dark:bg-white/[0.04]">
                                      <img
                                        src={anniversary.art_url}
                                        alt={`${anniversary.album} cover`}
                                        className="h-full w-full object-cover"
                                      />
                                    </div>
                                  ) : (
                                    <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg border border-dashed border-border/70 bg-black/[0.03] text-[11px] font-semibold uppercase tracking-[0.2em] text-text/40 dark:border-border-dark dark:bg-white/[0.03] dark:text-text-dark/40">
                                      Album
                                    </div>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={badgeMeta.className} title={badgeMeta.title}>
                                    <span aria-hidden="true" className="mr-1">{badgeMeta.marker}</span>
                                    {anniversary.years_since_release} year{anniversary.years_since_release === 1 ? '' : 's'} since release
                                  </span>

                                  <span className="inline-flex rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] font-medium text-text/70 dark:bg-white/[0.08] dark:text-text-dark/75">
                                    Released {formatFullDate(anniversary.original_release_date)}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>

        <button
          type="button"
          aria-label="Scroll anniversary carousel right"
          onClick={() => {
            logTimeline('navClick', { direction: 'right' });
            logViewportMetrics('nav-right-click');
            scrollByColumns('right');
          }}
          disabled={loadingDirection !== null}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-border bg-surface text-base font-semibold text-text shadow-sm transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60 dark:border-border-dark dark:bg-surface-dark dark:text-text-dark"
        >
          →
        </button>
      </div>
    </div>
  );
};

export { getAnniversaryBadgeMeta } from './anniversaryTimelineUtils';

export default AnniversaryTimeline;
