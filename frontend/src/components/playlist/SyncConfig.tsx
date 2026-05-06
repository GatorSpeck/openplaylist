import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BiTrash, BiPlus } from 'react-icons/bi';
import Modal from '../common/Modal';
import playlistRepository from '../../repositories/PlaylistRepository';

// Types for our configuration
interface SyncTarget {
  id?: number;
  service: 'plex' | 'spotify' | 'youtube';
  config: {
    [key: string]: any;
  };

  enabled: boolean;

  sendEntryAdds: boolean;
  sendEntryRemovals: boolean;
  receiveEntryAdds: boolean;
  receiveEntryRemovals: boolean;
}

const serviceConfigs = {
  plex: {
    fields: [
      { name: 'playlist_name', label: 'Playlist Name', placeholder: 'name', type: 'text' },
    ],
    icon: '🎵',
    description: 'Sync with a Plex playlist'
  },
  spotify: {
    fields: [
      { name: "playlist_uri", label: "Playlist URI", placeholder: "spotify:playlist:your_playlist_id", type: "text" },
    ],
    icon: '🟢',
    description: 'Sync with a Spotify playlist'
  },
  youtube: {
    fields: [
      { name: "playlist_uri", label: "Playlist URI", placeholder: "https://www.youtube.com/playlist?list=your_playlist_id", type: "text" },
    ],
    icon: '▶️',
    description: 'Sync with a YouTube Music playlist'
  }
};

interface SyncConfigProps {
    playlistId: number;
    visible?: boolean;
    onClose?: () => void;
    onSyncResult?: (result: any) => void;
}

const SyncConfig: React.FC<SyncConfigProps> = ({ playlistId, visible, onClose, onSyncResult }) => {
  const [syncTargets, setSyncTargets] = useState<SyncTarget[]>([]);
  const [autoSyncSettings, setAutoSyncSettings] = useState({
    auto_sync_enabled: false,
    auto_sync_schedule: '0 2 * * *',
  });
  const [autoSyncSaving, setAutoSyncSaving] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentTarget, setCurrentTarget] = useState<SyncTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Load existing sync targets
  useEffect(() => {
    const fetchSyncTargets = async () => {
      try {
        setLoading(true);
        const [syncTargetsResponse, autoSyncResponse] = await Promise.all([
          axios.get(`/api/playlists/${playlistId}/syncconfig`),
          axios.get(`/api/playlists/${playlistId}/auto-sync`),
        ]);
        setSyncTargets(syncTargetsResponse.data);
        setAutoSyncSettings({
          auto_sync_enabled: autoSyncResponse.data.auto_sync_enabled || false,
          auto_sync_schedule: autoSyncResponse.data.auto_sync_schedule || '0 2 * * *',
        });
      } catch (err) {
        console.error('Error loading sync targets:', err);
        setError('Failed to load sync configuration');
      } finally {
        setLoading(false);
      }
    };

    // Only fetch if the modal is visible
    if (visible) {
      fetchSyncTargets();
    }
  }, [playlistId, visible]);

  // Handle adding a new target
  const handleAddTarget = () => {
    setCurrentTarget({
      service: 'plex',
      config: {},
      enabled: true,
      sendEntryAdds: true,
      sendEntryRemovals: true,
      receiveEntryAdds: true,
      receiveEntryRemovals: true,
    });
    setIsAddModalOpen(true);
  };

  // Handle editing an existing target
  const handleEditTarget = (target: SyncTarget) => {
    setCurrentTarget({...target});
    setIsEditModalOpen(true);
  };

  // Handle deleting a target
  const handleDeleteTarget = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this sync target?')) {
      try {
        // Fixed URL to include the playlist ID
        await axios.delete(`/api/playlists/${playlistId}/syncconfig/${id}`);
        setSyncTargets(syncTargets.filter(target => target.id !== id));
      } catch (err) {
        console.error('Error deleting sync target:', err);
        setError('Failed to delete sync target');
      }
    }
  };

  // Handle saving a target (add or edit)
  const handleSaveTarget = async () => {
    console.log('Saving target:', currentTarget);
    if (!currentTarget) return;
    
    try {
      let response;
      
      if (currentTarget.id) {
        // Fixed URL to include the playlist ID and target ID
        response = await axios.put(
          `/api/playlists/${playlistId}/syncconfig/${currentTarget.id}`,
          currentTarget
        );
        
        setSyncTargets(syncTargets.map(target => 
          target.id === currentTarget.id ? response.data : target
        ));
      } else {
        // Fixed URL to include the playlist ID
        response = await axios.post(`/api/playlists/${playlistId}/syncconfig`, currentTarget);
        setSyncTargets([...syncTargets, response.data]);
      }
      
      setIsAddModalOpen(false);
      setIsEditModalOpen(false);
      setCurrentTarget(null);
    } catch (err) {
      console.error('Error saving sync target:', err);
      setError('Failed to save sync target');
    }
  };

  // Handle toggling a target's enabled status
  const handleToggleEnabled = async (target: SyncTarget) => {
    const updatedTarget = {...target, enabled: !target.enabled};
    
    try {
      // Fixed URL to include the playlist ID
      const response = await axios.put(
        `/api/playlists/${playlistId}/syncconfig/${target.id}`,
        updatedTarget
      );
      
      setSyncTargets(syncTargets.map(t => 
        t.id === target.id ? response.data : t
      ));
    } catch (err) {
      console.error('Error updating sync target:', err);
      setError('Failed to update sync target');
    }
  };

  // Handle input changes in the modal form
  const handleInputChange = (field: string, value: string | boolean) => {
    if (!currentTarget) return;
    
    if (field === 'service') {
      setCurrentTarget({
        ...currentTarget,
        service: value as 'plex' | 'spotify' | 'youtube',
        // Reset config when changing service type
        config: {}
      });
    } else if (['sendEntryAdds', 'sendEntryRemovals', 'receiveEntryAdds', 'receiveEntryRemovals', 'enabled'].includes(field)) {
      // Handle boolean toggle fields
      setCurrentTarget({
        ...currentTarget,
        [field]: value as boolean
      });
    } else {
      // Handle config string fields
      setCurrentTarget({
        ...currentTarget,
        config: {
          ...currentTarget.config,
          [field]: value as string
        }
      });
    }
  };

  // Clear error message
  const clearError = () => setError(null);

  const handleAutoSyncToggle = async (enabled: boolean) => {
    const nextSettings = {
      ...autoSyncSettings,
      auto_sync_enabled: enabled,
      auto_sync_schedule: autoSyncSettings.auto_sync_schedule || '0 2 * * *',
    };

    setAutoSyncSaving(true);
    try {
      await axios.put(`/api/playlists/${playlistId}/auto-sync`, nextSettings);
      setAutoSyncSettings(nextSettings);
    } catch (err) {
      console.error('Error updating auto-sync setting:', err);
      setError('Failed to update auto-sync setting');
    } finally {
      setAutoSyncSaving(false);
    }
  };

  const handleSync = async (forcePush: boolean = false) => {
    // Show confirmation dialog for force push
    if (forcePush) {
      const confirmed = window.confirm(
        "⚠️ Force Push will remove ALL items from remote playlists and replace them with your local playlist.\n\n" +
        "This action cannot be undone and will overwrite any changes made directly in remote services.\n\n" +
        "Are you sure you want to continue?"
      );
      
      if (!confirmed) {
        return;
      }
    }
    
    try {
      setSyncing(true);
      const response = await playlistRepository.syncToPlex(playlistId, forcePush);
      
      if (onSyncResult) {
        onSyncResult(response);
      }
      
      // Show success message
      setError(null);
    } catch (err) {
      setError(`Sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSyncing(false);
    }
  };

  // Modal form for adding/editing a sync target
  const renderTargetForm = () => {
    if (!currentTarget) return null;
    
    const serviceConfig = serviceConfigs[currentTarget.service];
    const checkboxClass = 'h-4 w-4 rounded border border-border bg-surface text-accent focus:ring-accent dark:border-border-dark dark:bg-surface-dark';
    
    return (
      <>
        <div className="mb-4">
          <label htmlFor="service" className="mb-2 block text-sm font-medium text-text dark:text-text-dark">Service</label>
          <select 
            id="service" 
            value={currentTarget.service}
            onChange={(e) => handleInputChange('service', e.target.value)}
            className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-border-dark dark:bg-surface-dark dark:text-text-dark"
          >
            <option value="plex" className="bg-surface text-text dark:bg-surface-dark dark:text-text-dark">Plex</option>
            <option value="spotify" className="bg-surface text-text dark:bg-surface-dark dark:text-text-dark">Spotify</option>
            <option value="youtube" className="bg-surface text-text dark:bg-surface-dark dark:text-text-dark">YouTube Music</option>
          </select>
        </div>
        
        <h4 className="mb-3 mt-0 text-base font-semibold text-text dark:text-text-dark">Configuration</h4>
        
        {serviceConfig.fields.map(field => (
          <div className="mb-4" key={field.name}>
            <label htmlFor={field.name} className="mb-2 block text-sm font-medium text-text dark:text-text-dark">{field.label}</label>
            <input 
              id={field.name}
              type={field.type}
              value={currentTarget.config[field.name] || ''}
              onChange={(e) => handleInputChange(field.name, e.target.value)}
              placeholder={field.placeholder}
              className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-border-dark dark:bg-surface-dark dark:text-text-dark"
            />
          </div>
        ))}

        <div className="my-5 border-t border-border dark:border-border-dark" />

        <div className="mb-2">
          <h4 className="mb-3 text-base font-semibold text-text dark:text-text-dark">Sync Options</h4>

          <label className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-text dark:text-text-dark">
            <input
              type="checkbox"
              checked={currentTarget.enabled}
              onChange={(e) => handleInputChange('enabled', e.target.checked)}
              className={checkboxClass}
            />
            Enable Sync
          </label>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded border border-border bg-surface-subtle p-4 dark:border-border-dark dark:bg-surface-dark">
              <h5 className="mb-1 text-sm font-semibold text-text dark:text-text-dark">Local → Remote</h5>
              <p className="mb-3 text-sm text-text/70 dark:text-text-dark/70">
                Changes that will be sent from your local playlist to the remote service
              </p>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-text dark:text-text-dark">
                  <input
                    type="checkbox"
                    checked={currentTarget.sendEntryAdds}
                    onChange={(e) => handleInputChange('sendEntryAdds', e.target.checked)}
                    className={checkboxClass}
                  />
                  Send track additions
                </label>
                <label className="flex items-center gap-2 text-sm text-text dark:text-text-dark">
                  <input
                    type="checkbox"
                    checked={currentTarget.sendEntryRemovals}
                    onChange={(e) => handleInputChange('sendEntryRemovals', e.target.checked)}
                    className={checkboxClass}
                  />
                  Send track removals
                </label>
              </div>
            </div>

            <div className="rounded border border-border bg-surface-subtle p-4 dark:border-border-dark dark:bg-surface-dark">
              <h5 className="mb-1 text-sm font-semibold text-text dark:text-text-dark">Remote → Local</h5>
              <p className="mb-3 text-sm text-text/70 dark:text-text-dark/70">
                Changes that will be received from the remote service to your local playlist
              </p>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-text dark:text-text-dark">
                  <input
                    type="checkbox"
                    checked={currentTarget.receiveEntryAdds}
                    onChange={(e) => handleInputChange('receiveEntryAdds', e.target.checked)}
                    className={checkboxClass}
                  />
                  Receive track additions
                </label>
                <label className="flex items-center gap-2 text-sm text-text dark:text-text-dark">
                  <input
                    type="checkbox"
                    checked={currentTarget.receiveEntryRemovals}
                    onChange={(e) => handleInputChange('receiveEntryRemovals', e.target.checked)}
                    className={checkboxClass}
                  />
                  Receive track removals
                </label>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  };

  const renderSyncDirectionIcons = (target: SyncTarget) => {
    return (
      <div className="flex gap-2">
        <div title={`${target.sendEntryAdds ? 'Adding' : 'Not adding'} tracks to remote`}>
          <span className={`inline-flex h-6 w-6 items-center justify-center rounded text-xs font-semibold ${target.sendEntryAdds ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-surface-muted text-text/50 dark:bg-surface-dark-elevated dark:text-text-dark/50'}`}>
            ↑+
          </span>
        </div>
        
        <div title={`${target.sendEntryRemovals ? 'Removing' : 'Not removing'} tracks from remote`}>
          <span className={`inline-flex h-6 w-6 items-center justify-center rounded text-xs font-semibold ${target.sendEntryRemovals ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-surface-muted text-text/50 dark:bg-surface-dark-elevated dark:text-text-dark/50'}`}>
            ↑−
          </span>
        </div>
        
        <div title={`${target.receiveEntryAdds ? 'Receiving' : 'Not receiving'} new tracks from remote`}>
          <span className={`inline-flex h-6 w-6 items-center justify-center rounded text-xs font-semibold ${target.receiveEntryAdds ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-surface-muted text-text/50 dark:bg-surface-dark-elevated dark:text-text-dark/50'}`}>
            ↓+
          </span>
        </div>
        
        <div title={`${target.receiveEntryRemovals ? 'Removing' : 'Not removing'} local tracks when removed from remote`}>
          <span className={`inline-flex h-6 w-6 items-center justify-center rounded text-xs font-semibold ${target.receiveEntryRemovals ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-surface-muted text-text/50 dark:bg-surface-dark-elevated dark:text-text-dark/50'}`}>
            ↓−
          </span>
        </div>
      </div>
    );
  };

  return (
    <Modal
      open={visible}
      onClose={onClose}
      title="Playlist Sync Configuration"
      size="large"
    >
      <div>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-xl font-semibold text-text dark:text-text-dark">Playlist Sync Targets</h2>
          <div className="flex flex-wrap items-center gap-2">
            <button 
              className="rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-text-dark transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-dark/70 dark:disabled:bg-surface-dark-elevated" 
              onClick={() => handleSync(false)}
              disabled={syncing || syncTargets.length === 0 || !syncTargets.some(t => t.enabled)}
            >
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
            <button 
              className="rounded bg-orange-600 px-4 py-2 text-sm font-bold text-text-dark transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-dark/70 dark:disabled:bg-surface-dark-elevated" 
              onClick={() => handleSync(true)}
              disabled={syncing || syncTargets.length === 0 || !syncTargets.some(t => t.enabled)}
              title="Force Push: Remove all items from remote playlists and replace with local items"
            >
              {syncing ? 'Syncing...' : 'Force Push'}
            </button>
            <button className="inline-flex items-center gap-1 rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-text-dark transition hover:bg-emerald-700" onClick={handleAddTarget}>
              <BiPlus /> Add Sync Target
            </button>
          </div>
        </div>
        
        {error && (
          <div className="mb-4 flex items-center justify-between rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300">
            <span>{error}</span>
            <button className="ml-3 text-lg leading-none" onClick={clearError}>×</button>
          </div>
        )}

        <div className="mb-4 rounded border border-border bg-surface-subtle p-4 dark:border-border-dark dark:bg-surface-dark">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-text dark:text-text-dark">
            <input
              type="checkbox"
              checked={autoSyncSettings.auto_sync_enabled}
              onChange={(e) => handleAutoSyncToggle(e.target.checked)}
              disabled={autoSyncSaving}
              className="h-4 w-4 rounded border border-border bg-surface text-accent focus:ring-accent disabled:cursor-not-allowed dark:border-border-dark dark:bg-surface-dark"
            />
            {autoSyncSaving ? 'Saving...' : 'Enable Auto-Sync'}
          </label>
        </div>

        {loading ? (
          <div className="py-6 text-center text-sm text-text/70 dark:text-text-dark/70">Loading sync configuration...</div>
        ) : syncTargets.length === 0 ? (
          <div className="rounded border border-border bg-surface-subtle p-8 text-center text-sm text-text/75 dark:border-border-dark dark:bg-surface-dark dark:text-text-dark/75">
            <p className="m-0">No sync targets configured. Add a target to sync your playlists with external services.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {syncTargets.map(target => (
              <div key={target.id} className={`flex flex-wrap items-center gap-3 rounded border p-4 ${target.enabled ? 'border-border bg-surface dark:border-border-dark dark:bg-surface-dark-elevated' : 'border-border bg-surface-subtle opacity-75 dark:border-border-dark dark:bg-surface-dark'}`}>
                <div className="text-2xl">
                  {serviceConfigs[target.service].icon}
                </div>
                <div className="min-w-[180px] flex-1 text-sm font-semibold text-text dark:text-text-dark">
                  {target.config.playlist_name || target.config.playlist_uri || 'Unnamed Playlist'}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded bg-sky-100 px-2 py-1 text-xs font-medium text-sky-800 dark:bg-sky-900/30 dark:text-sky-300">
                    {target.service.charAt(0).toUpperCase() + target.service.slice(1)}
                  </div>
                  {renderSyncDirectionIcons(target)}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <label className="inline-flex items-center">
                    <input
                      type="checkbox"
                      checked={target.enabled}
                      onChange={() => handleToggleEnabled(target)}
                      className="h-4 w-4 rounded border border-border bg-surface text-accent focus:ring-accent dark:border-border-dark dark:bg-surface-dark"
                    />
                  </label>
                  <button className="rounded bg-sky-600 px-3 py-1.5 text-xs font-semibold text-text-dark transition hover:bg-sky-700" onClick={() => handleEditTarget(target)}>
                    Edit
                  </button>
                  <button className="inline-flex items-center rounded border border-red-500 px-2 py-1.5 text-red-600 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/30" onClick={() => handleDeleteTarget(target.id!)}>
                    <BiTrash />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {/* Add Modal */}
        <Modal
          open={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          title="Add Sync Target"
        >
          <div className="py-2">
            {renderTargetForm()}
            
            <div className="mt-6 flex justify-end gap-2">
              <button className="rounded border border-border bg-surface-subtle px-4 py-2 text-sm font-medium text-text transition hover:bg-surface-muted dark:border-border-dark dark:bg-surface-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated" onClick={() => setIsAddModalOpen(false)}>Cancel</button>
              <button 
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-text-dark transition hover:bg-emerald-700" 
                onClick={handleSaveTarget}
              >
                Add Target
              </button>
            </div>
          </div>
        </Modal>
        
        {/* Edit Modal */}
        <Modal
          open={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          title="Edit Sync Target"
        >
          <div className="py-2">
            {renderTargetForm()}
            
            <div className="mt-6 flex justify-end gap-2">
              <button className="rounded border border-border bg-surface-subtle px-4 py-2 text-sm font-medium text-text transition hover:bg-surface-muted dark:border-border-dark dark:bg-surface-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated" onClick={() => setIsEditModalOpen(false)}>Cancel</button>
              <button 
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-text-dark transition hover:bg-emerald-700" 
                onClick={handleSaveTarget}
              >
                Save Changes
              </button>
            </div>
          </div>
        </Modal>

      </div>
    </Modal>
  );
};

export default SyncConfig;