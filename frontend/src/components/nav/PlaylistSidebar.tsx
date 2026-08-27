import React, { useState, useEffect, useRef } from 'react';
import RenameDialog from './RenameDialog';
import SettingsModal from './SettingsModal'; 
import ImportPlaylistModal from './ImportPlaylistModal'; // Add this import

const PlaylistContextMenu = ({ x, y, onClose, onClone, onDelete, onExport, onRenamePlaylist, onSyncToPlex, pinned, onTogglePin, onShowSyncOptions, onToggleAutoSync, autoSyncEnabled }) => (
  <div
    className="fixed z-[1004] min-w-48 overflow-hidden rounded border border-border bg-surface py-1 text-sm text-text shadow-sm dark:border-border-dark dark:bg-surface-dark-elevated dark:text-text-dark"
    style={{ left: x, top: y }}
  >
    <div className="cursor-pointer px-4 py-2 hover:bg-surface-subtle dark:hover:bg-surface-dark" onClick={onTogglePin}>{pinned ? 'Unpin Playlist' : 'Pin Playlist'}</div>
    <div className="cursor-pointer px-4 py-2 hover:bg-surface-subtle dark:hover:bg-surface-dark" onClick={onRenamePlaylist}>Rename Playlist</div>
    <div className="cursor-pointer px-4 py-2 hover:bg-surface-subtle dark:hover:bg-surface-dark" onClick={onClone}>Clone Playlist</div>
    <div className="cursor-pointer px-4 py-2 hover:bg-surface-subtle dark:hover:bg-surface-dark" onClick={onDelete}>Delete Playlist</div>
    <div className="cursor-pointer px-4 py-2 hover:bg-surface-subtle dark:hover:bg-surface-dark" onClick={onExport}>Export Playlist</div>
    <div className="cursor-pointer px-4 py-2 hover:bg-surface-subtle dark:hover:bg-surface-dark" onClick={onSyncToPlex}>Sync to Plex</div>
    {onShowSyncOptions && <div className="cursor-pointer px-4 py-2 hover:bg-surface-subtle dark:hover:bg-surface-dark" onClick={onShowSyncOptions}>Sync Options</div>}
    {onToggleAutoSync && <div className="cursor-pointer px-4 py-2 hover:bg-surface-subtle dark:hover:bg-surface-dark" onClick={onToggleAutoSync}>{autoSyncEnabled ? 'Disable Auto-Sync' : 'Enable Auto-Sync'}</div>}
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
  onToggleAutoSync
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
  const [filter, setFilter] = useState('');

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

  const filteredPlaylists = playlists.filter((playlist) =>
    playlist.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <>
      <button
        ref={hamburgerRef}
        className="fixed left-4 top-4 z-[1002] rounded border border-border bg-surface px-3 py-2 text-xl leading-none text-text shadow-sm transition hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent/30 dark:border-border-dark dark:bg-surface-dark-elevated dark:text-text-dark dark:hover:bg-surface-dark-elevated"
        onClick={() => onClose(!isOpen)}
      >
        ☰
      </button>
      {isOpen && (
        <div
          className="fixed inset-0 z-[1000] bg-text/35 backdrop-blur-[1px] dark:bg-text-dark/20"
          onClick={() => onClose(false)}
          aria-hidden="true"
        />
      )}
      <div
        ref={sidebarRef}
        className={`fixed inset-y-0 left-0 z-[1001] h-screen w-[300px] max-w-[86vw] transform bg-surface text-text shadow-xl transition-transform duration-300 ease-in-out dark:bg-surface-dark-elevated dark:text-text-dark ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-full flex-col overflow-hidden">
          <div className="shrink-0 px-4 pt-4">
            <h2 className="mb-3 text-xl font-semibold tracking-tight">OpenPlaylist</h2>
            <div className="mb-4 flex gap-2">
              <button
                onClick={onNewPlaylist}
                className="rounded border border-border bg-surface-subtle px-3 py-2 text-sm font-semibold text-text transition hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent/25 dark:border-border-dark dark:bg-surface-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated"
              >
                New Playlist
              </button>
              <button
                onClick={() => setImportModalOpen(true)}
                className="rounded border border-border bg-surface-subtle px-3 py-2 text-sm font-semibold text-text transition hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent/25 dark:border-border-dark dark:bg-surface-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated"
              >
                Import
              </button>
            </div>
            <div className="mb-2">
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter playlists..."
                className="w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-border-dark dark:bg-surface-dark dark:text-text-dark"
              />
            </div>
            <div className="mb-2 flex items-center justify-between px-1 text-xs text-text/60 dark:text-text-dark/60">
              <span>Playlists</span>
              <span>{filter ? `${filteredPlaylists.length} / ${playlists.length}` : playlists.length}</span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4">
            <div className="space-y-1.5">
            {filteredPlaylists.length === 0 ? (
              <div className="px-2 py-4 text-center text-sm text-text/60 dark:text-text-dark/60">
                No playlists match "{filter}"
              </div>
            ) : filteredPlaylists
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
                  className={`cursor-pointer rounded border px-2.5 py-2 text-sm transition ${
                    selectedPlaylist?.id === playlist.id
                      ? 'border-accent/60 bg-accent/15 font-semibold text-text dark:border-accent/60 dark:bg-accent/25 dark:text-text-dark'
                      : 'border-border bg-surface hover:bg-surface-muted dark:border-border-dark dark:bg-surface-dark dark:hover:bg-surface-dark-elevated'
                  }`}
                  onClick={() => handlePlaylistClick(playlist.id)}
                  onContextMenu={(e) => handleContextMenu(e, playlist)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {playlist.pinned && <span className="mr-1">📌</span>}
                      {playlist.name}
                    </span>
                    {!playlist.enabled && (
                      <span className="shrink-0 rounded border border-border px-1 py-0.5 text-[10px] text-text/60 dark:border-border-dark dark:text-text-dark/60">
                        Off
                      </span>
                    )}
                  </div>
                  {playlist.updated_at && (
                    <div className="mt-0.5 text-[11px] text-text/50 dark:text-text-dark/50">
                      Updated {new Date(playlist.updated_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          
          {/* Settings pinned at bottom */}
          <div className="shrink-0 border-t border-border px-4 pb-4 pt-3 dark:border-border-dark">
            <button
              onClick={() => setSettingsOpen(true)}
              className="w-full rounded border border-accent/40 bg-accent px-3 py-2 text-sm font-semibold text-text-dark shadow-sm transition hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/40 dark:border-accent/50 dark:bg-accent dark:text-text-dark dark:hover:bg-accent/90"
            >
              Open Settings
            </button>
          </div>
        </div>
      </div>

      {contextMenu.visible && (
        <div className="fixed z-[1003]" 
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
            onToggleAutoSync={onToggleAutoSync ? () => {
              onToggleAutoSync(contextMenu.playlist.id);
              setContextMenu({ visible: false });
            } : null}
            autoSyncEnabled={Boolean(contextMenu.playlist.auto_sync_enabled)}
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
    </>
  );
};

export default PlaylistSidebar;