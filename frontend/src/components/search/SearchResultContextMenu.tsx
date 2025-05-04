import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import TrackDetailsModal from '../common/TrackDetailsModal';
import SimilarTracksPopup from '../common/SimilarTracksPopup';

const SearchResultContextMenu = ({ x, y, track, onClose, onFilterByAlbum, onFilterByArtist, onAddTracks, onDetails }) => {
  const [position, setPosition] = useState({ x, y });
  const [loading, setLoading] = useState(false);
  const [similarTracks, setSimilarTracks] = useState(null);
  const [showTrackDetails, setShowTrackDetails] = useState(false);
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

  const findSimilarTracks = async (e) => {
    e.stopPropagation();
    setLoading(true);
    try {
      const response = await axios.get(`/api/lastfm/similar`, {
        params: {
          artist: track.artist,
          title: track.title
        }
      });

      const search_results = response.data.map((track) => ({...track, entry_type: 'lastfm'}));

      setSimilarTracks(search_results);
      setPosition({ x, y });
    } catch (error) {
      console.error('Error fetching similar tracks:', error);
    } finally {
      setLoading(false);
    }
  };

  const addTracks = (tracks) => {
    onAddTracks(tracks);
    onClose();
  }

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
        <div onClick={findSimilarTracks}>
          {loading ? 'Loading similar tracks...' : 'Find Similar Tracks'}
        </div>
      </div>
    </>
  );
};

export default SearchResultContextMenu;