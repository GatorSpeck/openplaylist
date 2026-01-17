import React, { useState } from 'react';
import {
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  CircularProgress,
} from '@mui/material';
import {
  LibraryMusic as LibraryIcon,
  Sync as SyncIcon,
  Work as WorkIcon,
} from '@mui/icons-material';
import { useJobTracker } from '../../lib/useJobTracker';

interface JobActionsMenuProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  onJobStarted?: (jobId: string, jobType: string) => void;
  selectedPlaylistId?: number;
}

const JobActionsMenu: React.FC<JobActionsMenuProps> = ({
  anchorEl,
  open,
  onClose,
  onJobStarted,
  selectedPlaylistId,
}) => {
  const {
    loading,
    startLibraryScan,
    startFullLibraryScan,
    syncPlaylist,
    error,
  } = useJobTracker();

  const [operationLoading, setOperationLoading] = useState<string | null>(null);

  const handleStartLibraryScan = async () => {
    try {
      setOperationLoading('library_scan');
      const jobId = await startLibraryScan();
      onJobStarted?.(jobId, 'library_scan');
      onClose();
    } catch (err) {
      console.error('Failed to start library scan:', err);
    } finally {
      setOperationLoading(null);
    }
  };

  const handleStartFullLibraryScan = async () => {
    try {
      setOperationLoading('full_library_scan');
      const jobId = await startFullLibraryScan();
      onJobStarted?.(jobId, 'full_library_scan');
      onClose();
    } catch (err) {
      console.error('Failed to start full library scan:', err);
    } finally {
      setOperationLoading(null);
    }
  };

  const handleSyncPlaylist = async () => {
    if (!selectedPlaylistId) return;
    
    try {
      setOperationLoading('playlist_sync');
      const jobId = await syncPlaylist(selectedPlaylistId);
      onJobStarted?.(jobId, 'playlist_sync');
      onClose();
    } catch (err) {
      console.error('Failed to start playlist sync:', err);
    } finally {
      setOperationLoading(null);
    }
  };

  const isLoading = loading || operationLoading !== null;

  return (
    <Menu
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      transformOrigin={{ horizontal: 'right', vertical: 'top' }}
      anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
    >
      <MenuItem onClick={handleStartLibraryScan} disabled={isLoading}>
        <ListItemIcon>
          {operationLoading === 'library_scan' ? (
            <CircularProgress size={20} />
          ) : (
            <LibraryIcon />
          )}
        </ListItemIcon>
        <ListItemText>Start Library Scan</ListItemText>
      </MenuItem>
      
      <MenuItem onClick={handleStartFullLibraryScan} disabled={isLoading}>
        <ListItemIcon>
          {operationLoading === 'full_library_scan' ? (
            <CircularProgress size={20} />
          ) : (
            <LibraryIcon />
          )}
        </ListItemIcon>
        <ListItemText>Start Full Library Scan</ListItemText>
      </MenuItem>

      {selectedPlaylistId && (
        <>
          <Divider />
          <MenuItem onClick={handleSyncPlaylist} disabled={isLoading}>
            <ListItemIcon>
              {operationLoading === 'playlist_sync' ? (
                <CircularProgress size={20} />
              ) : (
                <SyncIcon />
              )}
            </ListItemIcon>
            <ListItemText>Sync Playlist</ListItemText>
          </MenuItem>
        </>
      )}
    </Menu>
  );
};

export default JobActionsMenu;