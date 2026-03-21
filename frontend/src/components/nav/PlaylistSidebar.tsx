import React, { useState, useEffect, useRef } from 'react';
import RenameDialog from './RenameDialog';
import SettingsModal from './SettingsModal'; 
import ImportPlaylistModal from './ImportPlaylistModal'; // Add this import
import PlaylistAutoSyncDialog from '../playlist/PlaylistAutoSyncDialog';

const PlaylistContextMenu = ({ x, y, onClose, onClone, onDelete, onExport, onRenamePlaylist, onSyncToPlex, pinned, onTogglePin, onShowSyncOptions, onShowAutoSync }) => (
  <div
    className="fixed z-[1001] min-w-48 overflow-hidden rounded border border-black/10 bg-surface py-1 text-sm text-text shadow-sm dark:border-white/20 dark:bg-surface-dark-elevated dark:text-text-dark"
    style={{ left: x, top: y }}
  >
    <div className="cursor-pointer px-4 py-2 hover:bg-surface-subtle dark:hover:bg-surface-dark" onClick={onTogglePin}>{pinned ? 'Unpin Playlist' : 'Pin Playlist'}</div>
    <div className="cursor-pointer px-4 py-2 hover:bg-surface-subtle dark:hover:bg-surface-dark" onClick={onRenamePlaylist}>Rename Playlist</div>
    <div className="cursor-pointer px-4 py-2 hover:bg-surface-subtle dark:hover:bg-surface-dark" onClick={onClone}>Clone Playlist</div>
    <div className="cursor-pointer px-4 py-2 hover:bg-surface-subtle dark:hover:bg-surface-dark" onClick={onDelete}>Delete Playlist</div>
    <div className="cursor-pointer px-4 py-2 hover:bg-surface-subtle dark:hover:bg-surface-dark" onClick={onExport}>Export Playlist</div>
    <div className="cursor-pointer px-4 py-2 hover:bg-surface-subtle dark:hover:bg-surface-dark" onClick={onSyncToPlex}>Sync to Plex</div>
    {onShowSyncOptions && <div className="cursor-pointer px-4 py-2 hover:bg-surface-subtle dark:hover:bg-surface-dark" onClick={onShowSyncOptions}>Sync Options</div>}
    {onShowAutoSync && <div className="cursor-pointer px-4 py-2 hover:bg-surface-subtle dark:hover:bg-surface-dark" onClick={onShowAutoSync}>Auto-Sync Settings</div>}
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
      <button
        ref={hamburgerRef}
        className="fixed left-4 top-4 z-[1002] rounded border border-black/10 bg-surface px-3 py-2 text-xl leading-none text-text shadow-sm transition hover:bg-surface-subtle dark:border-white/20 dark:bg-surface-dark-elevated dark:text-text-dark dark:hover:bg-surface-dark"
        onClick={() => onClose(!isOpen)}
      >
        ☰
      </button>
      {isOpen && (
        <div
          className="fixed inset-0 z-[1000] bg-black/35 backdrop-blur-[1px]"
          onClick={() => onClose(false)}
          aria-hidden="true"
        />
      )}
      <div
        ref={sidebarRef}
        className={`fixed inset-y-0 left-0 z-[1001] w-[300px] max-w-[86vw] transform bg-surface text-text shadow-xl transition-transform duration-300 ease-in-out dark:bg-surface-dark-elevated dark:text-text-dark ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-full flex-col overflow-y-auto p-4">
          <h2 className="mb-4 text-xl font-semibold">OpenPlaylist</h2>
          <div className="mb-4 flex gap-2">
            <button
              onClick={onNewPlaylist}
              className="rounded border border-black/15 bg-surface-subtle px-3 py-2 text-sm font-medium transition hover:bg-surface-muted dark:border-white/20 dark:bg-surface-dark dark:hover:bg-surface-dark-elevated"
            >
              New Playlist
            </button>
            <button
              onClick={() => setImportModalOpen(true)}
              className="rounded border border-black/15 bg-surface-subtle px-3 py-2 text-sm font-medium transition hover:bg-surface-muted dark:border-white/20 dark:bg-surface-dark dark:hover:bg-surface-dark-elevated"
            >
              Import
            </button>
          </div>
          <div className="space-y-1">
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
                  className={`cursor-pointer rounded px-2 py-2 text-sm transition ${selectedPlaylist?.id === playlist.id ? 'bg-surface-subtle font-medium dark:bg-surface-dark' : 'hover:bg-surface-subtle dark:hover:bg-surface-dark'}`}
                  onClick={() => handlePlaylistClick(playlist.id)}
                  onContextMenu={(e) => handleContextMenu(e, playlist)}
                >
                  {playlist.pinned && <span className="mr-1">📌</span>}
                  {playlist.name}
                </div>
              ))}
          </div>
          
          {/* Add settings section at bottom of sidebar */}
          <div className="mt-auto border-t border-black/10 pt-4 dark:border-white/20">
            <button
              onClick={() => setSettingsOpen(true)}
              className="w-full rounded border border-black/15 bg-surface-subtle px-3 py-2 text-sm font-medium transition hover:bg-surface-muted dark:border-white/20 dark:bg-surface-dark dark:hover:bg-surface-dark-elevated"
            >
              Settings
            </button>
          </div>
        </div>
      </div>

      {contextMenu.visible && (
        <div className="fixed z-[1000]" 
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