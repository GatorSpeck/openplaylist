import React, { useState } from 'react';
import Modal from '../common/Modal';
import lastFMRepository from '../../repositories/LastFMRepository';
import { BiLoaderAlt } from 'react-icons/bi';
import PlaylistEntry from '../../lib/PlaylistEntry';

const MatchAlbumModal = ({ isOpen, onClose, track, initialMatches, onMatchSelect, setSnackbar }) => {
  const [searchQuery, setSearchQuery] = useState(`${track?.artist || ''} ${track?.album || track?.title || ''}`);
  const [matches, setMatches] = useState(initialMatches || []);
  const [loading, setLoading] = useState(false);

  const searchAlbums = async () => {
    try {
      setLoading(true);
      const results = await lastFMRepository.searchAlbum(searchQuery);
      if (!results || results.length === 0) {
        setSnackbar({
          open: true,
          message: "No albums found with that search query",
          severity: "warning"
        });
        return;
      }

      setMatches(results.map(album => new PlaylistEntry(album)));
    } catch (error) {
      console.error('Error searching for albums:', error);
      setSnackbar({
        open: true,
        message: `Error searching for albums: ${error.message}`,
        severity: "error"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={isOpen} onClose={onClose} title="Match Album">
      <div className="match-album-modal">
        <div className="album-info">
          <h4>Looking for album match for:</h4>
          <p className="album-title">{track.getAlbum() || 'Unknown Album'}</p>
          <p className="album-artist">by {track.getAlbumArtist() || 'Unknown Artist'}</p>
        </div>

        <div className="search-controls">
          <input 
            type="text" 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search album by title and artist" 
            className="search-input"
          />
          <button 
            className="search-button" 
            onClick={searchAlbums} 
            disabled={loading}
          >
            {loading ? <BiLoaderAlt className="spinner-icon" /> : 'Search'}
          </button>
        </div>

        <div className="album-matches">
          <h4>Select the correct album match:</h4>
          {matches.length > 0 ? (
            <div className="album-list">
              {matches.map((album, index) => (
                <div key={index} className="album-match" onClick={() => onMatchSelect(album)}>
                  <div className="album-cover">
                    {album.details.art_url ? (
                      <img src={album.details.art_url} alt={album.getAlbum()} />
                    ) : (
                      <div className="no-image">No Image</div>
                    )}
                  </div>
                  <div className="album-details">
                    <p className="album-name">{album.getAlbum()}</p>
                    <p className="album-artist">{album.getAlbumArtist()}</p>
                    {album.tracks && (
                      <p className="track-count">{album.details.tracks.length} tracks</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="no-matches">No matches found. Try adjusting your search query.</p>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default MatchAlbumModal;