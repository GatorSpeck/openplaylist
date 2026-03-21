import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../common/Modal';
import playlistRepository, { PersistentSyncLogEntry } from '../../repositories/PlaylistRepository';

interface SyncLogEntry {
  action: string;
  track: string;
  target: string;
  target_name?: string;
  reason: string;
  success: boolean;
  error?: string;
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
  const [errorsOnly, setErrorsOnly] = useState(false);

  useEffect(() => {
    if (!open) {
      setErrorsOnly(false);
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
  }, [open, playlistId, errorsOnly]);

  const orderedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;

      if (aTime !== bTime) {
        return bTime - aTime;
      }

      return b.id - a.id;
    });
  }, [entries]);

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
        <div className="mb-5 rounded-lg border border-black/10 bg-surface-subtle p-5 dark:border-white/15 dark:bg-surface-dark">
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
              className={`rounded border px-3 py-1.5 text-xs font-medium transition ${!errorsOnly ? 'border-accent bg-accent text-white' : 'border-black/15 bg-surface text-text hover:bg-surface-subtle dark:border-white/20 dark:bg-surface-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated'}`}
              onClick={() => setErrorsOnly(false)}
            >
              All Events
            </button>
            <button
              type="button"
              className={`rounded border px-3 py-1.5 text-xs font-medium transition ${errorsOnly ? 'border-accent bg-accent text-white' : 'border-black/15 bg-surface text-text hover:bg-surface-subtle dark:border-white/20 dark:bg-surface-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated'}`}
              onClick={() => setErrorsOnly(true)}
            >
              Errors Only
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
            <div className="mb-5 overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
              <div className="flex items-center gap-2 border-b border-black/10 bg-surface-subtle px-4 py-3 font-semibold text-text dark:border-white/15 dark:bg-surface-dark dark:text-text-dark">
                <span className="flex-grow">{orderedEntries.length} events</span>
              </div>

              <div className="max-h-[300px] overflow-y-auto">
                {orderedEntries.map((entry) => {
                  const targetName = entry.targetName || entry.target;
                  const timestamp = entry.createdAt
                    ? new Date(entry.createdAt).toLocaleString()
                    : 'Unknown time';

                  return (
                    <div
                      key={entry.id}
                      className={`flex items-start gap-3 border-b px-4 py-3 last:border-b-0 ${entry.success ? 'border-black/10 bg-emerald-50 dark:border-white/10 dark:bg-emerald-900/15' : 'border-black/10 bg-red-50 dark:border-white/10 dark:bg-red-900/15'}`}
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
              <p>{errorsOnly ? 'No sync errors found for this playlist.' : 'No sync log events found for this playlist.'}</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default SyncLogModal;