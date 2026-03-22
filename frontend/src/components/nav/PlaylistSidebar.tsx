import React, { useState, useEffect, useRef } from 'react';
import '../../styles/PlaylistSidebar.css';
import RenameDialog from './RenameDialog';
import SettingsModal from './SettingsModal'; 
import ImportPlaylistModal from './ImportPlaylistModal'; // Add this import
import PlaylistAutoSyncDialog from '../playlist/PlaylistAutoSyncDialog';
import playlistRepository from '../../repositories/PlaylistRepository';

const PlaylistContextMenu = ({ x, y, onClose, onClone, onDelete, onExport, onRenamePlaylist, onSyncToPlex, pinned, onTogglePin, onShowSyncOptions, onShowAutoSync }) => (
  <div className="playlist-context-menu" style={{ left: x, top: y }}>
    <div onClick={onTogglePin}>{pinned ? 'Unpin Playlist' : 'Pin Playlist'}</div>
    <div onClick={onRenamePlaylist}>Rename Playlist</div>
    <div onClick={onClone}>Clone Playlist</div>
    <div onClick={onDelete}>Delete Playlist</div>
    <div onClick={onExport}>Export Playlist</div>
    <div onClick={onSyncToPlex}>Sync to Plex</div>
    {onShowSyncOptions && <div onClick={onShowSyncOptions}>Sync Options</div>}
    {onShowAutoSync && <div onClick={onShowAutoSync}>Auto-Sync Settings</div>}
  </div>
);

const PlaylistSidebar = ({ 
  isOpen, 
  onClose, 
  playlists, 
  selectedPlaylist, 
  onPlaylistSelect, 
  onNewPlaylist,
  onClonePlaylist,
  onDeletePlaylist,
  onExport,
  onSyncToPlex,
  onRenamePlaylist,
  togglePin,
  reorderPinnedPlaylist,
  onShowSyncOptions,
  onShowAutoSync
}) => {
  const [contextMenu, setContextMenu] = useState({ 
    visible: false, 
    x: 0, 
    y: 0,
    playlist: null 
  });

  const [renameDialog, setRenameDialog] = useState({ open: false, playlist: null });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [autoSyncDialog, setAutoSyncDialog] = useState({ open: false, playlistId: null, playlistName: '' });

  const sidebarRef = useRef(null);
  const hamburgerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isOpen && 
          sidebarRef.current && 
          hamburgerRef.current &&
          !sidebarRef.current.contains(event.target) &&
          !hamburgerRef.current.contains(event.target)) {
        onClose(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu({ visible: false });
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleContextMenu = (e, playlist) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      playlist
    });
  };

  const handleRename = (newName) => {
    onRenamePlaylist(renameDialog.playlist.id, newName);
    setRenameDialog({ open: false, playlist: null });
  };

  const handlePlaylistClick = (id) => {
    if (selectedPlaylist?.id === id) {
      onPlaylistSelect(null); // Deselect and return to root
    } else {
      onPlaylistSelect(id);
    }
  };

  const handlePlaylistImported = (importedPlaylist) => {
    // Refresh the playlists list after import
    window.location.reload(); // Simple approach; could be more elegant with proper state management
  };

  return (
    <>
      <button ref={hamburgerRef} className="hamburger-menu" onClick={() => onClose(!isOpen)}>
        ☰
      </button>
      <div ref={sidebarRef} className={`playlist-sidebar ${isOpen ? 'open' : ''}`}>
        <div className="playlist-sidebar-content">
          <h2>OpenPlaylist</h2>
          <div className="playlist-actions">
            <button onClick={onNewPlaylist}>New Playlist</button>
            <button onClick={() => setImportModalOpen(true)}>Import</button>
          </div>
          <div className="playlist-list">
            {playlists
              .sort((a, b) => {
                // First sort by pinned status
                if (a.pinned && !b.pinned) return -1;
                if (!a.pinned && b.pinned) return 1;
                
                // If both are pinned, sort by pinned_order
                if (a.pinned && b.pinned) {
                  return a.pinned_order - b.pinned_order;
                }
                
                // Otherwise sort by updated_at timestamp (newest first)
                const dateA = a.updated_at ? new Date(a.updated_at) : new Date(0);
                const dateB = b.updated_at ? new Date(b.updated_at) : new Date(0);
                return dateB - dateA;
              })
              .map((playlist, index) => (
                <div
                  key={index} // Using playlist ID instead of index for a more stable key
                  className={`playlist-item ${selectedPlaylist?.id === playlist.id ? 'selected' : ''}`}
                  onClick={() => handlePlaylistClick(playlist.id)}
                  onContextMenu={(e) => handleContextMenu(e, playlist)}
                >
                  {playlist.pinned && <span className="pinned-indicator">📌 </span>}
                  {playlist.name}
                </div>
              ))}
          </div>
          
          {/* Add settings section at bottom of sidebar */}
          <div className="admin-actions">
            <button onClick={() => setSettingsOpen(true)}>
              Settings
            </button>
          </div>
        </div>
      </div>

      {contextMenu.visible && (
        <div className="context-menu" 
          style={{
            display: contextMenu.visible ? 'block' : 'none',
            left: contextMenu.x,
            top: contextMenu.y
          }}>
          <PlaylistContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={() => setContextMenu({ visible: false })}
            onClone={() => {
              onClonePlaylist(contextMenu.playlist.id);
              setContextMenu({ visible: false });
            }}
            onDelete={() => {
              onDeletePlaylist(contextMenu.playlist.id);
              setContextMenu({ visible: false });
            }}
            onExport={() => {
              onExport(contextMenu.playlist.id);
              setContextMenu({ visible: false });
            }}
            onSyncToPlex={() => {
              onSyncToPlex(contextMenu.playlist.id);
              setContextMenu({ visible: false });
            }}
            onRenamePlaylist={() => {
              setRenameDialog({ open: true, playlist: contextMenu.playlist });
              setContextMenu({ visible: false });
            }}
            onTogglePin={() => {
              togglePin(contextMenu.playlist.id);
              setContextMenu({ visible: false });
            }}
            pinned={contextMenu.playlist.pinned}
            onShowSyncOptions={onShowSyncOptions ? () => {
              onShowSyncOptions(contextMenu.playlist.id);
              setContextMenu({ visible: false });
            } : null}
            onShowAutoSync={onShowAutoSync ? () => {
              onShowAutoSync(contextMenu.playlist.id, contextMenu.playlist.name);
              setContextMenu({ visible: false });
            } : (() => {
              setAutoSyncDialog({ 
                open: true, 
                playlistId: contextMenu.playlist.id, 
                playlistName: contextMenu.playlist.name 
              });
              setContextMenu({ visible: false });
            })}
          />
        </div>
      )}
      
      <RenameDialog
        open={renameDialog.open}
        onClose={() => setRenameDialog({ open: false, playlist: null })}
        onConfirm={handleRename}
        initialName={renameDialog.playlist?.name || ''}
      />
      
      <ImportPlaylistModal 
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onPlaylistImported={handlePlaylistImported}
      />
      
      <SettingsModal 
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      <PlaylistAutoSyncDialog
        open={autoSyncDialog.open}
        onClose={() => setAutoSyncDialog({ open: false, playlistId: null, playlistName: '' })}
        playlistId={autoSyncDialog.playlistId}
        playlistName={autoSyncDialog.playlistName}
      />
    </>
  );
};

export default PlaylistSidebar;