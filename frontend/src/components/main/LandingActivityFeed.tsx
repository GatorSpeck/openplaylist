import React from 'react';

export interface LandingActivityEntry {
  id: number;
  entry_type: string;
  date_added?: string | null;
  playlist_id?: number | null;
  playlist_name?: string | null;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  notes?: string | null;
  details?: Record<string, any> | null;
}

interface LandingActivityFeedProps {
  title: string;
  description: string;
  entries: LandingActivityEntry[];
  emptyMessage: string;
  onQuickAdd?: (entry: LandingActivityEntry) => void;
  quickAddLabel?: string;
}

const formatDate = (dateValue?: string | null) => {
  if (!dateValue) {
    return 'Recent activity';
  }

  const parsedDate = new Date(dateValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return 'Recent activity';
  }

  return parsedDate.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const LandingActivityFeed = ({
  title,
  description,
  entries,
  emptyMessage,
  onQuickAdd,
  quickAddLabel = 'Add',
}: LandingActivityFeedProps) => {
  return (
    <section className="flex min-h-[28rem] flex-col rounded-2xl border border-border bg-surface/95 shadow-sm backdrop-blur dark:border-border-dark dark:bg-surface-dark-elevated">
      <div className="border-b border-border px-5 py-4 dark:border-border-dark">
        <h2 className="text-lg font-semibold text-text dark:text-text-dark">{title}</h2>
        <p className="mt-1 text-sm text-text/70 dark:text-text-dark/70">{description}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-text/70 dark:border-border-dark dark:text-text-dark/70">
            {emptyMessage}
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => {
              const titleText = entry.title || 'Untitled item';
              const artistText = entry.artist || 'Unknown artist';
              const albumText = entry.album ? `• ${entry.album}` : '';

              return (
                <article
                  key={`${entry.entry_type}-${entry.id}`}
                  className="rounded-xl border border-border bg-surface px-4 py-4 shadow-sm transition hover:border-accent/40 hover:bg-surface-subtle dark:border-border-dark dark:bg-surface-dark dark:hover:bg-surface-dark-elevated"
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold text-text dark:text-text-dark">{titleText}</h3>
                      <p className="mt-1 text-sm text-text/80 dark:text-text-dark/80">
                        {artistText}
                        {albumText ? ` ${albumText}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text/60 dark:text-text-dark/60">
                    <span>{entry.playlist_name || 'Unknown playlist'}</span>
                    <span>•</span>
                    <span>{formatDate(entry.date_added)}</span>
                    {entry.notes ? (
                      <>
                        <span>•</span>
                        <span className="truncate">{entry.notes}</span>
                      </>
                    ) : null}
                  </div>

                  {onQuickAdd && (
                    <div className="mt-4 flex justify-end border-t border-border pt-3 dark:border-border-dark">
                      <button
                        type="button"
                        onClick={() => onQuickAdd(entry)}
                        className="inline-flex items-center justify-center rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent transition hover:bg-accent/20 sm:px-4"
                      >
                        {quickAddLabel}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default LandingActivityFeed;