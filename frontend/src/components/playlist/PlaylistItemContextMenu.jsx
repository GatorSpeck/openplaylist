import React, { useState, useEffect, useCallback, useRef } from 'react';
import TrackDetailsModal from '../TrackDetailsModal';
import openAIRepository from '../../repositories/OpenAIRepository';
import lastFMRepository from '../../repositories/LastFMRepository';
import libraryRepository from '../../repositories/LibraryRepository';
import { FaNapster } from 'react-icons/fa';

const PlaylistItemContextMenu = ({ x, y, track, onClose, onFilterByAlbum, onFilterByArtist, onAddTracks, onRemove, onRemoveByArtist, onRemoveByAlbum, onDetails }) => {
  
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuRef.current) return;

    const rect = menuRef.current.getBoundingClientRect();
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };

    let newY = y;
    let newX = x;

    // Check vertical overflow
    if (y + rect.height > viewport.height) {
      newY = Math.max(0, viewport.height - rect.height);
    }

    // Check horizontal overflow
    if (x + rect.width > viewport.width) {
      newX = Math.max(0, viewport.width - rect.width);
    }

    setPosition({ x: newX, y: newY });
  }, [x, y]);

  return (
    <>
      <div 
        ref={menuRef}
        className="context-menu" 
        style={{ position: 'fixed', left: position.x, top: position.y, zIndex: 1000 }}
      >
        <div onClick={(() => { setShowTrackDetails(true); onClose(); })}>Details</div>
        <div onClick={() => { onRemove(); onClose(); }}>Remove from Playlist</div>
        <div onClick={() => { onFilterByAlbum(track.album); onClose(); }}>
          Filter by Album: {track.album}
        </div>
        <div onClick={() => { onFilterByArtist(track.artist); onClose(); }}>
          Filter by Artist: {track.artist}
        </div>
        <div onClick={() => { onRemoveByArtist(track.artist); onClose(); }}>
          Remove by Artist: {track.artist}
        </div>
        <div onClick={() => { onRemoveByAlbum(track.album); onClose(); }}>
          Remove by Album: {track.album}
        </div>
        <div onClick={findSimilarTracks}>
          {loading ? 'Loading similar tracks...' : 'Find Similar Tracks'}
        </div>
        <div onClick={findSimilarTracksWithOpenAI}>
          {openAILoading ? 'Loading similar tracks...' : 'Find Similar Tracks using OpenAI'}
        </div>
      </div>
    </>
  );
};

export default PlaylistItemContextMenu;