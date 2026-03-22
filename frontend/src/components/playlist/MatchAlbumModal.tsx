import React, { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import lastFMRepository, { LastFMRepository } from '../../repositories/LastFMRepository';
import { BiLoaderAlt } from 'react-icons/bi';
import PlaylistEntry from '../../lib/PlaylistEntry';

const MatchAlbumModal = ({ isOpen, onClose, track, onMatchSelect, setSnackbar }) => {
  const [searchQuery, setSearchQuery] = useState(`${track.getArtist() || ''} ${track.getAlbum() || ''}`);
  const [matches, setMatches] = useState<PlaylistEntry[]>([]);
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

      const searchResults = results[0] || [];
      const infoResults = [results[1]];

      const jointResults = infoResults.concat(searchResults);

      // console.log(jointResults);

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
      <div>
        <div className="mb-4 rounded border border-border bg-surface-subtle p-3 dark:border-border-dark dark:bg-surface-dark">
          <h4 className="mb-2 mt-0 text-sm font-semibold text-text dark:text-text-dark">Looking for album match for:</h4>
          <p className="mb-1 text-sm font-semibold text-text dark:text-text-dark">{track.getAlbum() || 'Unknown Album'}</p>
          <p className="m-0 text-xs text-text/75 dark:text-text-dark/75">by {track.getAlbumArtist() || 'Unknown Artist'}</p>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <input 
            type="text" 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search album by title and artist" 
            className="min-w-[240px] flex-1 rounded border border-border bg-surface px-3 py-2 text-sm text-text outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-border-dark dark:bg-surface-dark dark:text-text-dark"
          />
          <button 
            className="inline-flex items-center justify-center rounded bg-accent px-4 py-2 text-sm font-semibold text-text-dark transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-dark/70 dark:disabled:bg-surface-dark-elevated" 
            onClick={() => searchAlbums(false)} 
            disabled={loading}
          >
            {loading ? <BiLoaderAlt className="animate-spin" /> : 'Search'}
          </button>
        </div>

        <div>
          <h4 className="mb-2 mt-0 text-sm font-semibold text-text dark:text-text-dark">Select the correct album match:</h4>
          {matches.length > 0 ? (
            <div className="max-h-[48vh] space-y-2 overflow-y-auto rounded border border-border p-2 dark:border-border-dark">
              {matches.map((album, index) => (
                <div key={index} className="flex cursor-pointer gap-3 rounded border border-border bg-surface-subtle p-2 transition hover:border-accent hover:bg-surface-muted dark:border-border-dark dark:bg-surface-dark dark:hover:bg-surface-dark-elevated" onClick={async () => {
                  // Enhance the album with detailed release date info if it has an mbid
                  // not worth doing this now, since the Last.FM route doesn't actually return the release date....
                  // const enhancedAlbums = await lastFMRepository.enhanceAlbumsWithDetailedInfo([album]);
                  onMatchSelect(album);
                }}>
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded border border-border dark:border-border-dark">
                    {album.getArtUrl() ? (
                      <img className="h-full w-full object-cover" src={album.getArtUrl()} alt={album.getAlbum()} />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[11px] text-text/70 dark:text-text-dark/70">No Image</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="mb-1 truncate text-sm font-semibold text-text dark:text-text-dark">{album.getAlbum()}</p>
                    <p className="mb-1 truncate text-xs text-text/75 dark:text-text-dark/75">{album.getAlbumArtist()}</p>
                    {album.getTracks() && album.getTracks().length > 0 && (
                      <p className="text-xs text-text/65 dark:text-text-dark/65">{album.getTracks().length} tracks</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded border border-border bg-surface-subtle px-3 py-2 text-sm text-text/75 dark:border-border-dark dark:bg-surface-dark dark:text-text-dark/75">No matches found. Try adjusting your search query.</p>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default MatchAlbumModal;