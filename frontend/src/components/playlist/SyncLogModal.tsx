import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../common/Modal';
import playlistRepository, { PersistentSyncLogEntry } from '../../repositories/PlaylistRepository';
import './SyncLogModal.css';

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

  const getStatusClass = (success: boolean) => {
    return success ? 'success' : 'error';
  };

  return (
    <Modal 
      open={open} 
      onClose={onClose}
      title={`Sync Log - ${playlistName}`}
      size="large"
    >
      <div className="sync-log-modal">
        {/* Summary Section */}
        {syncResult && (
        <div className="sync-summary">
          <div className={`sync-status ${syncResult.status || 'unknown'}`}>
            <h3>
              {syncResult.status === 'success' ? '✅' : 
               syncResult.status === 'partial' ? '⚠️' : '❌'} 
              Sync {(syncResult.status || 'unknown').charAt(0).toUpperCase() + (syncResult.status || 'unknown').slice(1)}
            </h3>
          </div>
          
          <div className="sync-stats">
            <div className="stat">
              <span className="stat-value">{syncResult.summary?.total_targets || 0}</span>
              <span className="stat-label">Total Targets</span>
            </div>
            <div className="stat">
              <span className="stat-value success">{syncResult.summary?.successful || 0}</span>
              <span className="stat-label">Successful</span>
            </div>
            <div className="stat">
              <span className="stat-value error">{syncResult.summary?.failed || 0}</span>
              <span className="stat-label">Failed</span>
            </div>
          </div>
        </div>
        )}

        {/* Global Errors Section */}
        {syncResult?.failed && syncResult.failed.length > 0 && (
          <div className="sync-errors">
            <h4>⚠️ Sync Errors</h4>
            {syncResult.failed.map((failure, index) => (
              <div key={index} className="error-item">
                <div className="error-service">
                  {getTargetIcon(failure.service)} {failure.service}
                  {failure.target_id && <span className="target-id"> (Target {failure.target_id})</span>}
                </div>
                <div className="error-message">{failure.error}</div>
              </div>
            ))}
          </div>
        )}

        {/* Detailed Log Section */}
        <div className="sync-log-details">
          <h4>Sync Details (Most Recent First)</h4>

          <div className="sync-log-filter-row">
            <button
              type="button"
              className={`sync-log-filter-btn ${!errorsOnly ? 'active' : ''}`}
              onClick={() => setErrorsOnly(false)}
            >
              All Events
            </button>
            <button
              type="button"
              className={`sync-log-filter-btn ${errorsOnly ? 'active' : ''}`}
              onClick={() => setErrorsOnly(true)}
            >
              Errors Only
            </button>
          </div>

          {loading && (
            <div className="no-changes">
              <p>Loading sync log...</p>
            </div>
          )}

          {!loading && error && (
            <div className="sync-errors">
              <h4>⚠️ Sync Errors</h4>
              <div className="error-item">
                <div className="error-message">{error}</div>
              </div>
            </div>
          )}

          {!loading && !error && orderedEntries.length > 0 && (
            <div className="target-group">
              <div className="target-header">
                <span className="target-name">{orderedEntries.length} events</span>
              </div>

              <div className="log-entries">
                {orderedEntries.map((entry) => {
                  const targetName = entry.targetName || entry.target;
                  const timestamp = entry.createdAt
                    ? new Date(entry.createdAt).toLocaleString()
                    : 'Unknown time';

                  return (
                    <div
                      key={entry.id}
                      className={`log-entry ${getStatusClass(entry.success)}`}
                    >
                      <div className="log-icon">
                        {getActionIcon(entry.action)}
                      </div>
                      <div className="log-content">
                        <div className="log-track">{entry.track || '(no track provided)'}</div>
                        <div className="log-reason">
                          [{entry.target.toUpperCase()}] {targetName} • {entry.reason || 'No reason provided'}
                        </div>
                        {entry.error && (
                          <div className="log-error">Error: {entry.error}</div>
                        )}
                      </div>
                      <div className="log-action">
                        <div>{entry.action.replace(/_/g, ' ')}</div>
                        <div className="log-time">{timestamp}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!loading && !error && orderedEntries.length === 0 && (
            <div className="no-changes">
              <p>{errorsOnly ? 'No sync errors found for this playlist.' : 'No sync log events found for this playlist.'}</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default SyncLogModal;