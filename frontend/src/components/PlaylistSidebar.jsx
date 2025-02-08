import React, { useState, useEffect, useRef } from 'react';
import '../styles/PlaylistSidebar.css';

const PlaylistContextMenu = ({ x, y, onClose, onClone, onDelete }) => (
  <div className="playlist-context-menu" style={{ left: x, top: y }}>
    <div onClick={onClone}>Clone Playlist</div>
    <div onClick={onDelete}>Delete Playlist</div>
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
  onScan,
  onFullScan,
  onPurge,
}) => {
  const [contextMenu, setContextMenu] = useState({ 
    visible: false, 
    x: 0, 
    y: 0,
    playlist: null 
  });

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

  return (
    <>
      <button ref={hamburgerRef} className="hamburger-menu" onClick={() => onClose(!isOpen)}>
        ☰
      </button>
      <div ref={sidebarRef} className={`playlist-sidebar ${isOpen ? 'open' : ''}`}>
        <div className="playlist-sidebar-content">
          <h2>Playlists</h2>
          <button onClick={onNewPlaylist}>New Playlist</button>
          <div className="playlist-list">
            {playlists.map((playlist) => (
              <div
                key={playlist.id}
                className={`playlist-item ${selectedPlaylist?.id === playlist.id ? 'selected' : ''}`}
                onClick={() => onPlaylistSelect(playlist.id)}
                onContextMenu={(e) => handleContextMenu(e, playlist)}
              >
                {playlist.name}
              </div>
            ))}
          </div>
          
          <div className="admin-actions">
            <hr />
            <button onClick={onScan}>Quick Scan</button>
            <button onClick={onFullScan}>Full Scan</button>
            <button onClick={onPurge}>Purge Data</button>
          </div>
        </div>
      </div>
      {contextMenu.visible && (
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
        />
      )}
    </>
  );
};

export default PlaylistSidebar;