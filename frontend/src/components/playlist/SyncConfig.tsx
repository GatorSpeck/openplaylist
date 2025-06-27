import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BiTrash, BiPlus } from 'react-icons/bi';
import Modal from '../common/Modal';

// Types for our configuration
interface SyncTarget {
  id?: number;
  service: 'plex' | 'spotify' | 'youtube';
  config: {
    [key: string]: string;
  };

  enabled: boolean;

  // TODO
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
    icon: '🎵'
  },
  spotify: {
    fields: [
      { name: "playlist_uri", label: "Playlist URI", placeholder: "spotify:playlist:your_playlist_id", type: "text" },
    ],
    icon: '🟢'
  },
  youtube: {
    fields: [
      { name: "playlist_uri", label: "Playlist URI", placeholder: "https://www.youtube.com/playlist?list=your_playlist_id", type: "text" },
    ],
    icon: '▶️'
  }
};

interface SyncConfigProps {
    playlistId: number;
    visible?: boolean;
    onClose?: () => void;
}

const SyncConfig: React.FC<SyncConfigProps> = ({ playlistId, visible, onClose }) => {
  const [syncTargets, setSyncTargets] = useState<SyncTarget[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentTarget, setCurrentTarget] = useState<SyncTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load existing sync targets
  useEffect(() => {
    const fetchSyncTargets = async () => {
      try {
        setLoading(true);
        // Fixed URL to include the playlist ID
        const response = await axios.get(`/api/playlists/${playlistId}/syncconfig`);
        setSyncTargets(response.data);
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
  const handleInputChange = (field: string, value: string) => {
    if (!currentTarget) return;
    
    if (field === 'service') {
      setCurrentTarget({
        ...currentTarget,
        service: value as 'plex' | 'spotify' | 'youtube',
        // Reset config when changing service type
        config: {}
      });
    } else {
      setCurrentTarget({
        ...currentTarget,
        config: {
          ...currentTarget.config,
          [field]: value
        }
      });
    }
  };

  // Clear error message
  const clearError = () => setError(null);

  // Modal form for adding/editing a sync target
  const renderTargetForm = () => {
    if (!currentTarget) return null;
    
    const serviceConfig = serviceConfigs[currentTarget.service];
    
    return (
      <>
        <div className="form-group">
          <label htmlFor="service">Service</label>
          <select 
            id="service" 
            value={currentTarget.service}
            onChange={(e) => handleInputChange('service', e.target.value)}
          >
            <option value="plex">Plex</option>
            <option value="spotify">Spotify</option>
            <option value="youtube">YouTube Music</option>
          </select>
        </div>
        
        <h4>Configuration</h4>
        
        {serviceConfig.fields.map(field => (
          <div className="form-group" key={field.name}>
            <label htmlFor={field.name}>{field.label}</label>
            <input 
              id={field.name}
              type={field.type}
              value={currentTarget.config[field.name] || ''}
              onChange={(e) => handleInputChange(field.name, e.target.value)}
              placeholder={field.placeholder}
            />
          </div>
        ))}
      </>
    );
  };

  return (
    <Modal
      open={visible}
      onClose={onClose}
      title="Playlist Sync Configuration"
      size="large"
    >
      <div className="sync-config">
        <div className="sync-config-header">
          <h2>Playlist Sync Targets</h2>
          <button className="add-button" onClick={handleAddTarget}>
            <BiPlus /> Add Sync Target
          </button>
        </div>
        
        {error && (
          <div className="error-message">
            {error}
            <button className="dismiss-button" onClick={clearError}>×</button>
          </div>
        )}
        
        {loading ? (
          <div className="loading">Loading sync configuration...</div>
        ) : syncTargets.length === 0 ? (
          <div className="empty-state">
            <p>No sync targets configured. Add a target to sync your playlists with external services.</p>
          </div>
        ) : (
          <div className="target-list">
            {syncTargets.map(target => (
              <div key={target.id} className={`target-item ${target.enabled ? 'enabled' : 'disabled'}`}>
                <div className="target-icon">
                  {serviceConfigs[target.service].icon}
                </div>
                <div className="target-name">
                  {target.config.playlist_name || 'Unnamed Playlist'}
                </div>
                <div className="target-details">
                  <div className="target-service">
                    {target.service.charAt(0).toUpperCase() + target.service.slice(1)}
                  </div>
                </div>
                <div className="target-actions">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={target.enabled}
                      onChange={() => handleToggleEnabled(target)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                  <button className="edit-button" onClick={() => handleEditTarget(target)}>
                    Edit
                  </button>
                  <button className="delete-button" onClick={() => handleDeleteTarget(target.id!)}>
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
          <div className="sync-target-form">
            {renderTargetForm()}
            
            <div className="modal-actions">
              <button onClick={() => setIsAddModalOpen(false)}>Cancel</button>
              <button 
                className="primary-button" 
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
          <div className="sync-target-form">
            {renderTargetForm()}
            
            <div className="modal-actions">
              <button onClick={() => setIsEditModalOpen(false)}>Cancel</button>
              <button 
                className="primary-button" 
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