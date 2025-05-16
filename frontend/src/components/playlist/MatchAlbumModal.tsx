import React, { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import lastFMRepository, { LastFMRepository } from '../../repositories/LastFMRepository';
import { BiLoaderAlt } from 'react-icons/bi';
import PlaylistEntry from '../../lib/PlaylistEntry';

const MatchAlbumModal = ({ isOpen, onClose, track, onMatchSelect, setSnackbar }) => {
  const [searchQuery, setSearchQuery] = useState(`${track.getArtist() || ''} ${track.getAlbum() || ''}`);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);

  const searchAlbums = async (includeTrack) => {
    try {
      setLoading(true);

      let promises = [
        lastFMRepository.searchAlbum(track.getAlbum(), track.getAlbumArtist()),
      ];

      if (includeTrack) {
        promises.push(lastFMRepository.getAlbumInfo(track.getAlbum(), track.getAlbumArtist()));
      }

      const results = await Promise.all(promises);
      console.log(results);

      const searchResults = results[0] || [];
      const infoResults = [results[1]];

      const jointResults = infoResults.concat(searchResults);

      if (!jointResults || results.length === 0) {
        setSnackbar({
          open: true,
          message: "No albums found with that search query",
          severity: "warning"
        });
        return;
      }

      setMatches(jointResults.map(album => new PlaylistEntry(album)));
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

  useEffect(() => {
    if (isOpen) {
      searchAlbums(true);
    }
  }, [isOpen, track]);

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
            onClick={() => searchAlbums(false)} 
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
                    {album.details.tracks && (
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