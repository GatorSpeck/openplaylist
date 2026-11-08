import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../common/Modal';
import playlistRepository, { PersistentSyncLogEntry } from '../../repositories/PlaylistRepository';
import { getSyncMatch, needsReview, SyncMatchConfidence, SYNC_MATCH_LEVEL_LABELS } from '../../lib/syncMatch';

type LogFilter = 'all' | 'errors' | 'review';

const isReviewEntry = (entry: { eventKind?: string; metadata?: Record<string, any> | null }) => needsReview(entry) || entry.eventKind === 'failed_match';

const LEVEL_BADGE_CLASSES: Record<string, string> = {
  high: 'border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
  medium: 'border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
  low: 'border-red-300 bg-red-100 text-red-800 dark:border-red-700 dark:bg-red-900/40 dark:text-red-200',
  none: 'border-red-300 bg-red-100 text-red-800 dark:border-red-700 dark:bg-red-900/40 dark:text-red-200',
};

const MatchConfidenceBadge: React.FC<{ match: SyncMatchConfidence }> = ({ match }) => (
  <span
    className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold ${LEVEL_BADGE_CLASSES[match.level] || LEVEL_BADGE_CLASSES.low}`}
    title="How closely the synced track's title/artist/album match the track that was requested"
  >
    {match.needs_review && <span aria-hidden="true">⚑</span>}
    {SYNC_MATCH_LEVEL_LABELS[match.level] || match.level}
    {match.matched && <span className="font-normal">({match.score}%)</span>}
  </span>
);

const MatchComparison: React.FC<{ match: SyncMatchConfidence }> = ({ match }) => (
  <table className="mt-2 w-full border-collapse text-xs">
    <thead>
      <tr className="text-left text-text/70 dark:text-text-dark/70">
        <th className="pr-3 font-medium"></th>
        <th className="pr-3 font-medium">Requested</th>
        <th className="pr-3 font-medium">Synced to</th>
        <th className="font-medium">Score</th>
      </tr>
    </thead>
    <tbody>
      {(['title', 'artist', 'album'] as const).map((fieldName) => {
        const field = match.fields?.[fieldName] || {};
        const weak = typeof field.score === 'number' && field.score < 60;
        return (
          <tr key={fieldName} className="align-top text-text dark:text-text-dark">
            <td className="pr-3 capitalize text-text/70 dark:text-text-dark/70">{fieldName}</td>
            <td className="pr-3">{field.target || '—'}</td>
            <td className={`pr-3 ${weak ? 'font-semibold text-red-700 dark:text-red-300' : ''}`}>{field.matched || '—'}</td>
            <td>{typeof field.score === 'number' ? `${field.score}%` : '—'}</td>
          </tr>
        );
      })}
    </tbody>
  </table>
);

interface SyncLogEntry {
  action: string;
  track: string;
  target: string;
  target_name?: string;
  reason: string;
  success: boolean;
  error?: string;
  eventKind?: string;
  metadata?: Record<string, any> | null;
}

interface SyncResult {
  status: string;
  synced: any[];
  failed: any[];
  summary: {
    total_targets: number;
    successful: number;
    failed: number;
  };
  log: SyncLogEntry[];
}

interface SyncLogModalProps {
  open: boolean;
  onClose: () => void;
  syncResult?: SyncResult | null;
  playlistId: number;
  playlistName: string;
}

const SyncLogModal: React.FC<SyncLogModalProps> = ({ 
  open, 
  onClose, 
  playlistId,
  syncResult,
  playlistName 
}) => {
  const [entries, setEntries] = useState<PersistentSyncLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<LogFilter>('all');
  const [reloadToken, setReloadToken] = useState(0);
  const [resyncing, setResyncing] = useState<Record<number, 'running' | 'done' | string>>({});
  const errorsOnly = filter === 'errors';

  useEffect(() => {
    if (!open) {
      setFilter('all');
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const fetchSyncLog = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await playlistRepository.getSyncLog(playlistId, {
          limit: 300,
          offset: 0,
          includeSuccess: !errorsOnly,
        });
        setEntries(result);
      } catch (fetchError) {
        console.error('Failed to load sync log:', fetchError);
        setError('Failed to load sync log');
      } finally {
        setLoading(false);
      }
    };

    fetchSyncLog();
  }, [open, playlistId, errorsOnly, reloadToken]);

  const handleResync = async (musicFileId: number) => {
    setResyncing((prev) => ({ ...prev, [musicFileId]: 'running' }));
    try {
      await playlistRepository.resyncTrack(playlistId, musicFileId);
      setResyncing((prev) => ({ ...prev, [musicFileId]: 'done' }));
      setReloadToken((token) => token + 1);
    } catch (resyncError) {
      const message = resyncError instanceof Error ? resyncError.message : 'Resync failed';
      setResyncing((prev) => ({ ...prev, [musicFileId]: message }));
    }
  };

  const reviewCount = useMemo(() => entries.filter(isReviewEntry).length, [entries]);
  const lastSyncReviewCount = useMemo(
    () => (syncResult?.log || []).filter(isReviewEntry).length,
    [syncResult]
  );

  const orderedEntries = useMemo(() => {
    const visible = filter === 'review' ? entries.filter(isReviewEntry) : entries;
    return [...visible].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;

      if (aTime !== bTime) {
        return bTime - aTime;
      }

      return b.id - a.id;
    });
  }, [entries, filter]);

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'add': return '➕';
      case 'remove': return '➖';
      case 'create': return '🆕';
      case 'failed_match': return '❓';
      case 'force_push': return '⚠️';
      default: return '🔄';
    }
  };

  const getTargetIcon = (target: string) => {
    switch (target.toLowerCase()) {
      case 'local': return '💻';
      case 'spotify': return '🟢';
      case 'plex': return '🎵';
      case 'youtube': return '▶️';
      default: return '🌐';
    }
  };

  return (
    <Modal 
      open={open} 
      onClose={onClose}
      title={`Sync Log - ${playlistName}`}
      size="large"
    >
      <div className="max-h-[70vh] overflow-y-auto">
        {/* Summary Section */}
        {syncResult && (
        <div className="mb-5 rounded-lg border border-border bg-surface-subtle p-5 dark:border-border-dark dark:bg-surface-dark">
          <div>
            <h3 className={`m-0 text-lg font-semibold ${syncResult.status === 'success' ? 'text-emerald-600 dark:text-emerald-400' : syncResult.status === 'partial' ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
              {syncResult.status === 'success' ? '✅' : 
               syncResult.status === 'partial' ? '⚠️' : '❌'} 
              Sync {(syncResult.status || 'unknown').charAt(0).toUpperCase() + (syncResult.status || 'unknown').slice(1)}
            </h3>
          </div>
          
          <div className="mt-4 flex flex-wrap gap-6">
            <div className="flex flex-col items-center">
              <span className="text-2xl font-bold text-text dark:text-text-dark">{syncResult.summary?.total_targets || 0}</span>
              <span className="text-xs font-medium uppercase tracking-wide text-text/70 dark:text-text-dark/70">Total Targets</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{syncResult.summary?.successful || 0}</span>
              <span className="text-xs font-medium uppercase tracking-wide text-text/70 dark:text-text-dark/70">Successful</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-2xl font-bold text-red-600 dark:text-red-400">{syncResult.summary?.failed || 0}</span>
              <span className="text-xs font-medium uppercase tracking-wide text-text/70 dark:text-text-dark/70">Failed</span>
            </div>
            <div className="flex flex-col items-center">
              <span className={`text-2xl font-bold ${lastSyncReviewCount ? 'text-amber-600 dark:text-amber-400' : 'text-text dark:text-text-dark'}`}>{lastSyncReviewCount}</span>
              <span className="text-xs font-medium uppercase tracking-wide text-text/70 dark:text-text-dark/70">Needs Review</span>
            </div>
          </div>
        </div>
        )}

        {/* Global Errors Section */}
        {syncResult?.failed && syncResult.failed.length > 0 && (
          <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/30">
            <h4 className="mb-3 mt-0 text-base font-semibold text-amber-800 dark:text-amber-200">⚠️ Sync Errors</h4>
            {syncResult.failed.map((failure, index) => (
              <div key={index} className="mb-2 rounded border-l-4 border-l-amber-500 bg-surface p-3 last:mb-0 dark:bg-surface-dark-elevated">
                <div className="mb-1 flex items-center gap-1 text-sm font-semibold text-text dark:text-text-dark">
                  {getTargetIcon(failure.service)} {failure.service}
                  {failure.target_id && <span className="text-xs font-normal text-text/70 dark:text-text-dark/70"> (Target {failure.target_id})</span>}
                </div>
                <div className="text-sm text-red-700 dark:text-red-300">{failure.error}</div>
              </div>
            ))}
          </div>
        )}

        {/* Detailed Log Section */}
        <div>
          <h4 className="mb-3 mt-0 text-base font-semibold text-text dark:text-text-dark">Sync Details (Most Recent First)</h4>

          <div className="mb-3 flex gap-2">
            <button
              type="button"
              className={`rounded border px-3 py-1.5 text-xs font-medium transition ${filter === 'all' ? 'border-accent bg-accent text-text-dark' : 'border-border bg-surface text-text hover:bg-surface-subtle dark:border-border-dark dark:bg-surface-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated'}`}
              onClick={() => setFilter('all')}
            >
              All Events
            </button>
            <button
              type="button"
              className={`rounded border px-3 py-1.5 text-xs font-medium transition ${filter === 'errors' ? 'border-accent bg-accent text-text-dark' : 'border-border bg-surface text-text hover:bg-surface-subtle dark:border-border-dark dark:bg-surface-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated'}`}
              onClick={() => setFilter('errors')}
            >
              Errors Only
            </button>
            <button
              type="button"
              className={`rounded border px-3 py-1.5 text-xs font-medium transition ${filter === 'review' ? 'border-accent bg-accent text-text-dark' : 'border-border bg-surface text-text hover:bg-surface-subtle dark:border-border-dark dark:bg-surface-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated'}`}
              onClick={() => setFilter('review')}
              title="Synced tracks whose title/artist differ from what was requested, plus tracks that couldn't be matched"
            >
              Needs Review{filter !== 'errors' && reviewCount > 0 ? ` (${reviewCount})` : ''}
            </button>
          </div>

          {loading && (
            <div className="py-10 text-center text-sm text-text/70 dark:text-text-dark/70">
              <p>Loading sync log...</p>
            </div>
          )}

          {!loading && error && (
            <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/30">
              <h4 className="mb-3 mt-0 text-base font-semibold text-amber-800 dark:text-amber-200">⚠️ Sync Errors</h4>
              <div className="rounded border-l-4 border-l-amber-500 bg-surface p-3 dark:bg-surface-dark-elevated">
                <div className="text-sm text-red-700 dark:text-red-300">{error}</div>
              </div>
            </div>
          )}

          {!loading && !error && orderedEntries.length > 0 && (
            <div className="mb-5 overflow-hidden rounded-lg border border-border dark:border-border-dark">
              <div className="flex items-center gap-2 border-b border-border bg-surface-subtle px-4 py-3 font-semibold text-text dark:border-border-dark dark:bg-surface-dark dark:text-text-dark">
                <span className="flex-grow">{orderedEntries.length} events</span>
              </div>

              <div className="max-h-[300px] overflow-y-auto">
                {orderedEntries.map((entry) => {
                  const targetName = entry.targetName || entry.target;
                  const timestamp = entry.createdAt
                    ? new Date(entry.createdAt).toLocaleString()
                    : 'Unknown time';
                  const match = getSyncMatch(entry);
                  const flagged = Boolean(match?.needs_review);
                  const musicFileId: number | undefined = entry.metadata?.music_file_id ?? undefined;
                  const canResync = Boolean(musicFileId) && entry.target !== 'local' && isReviewEntry(entry);
                  const resyncState = musicFileId ? resyncing[musicFileId] : undefined;
                  const rowColor = !entry.success
                    ? 'bg-red-50 dark:bg-red-900/15'
                    : flagged
                      ? 'bg-amber-50 dark:bg-amber-900/15'
                      : 'bg-emerald-50 dark:bg-emerald-900/15';

                  return (
                    <div
                      key={entry.id}
                      data-testid="sync-log-entry"
                      className={`flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0 dark:border-border-dark ${rowColor}`}
                    >
                      <div className="w-6 text-center text-lg">
                        {getActionIcon(entry.action)}
                      </div>
                      <div className="min-w-0 flex-grow">
                        <div className="mb-1 text-sm font-semibold text-text dark:text-text-dark">{entry.track || '(no track provided)'}</div>
                        <div className="mb-1 text-xs text-text/75 dark:text-text-dark/75">
                          [{entry.target.toUpperCase()}] {targetName} • {entry.reason || 'No reason provided'}
                        </div>
                        {entry.error && (
                          <div className="text-xs italic text-red-700 dark:text-red-300">Error: {entry.error}</div>
                        )}
                        {match && (
                          <div className="mt-1">
                            <MatchConfidenceBadge match={match} />
                            {(flagged || match.level === 'medium') && <MatchComparison match={match} />}
                          </div>
                        )}
                        {canResync && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              className="rounded border border-border bg-surface px-2 py-1 text-xs font-medium text-text transition hover:bg-surface-subtle disabled:opacity-60 dark:border-border-dark dark:bg-surface-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated"
                              onClick={() => handleResync(musicFileId as number)}
                              disabled={resyncState === 'running'}
                              title="Re-match this track on the playlist's sync targets, replacing its current remote match"
                            >
                              {resyncState === 'running' ? 'Resyncing…' : 'Resync track'}
                            </button>
                            {resyncState === 'done' && (
                              <span className="text-xs text-emerald-700 dark:text-emerald-300">Resynced — see newest events</span>
                            )}
                            {resyncState && resyncState !== 'running' && resyncState !== 'done' && (
                              <span className="text-xs text-red-700 dark:text-red-300">{resyncState}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="min-w-[90px] text-right text-xs font-semibold capitalize text-accent dark:text-sky-300">
                        <div>{entry.action.replace(/_/g, ' ')}</div>
                        <div className="mt-1 text-[11px] font-normal text-text/70 dark:text-text-dark/70">{timestamp}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!loading && !error && orderedEntries.length === 0 && (
            <div className="py-10 text-center text-sm text-text/70 dark:text-text-dark/70">
              <p>
                {filter === 'errors'
                  ? 'No sync errors found for this playlist.'
                  : filter === 'review'
                    ? 'No synced tracks need review.'
                    : 'No sync log events found for this playlist.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default SyncLogModal;