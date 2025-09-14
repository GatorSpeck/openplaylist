import React from 'react';
import Modal from '../common/Modal';
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
  syncResult: SyncResult | null;
  playlistName: string;
}

const SyncLogModal: React.FC<SyncLogModalProps> = ({ 
  open, 
  onClose, 
  syncResult,
  playlistName 
}) => {
  if (!syncResult) return null;

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'add': return '➕';
      case 'remove': return '➖';
      case 'create': return '🆕';
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

  const groupedLogs = syncResult.log.reduce((groups, entry) => {
    const key = `${entry.target}-${entry.target_name || 'default'}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(entry);
    return groups;
  }, {} as Record<string, SyncLogEntry[]>);

  return (
    <Modal 
      open={open} 
      onClose={onClose}
      title={`Sync Log - ${playlistName}`}
      size="large"
    >
      <div className="sync-log-modal">
        {/* Summary Section */}
        <div className="sync-summary">
          <div className={`sync-status ${syncResult.status}`}>
            <h3>
              {syncResult.status === 'success' ? '✅' : 
               syncResult.status === 'partial' ? '⚠️' : '❌'} 
              Sync {syncResult.status.charAt(0).toUpperCase() + syncResult.status.slice(1)}
            </h3>
          </div>
          
          <div className="sync-stats">
            <div className="stat">
              <span className="stat-value">{syncResult.summary.total_targets}</span>
              <span className="stat-label">Total Targets</span>
            </div>
            <div className="stat">
              <span className="stat-value success">{syncResult.summary.successful}</span>
              <span className="stat-label">Successful</span>
            </div>
            <div className="stat">
              <span className="stat-value error">{syncResult.summary.failed}</span>
              <span className="stat-label">Failed</span>
            </div>
          </div>
        </div>

        {/* Detailed Log Section */}
        <div className="sync-log-details">
          <h4>Sync Details</h4>
          
          {Object.entries(groupedLogs).map(([targetKey, entries]) => {
            const targetInfo = entries[0];
            const displayName = targetInfo.target_name || targetInfo.target;
            
            return (
              <div key={targetKey} className="target-group">
                <div className="target-header">
                  {getTargetIcon(targetInfo.target)}
                  <span className="target-name">
                    {targetInfo.target === 'local' ? 'Local Playlist' : `${targetInfo.target} - ${displayName}`}
                  </span>
                  <span className="entry-count">{entries.length} changes</span>
                </div>
                
                <div className="log-entries">
                  {entries.map((entry, index) => (
                    <div 
                      key={index} 
                      className={`log-entry ${getStatusClass(entry.success)}`}
                    >
                      <div className="log-icon">
                        {getActionIcon(entry.action)}
                      </div>
                      <div className="log-content">
                        <div className="log-track">{entry.track}</div>
                        <div className="log-reason">{entry.reason}</div>
                        {entry.error && (
                          <div className="log-error">Error: {entry.error}</div>
                        )}
                      </div>
                      <div className="log-action">
                        {entry.action.charAt(0).toUpperCase() + entry.action.slice(1)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          
          {syncResult.log.length === 0 && (
            <div className="no-changes">
              <p>No changes were made during this sync.</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default SyncLogModal;