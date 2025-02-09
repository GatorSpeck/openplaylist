import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import TrackDetailsModal from '../TrackDetailsModal';

const SimilarTracksPopup = ({ x, y, tracks, onClose, onAddTracks }) => {
  const [selectedTracks, setSelectedTracks] = useState(new Set());
  const [position, setPosition] = useState({ x, y });

  useEffect(() => {
    const popup = document.querySelector('.similar-tracks-popup');
    if (!popup) return;

    const rect = popup.getBoundingClientRect();
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };

    let newY = y;
    let newX = x + 200;

    // Check vertical overflow
    if (y + rect.height > viewport.height) {
      newY = Math.max(0, viewport.height - rect.height);
    }

    // Check horizontal overflow
    if (x + 200 + rect.width > viewport.width) {
      newX = Math.max(0, x - rect.width);
    }

    setPosition({ x: newX, y: newY });
  }, [x, y]);

  const toggleTrack = (e, track) => {
    e.stopPropagation(); // Stop event from bubbling up
    setSelectedTracks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(track.url)) {
        newSet.delete(track.url);
      } else {
        newSet.add(track.url);
      }
      return newSet;
    });
  };

  const handleAddSelected = () => {
    const tracksToAdd = tracks.filter(track => selectedTracks.has(track.url));

    // for tracks that have linked music files, add as a music file instead of Last.fm
    let fixedUpTracks = tracksToAdd;
    fixedUpTracks.forEach((track) => {
      if (track.music_file_id) {
        track.entry_type = "music_file";
        track.id = track.music_file_id;

        track.path = ""; // need a dummy value here to make the backend happy
      }
    });

    onAddTracks(fixedUpTracks);
    setSelectedTracks(new Set());
    onClose();
  };

  return (
    <div className="similar-tracks-popup"
      onClick={e => e.stopPropagation()} // Stop clicks within popup from closing menu
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 1000,
        background: 'white',
        color: 'black',
        padding: '1rem',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        borderRadius: '4px',
        maxHeight: '80vh',
        overflowY: 'auto'
      }}
    >
      <h3>Similar Tracks</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {tracks.map((track) => (
          <li key={track.url} onClick={e => toggleTrack(e, track)}
            style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
            <input
              type="checkbox"
              checked={selectedTracks.has(track.url)}
              style={{ marginRight: '0.5rem' }}
              readOnly
            />
            <span>{track.artist} - {track.title}{track.music_file_id ? (<span> (in library)</span>) : null}</span>
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
        <button
          onClick={handleAddSelected}
          disabled={selectedTracks.size === 0}
          style={{
            padding: '0.5rem 1rem',
            background: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: selectedTracks.size === 0 ? 'not-allowed' : 'pointer',
            opacity: selectedTracks.size === 0 ? 0.5 : 1
          }}
        >
          Add Selected ({selectedTracks.size})
        </button>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
};

const PlaylistItemContextMenu = ({ x, y, track, onClose, onFilterByAlbum, onFilterByArtist, onAddTracks, onRemove, onRemoveByArtist, onRemoveByAlbum, onDetails }) => {
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

  const addSimilarTracks = (tracks) => {
    onAddTracks(tracks);
    setSimilarTracks(null);
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
        <div onClick={() => { onRemoveByArtist(track.artist); onClose(); }}>
          Remove by Artist: {track.artist}
        </div>
        <div onClick={() => { onRemoveByAlbum(track.album); onClose(); }}>
          Remove by Album: {track.album}
        </div>
        <div onClick={findSimilarTracks}>
          {loading ? 'Loading similar tracks...' : 'Find Similar Tracks'}
        </div>
      </div>

      {similarTracks && (
        <SimilarTracksPopup
          x={position.x}
          y={position.y}
          tracks={similarTracks}
          onClose={() => setSimilarTracks(null)}
          onAddTracks={(tracks) => addSimilarTracks(tracks)}
        />
      )}

      {showTrackDetails && (
        <TrackDetailsModal
          track={track}
          onClose={() => setShowTrackDetails(false)}
        />
      )}
    </>
  );
};

export default PlaylistItemContextMenu;