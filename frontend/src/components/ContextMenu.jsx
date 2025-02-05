import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const SimilarTracksPopup = ({ x, y, tracks, onClose, onAddTrack }) => {
  return (
    <div 
      className="similar-tracks-popup"
      style={{
        position: 'fixed',
        left: x + 200,
        top: y,
        zIndex: 1000,
        background: 'white',
        color: 'black',
        padding: '1rem',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        borderRadius: '4px'
      }}
    >
      <h3>Similar Tracks</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {tracks.map((track, index) => (
          <li key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span>{track.artist} - {track.title}</span>
            <button 
              onClick={() => onAddTrack(track)}
              style={{
                marginLeft: '1rem',
                padding: '0.25rem 0.5rem',
                borderRadius: '4px',
                border: 'none',
                background: '#4CAF50',
                color: 'white',
                cursor: 'pointer'
              }}
            >
              Add
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

const ContextMenu = ({ x, y, track, onClose, onFilterByAlbum, onFilterByArtist, currentPlaylist, onAddTracks }) => {
  const [loading, setLoading] = useState(false);
  const [similarTracks, setSimilarTracks] = useState(null);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });

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
      setSimilarTracks(response.data);
      setPopupPosition({ x, y });
    } catch (error) {
      console.error('Error fetching similar tracks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTrack = (track) => {
    onAddTracks([track]);
  };

  return (
    <>
      <div className="context-menu" style={{ position: 'fixed', left: x, top: y, zIndex: 1000 }}>
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

      {similarTracks && (
        <SimilarTracksPopup
          x={popupPosition.x}
          y={popupPosition.y}
          tracks={similarTracks}
          onClose={() => setSimilarTracks(null)}
          onAddTrack={handleAddTrack}
        />
      )}
    </>
  );
};

export default ContextMenu;