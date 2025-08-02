import React, { useState, useEffect } from 'react';
import '../../styles/TrackDetailsModal.css';
import { formatDate, formatDuration, formatSize } from '../../lib/misc';
import playlistRepository from '../../repositories/PlaylistRepository';
import libraryRepository from '../../repositories/LibraryRepository';
import PlaylistEntry from '../../lib/PlaylistEntry';

interface TrackDetailsModalProps {
  entry: PlaylistEntry;
  playlistId?: number;
  onClose: () => void;
  onEntryUpdated?: (updatedEntry: PlaylistEntry) => void;
}

const TrackDetailsModal: React.FC<TrackDetailsModalProps> = ({ 
  entry, 
  playlistId, 
  onClose, 
  onEntryUpdated 
}) => {
  const [playlists, setPlaylists] = useState([]);
  const [showLinkSection, setShowLinkSection] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [unlinkingType, setUnlinkingType] = useState(null);
  const [linkingExternal, setLinkingExternal] = useState(null);
  const [externalLinkInputs, setExternalLinkInputs] = useState({
    spotify_uri: '',
    youtube_url: '',
    last_fm_url: '',
    mbid: '',
    plex_rating_key: ''
  });
  
  if (!entry) return null;

  useEffect(() => {
    const fn = async () => {
      if (entry.entry_type !== "music_file") return;
      if (!entry.music_file_id) return;
      const result = await playlistRepository.getPlaylistsByTrack(entry.music_file_id);
      setPlaylists(result);
    }

    fn();
  }, [entry]);

  const searchForLocalFiles = async () => {
    setIsSearching(true);
    try {
      const searchQuery = `${entry.getArtist()} ${entry.getTitle()}`;
      const results = await libraryRepository.searchLibrary(searchQuery);
      setSearchResults(results || []);
    } catch (error) {
      console.error('Error searching for local files:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleLinkToLocalFile = async (localFile) => {
    if (!playlistId) {
      console.error('Cannot link without playlist ID');
      return;
    }

    try {
      // When linking to a local file only
      const linkRequest = {
        track_id: entry.id,
        updates: {
          local_path: localFile.path
        }
      };

      const response = await fetch(`/api/playlists/${playlistId}/links`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(linkRequest)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Create updated entry with local file metadata taking precedence
      const linkedEntry = new PlaylistEntry({
        ...entry,
        entry_type: 'music_file',
        music_file_id: localFile.id,
        details: {
          // Start with original entry details to preserve external sources
          ...entry.details,
          
          // Override with local file metadata (this should take precedence)
          title: localFile.title || entry.details.title,
          artist: localFile.artist || entry.details.artist,
          album: localFile.album || entry.details.album,
          album_artist: localFile.album_artist || entry.details.album_artist,
          year: localFile.year || entry.details.year,
          length: localFile.length || entry.details.length,
          publisher: localFile.publisher || entry.details.publisher,
          rating: localFile.rating || entry.details.rating,
          comments: localFile.comments || entry.details.comments,
          disc_number: localFile.disc_number || entry.details.disc_number,
          track_number: localFile.track_number || entry.details.track_number,
          genres: localFile.genres && localFile.genres.length > 0 ? localFile.genres : entry.details.genres,
          
          // Local file specific properties
          path: localFile.path,
          kind: localFile.kind,
          size: localFile.size,
          missing: localFile.missing || false,
          first_scanned: localFile.first_scanned,
          last_scanned: localFile.last_scanned,
          
          // Preserve external sources from the original entry
          last_fm_url: entry.details.last_fm_url,
          spotify_uri: entry.details.spotify_uri,
          youtube_url: entry.details.youtube_url,
          mbid: entry.details.mbid,
          plex_rating_key: entry.details.plex_rating_key
        }
      });

      if (onEntryUpdated) {
        onEntryUpdated(linkedEntry);
      }
      
      setShowLinkSection(false);
      setSearchResults([]);
      onClose();
    } catch (error) {
      console.error('Error linking to local file:', error);
      alert('Failed to link to local file. Please try again.');
    }
  };

  const handleLinkExternalSource = async (sourceType: string) => {
    if (!playlistId) {
      console.error('Cannot link without playlist ID');
      return;
    }

    const inputValue = externalLinkInputs[sourceType];
    if (!inputValue.trim()) {
      alert(`Please enter a ${sourceType} URL/URI`);
      return;
    }

    setLinkingExternal(sourceType);
    try {
      // Use the correct field names for the API
      const linkRequest = {
        track_id: entry.id,
        [sourceType]: inputValue.trim()
      };

      const response = await fetch(`/api/playlists/${playlistId}/links`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(linkRequest)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Create updated entry with the new external source
      const updatedEntry = new PlaylistEntry({
        ...entry,
        details: {
          ...entry.details,
          [sourceType]: inputValue.trim()
        }
      });

      if (onEntryUpdated) {
        onEntryUpdated(updatedEntry);
      }
      
      // Clear the input
      setExternalLinkInputs(prev => ({ ...prev, [sourceType]: '' }));
      
    } catch (error) {
      console.error(`Error linking ${sourceType}:`, error);
      alert(`Failed to link ${sourceType}. Please try again.`);
    } finally {
      setLinkingExternal(null);
    }
  };

  const handleUnlinkSource = async (sourceType: string) => {
    if (!playlistId) {
      console.error('Cannot unlink without playlist ID');
      return;
    }

    setUnlinkingType(sourceType);
    try {
      // Map frontend source types to API field names
      const fieldMapping = {
        'local': 'local_path',
        'lastfm': 'last_fm_url',
        'spotify': 'spotify_uri',
        'youtube': 'youtube_url',
        'musicbrainz': 'mbid',
        'plex': 'plex_rating_key'
      };

      const fieldName = fieldMapping[sourceType] || sourceType;
      
      // When unlinking a local file only
      const unlinkRequest = {
        track_id: entry.id,
        updates: {
          local_path: null
        }
      };

      const response = await fetch(`/api/playlists/${playlistId}/links`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(unlinkRequest)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Create updated entry without the unlinked source
      const updatedDetails = { ...entry.details };
      
      if (sourceType === 'local') {
        updatedDetails.path = null;
        updatedDetails.kind = null;
        updatedDetails.size = null;
        updatedDetails.missing = false;
        updatedDetails.first_scanned = null;
        updatedDetails.last_scanned = null;
      } else {
        // Remove the specific external source field
        const detailsFieldMapping = {
          'lastfm': 'last_fm_url',
          'spotify': 'spotify_uri',
          'youtube': 'youtube_url',
          'musicbrainz': 'mbid',
          'plex': 'plex_rating_key'
        };
        const detailsField = detailsFieldMapping[sourceType];
        if (detailsField) {
          updatedDetails[detailsField] = null;
        }
      }

      const updatedEntry = new PlaylistEntry({
        ...entry,
        entry_type: sourceType === 'local' ? 'requested' : entry.entry_type,
        music_file_id: sourceType === 'local' ? null : entry.music_file_id,
        details: updatedDetails
      });

      if (onEntryUpdated) {
        onEntryUpdated(updatedEntry);
      }
      
      onClose();
    } catch (error) {
      console.error(`Error unlinking ${sourceType}:`, error);
      alert(`Failed to unlink ${sourceType}. Please try again.`);
    } finally {
      setUnlinkingType(null);
    }
  };

  const handleExternalInputChange = (sourceType: string, value: string) => {
    setExternalLinkInputs(prev => ({
      ...prev,
      [sourceType]: value
    }));
  };

  const dateAdded = entry.date_added ? formatDate(entry.date_added, 'MMMM Do YYYY, h:mm:ss a') : null;
  const releaseDate = (entry.year || entry.details.year) ? formatDate(entry.year || entry.details.year, 'MMMM Do YYYY') : null;

  const artistAndTitle = `${entry.getArtist()} ${entry.getTitle()}`;
  const artistAndAlbum = `${entry.getArtist()} ${entry.getAlbum()}`;
  const youtubeMusicSearchLink = `https://music.youtube.com/search?q=${encodeURIComponent(artistAndTitle)}`;
  const appleMusicSearchLink = `https://music.apple.com/search?term=${encodeURIComponent(artistAndTitle)}`;
  const spotifySearchLink = `https://open.spotify.com/search/${encodeURIComponent(artistAndTitle)}`;
  const discogsSearchLink = entry.getAlbum() ? `https://www.discogs.com/search/?q=${encodeURIComponent(artistAndAlbum)}` : null;
  const rateYourMusicSearchLink = entry.getAlbum() ? `https://rateyourmusic.com/search?searchtype=a&searchterm=${encodeURIComponent(entry.getAlbum())}&searchtype=l` : null;
  const lastFmSearchLink = entry.isAlbum() ? `https://www.last.fm/search/albums?q=${encodeURIComponent(artistAndTitle)}` : `https://www.last.fm/search/tracks?q=${encodeURIComponent(artistAndTitle)}`;

  const playlistsList = playlists.length > 0 ? (
    <div>
      <p><strong>Playlists:</strong></p>
      <ul>
        {playlists.map(playlist => (
          <li key={playlist.id}><a href={`/playlist/${playlist.name}`}>{playlist.name}</a></li>
        ))}
      </ul>
    </div>
  ) : null;

  const renderExternalSourceSection = (sourceType: string, label: string, currentValue: string, placeholder: string) => {
    // Map source types to unlink source types
    const unlinkTypeMapping = {
      'last_fm_url': 'lastfm',
      'spotify_uri': 'spotify',
      'youtube_url': 'youtube',
      'mbid': 'musicbrainz',
      'plex_rating_key': 'plex'
    };
    
    const unlinkType = unlinkTypeMapping[sourceType];
    
    return (
      <div className="external-source-item" key={sourceType}>
        {currentValue ? (
          <p>
            <strong>{label}:</strong> 
            {sourceType === 'youtube_url' || sourceType === 'last_fm_url' ? (
              <a href={currentValue} target="_blank" rel="noopener noreferrer">
                {currentValue}
              </a>
            ) : (
              <span>{currentValue}</span>
            )}
            {playlistId && (
              <button 
                onClick={() => handleUnlinkSource(unlinkType)}
                disabled={unlinkingType === unlinkType}
                className="unlink-button"
              >
                {unlinkingType === unlinkType ? 'Unlinking...' : 'Unlink'}
              </button>
            )}
          </p>
        ) : (
          playlistId && (
            <div className="link-external-source">
              <p><strong>{label}:</strong> Not linked</p>
              <div className="link-input-group">
                <input
                  type="text"
                  placeholder={placeholder}
                  value={externalLinkInputs[sourceType]}
                  onChange={(e) => handleExternalInputChange(sourceType, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && externalLinkInputs[sourceType].trim()) {
                      handleLinkExternalSource(sourceType);
                    }
                  }}
                />
                <button 
                  onClick={() => handleLinkExternalSource(sourceType)}
                  disabled={linkingExternal === sourceType || !externalLinkInputs[sourceType].trim()}
                >
                  {linkingExternal === sourceType ? 'Linking...' : 'Link'}
                </button>
              </div>
            </div>
          )
        )}
      </div>
    );
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Entry Details</h2>
        <div className="track-details">
          <p><strong>ID:</strong> {entry.id}</p>
          <p><strong>Type:</strong> {entry.entry_type}</p>
          <p><strong>Title:</strong> {entry.getTitle()}</p>
          {entry.details.artist ? <p><strong>Artist:</strong> {entry.details.artist}</p> : null}
          {entry.details.album_artist ? <p><strong>Album Artist:</strong> {entry.details.album_artist}</p> : null}
          {entry.getAlbum() ? <p><strong>Album:</strong> {entry.getAlbum()}</p> : null}
          {entry.details.disc_number ? <p><strong>Disc:</strong>{entry.details.disc_number}</p> : null}
          {entry.details.track_number ? <p><strong>Track:</strong>{entry.details.track_number}</p> : null}
          {entry.details.length ? <p><strong>Length:</strong> {formatDuration(entry.details.length)}</p> : null}
          {releaseDate ? <p><strong>Release Date:</strong> {releaseDate}</p> : null}
          {entry.details.genres && entry.details.genres.length ? <p><strong>Genres:</strong> {entry.details.genres.join(", ")}</p> : null}
          
          {/* Local File Section */}
          {entry.details.path ? (
            <div className="source-section">
              <h3>Local File</h3>
              <p><strong>Path:</strong>
                {entry.details.missing ? <s>{entry.details.path}</s> : <span>{entry.details.path}</span>}
                {playlistId && (
                  <button 
                    onClick={() => handleUnlinkSource('local')}
                    disabled={unlinkingType === 'local'}
                    className="unlink-button"
                  >
                    {unlinkingType === 'local' ? 'Unlinking...' : 'Unlink'}
                  </button>
                )}
              </p>
              {entry.details.kind ? <p><strong>Kind:</strong> {entry.details.kind}</p> : null}
              {entry.details.size ? <p><strong>Size:</strong> {formatSize(entry.details.size)}</p> : null}
              {entry.details.last_scanned ? <p><strong>Last Scanned:</strong> {formatDate(entry.details.last_scanned, 'MMMM Do YYYY, h:mm:ss a')}</p> : null}
              {entry.details.first_scanned ? <p><strong>First Scanned:</strong> {formatDate(entry.details.first_scanned, 'MMMM Do YYYY, h:mm:ss a')}</p> : null}
            </div>
          ) : (
            playlistId && (
              <div className="source-section">
                <h3>Local File</h3>
                <p>Not linked to a local file</p>
                <button onClick={() => setShowLinkSection(!showLinkSection)}>
                  {showLinkSection ? 'Cancel' : 'Link to Local File'}
                </button>
                
                {showLinkSection && (
                  <div className="link-section">
                    <button onClick={searchForLocalFiles} disabled={isSearching}>
                      {isSearching ? 'Searching...' : 'Search Library'}
                    </button>
                    
                    {searchResults.length > 0 && (
                      <div className="search-results">
                        <h4>Select a local file to link:</h4>
                        {searchResults.map((result, index) => (
                          <div key={index} className="search-result-item">
                            <div>
                              <strong>{result.title || 'Unknown Title'}</strong> - {result.artist || 'Unknown Artist'}
                              <br />
                              <small>{result.path}</small>
                            </div>
                            <button onClick={() => handleLinkToLocalFile(result)}>
                              Link
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          )}

          {/* External Sources Section */}
          <div className="source-section">
            <h3>External Sources</h3>
            
            {renderExternalSourceSection(
              'last_fm_url',
              'Last.fm',
              entry.details.last_fm_url,
              'Enter Last.fm URL'
            )}
            
            {renderExternalSourceSection(
              'spotify_uri',
              'Spotify',
              entry.details.spotify_uri,
              'Enter Spotify URI (spotify:track:...)'
            )}
            
            {renderExternalSourceSection(
              'youtube_url',
              'YouTube',
              entry.details.youtube_url,
              'Enter YouTube URL'
            )}
            
            {renderExternalSourceSection(
              'mbid',
              'MusicBrainz ID',
              entry.details.mbid,
              'Enter MusicBrainz ID'
            )}
            
            {renderExternalSourceSection(
              'plex_rating_key',
              'Plex Rating Key',
              entry.details.plex_rating_key,
              'Enter Plex Rating Key'
            )}
          </div>

          {entry.details.publisher ? <p><strong>Publisher:</strong> {entry.details.publisher}</p> : null}
          {entry.details.url ? <p><strong>URL:</strong> <a href={entry.details.url}>{entry.details.url}</a></p> : null}
          {entry.details.notes ? <p><strong>Notes:</strong> {entry.details.notes}</p> : null}
          {entry.details.comments ? <p><strong>Comments:</strong> {entry.details.comments}</p> : null}
          {dateAdded ? <p><strong>Date Added to Playlist:</strong> {dateAdded}</p> : null}
          
          <div className="external-links">
            <h3>Search External Services</h3>
            <p><a href={youtubeMusicSearchLink} target="_blank" rel="noopener noreferrer">Search on YouTube Music</a></p>
            <p><a href={appleMusicSearchLink} target="_blank" rel="noopener noreferrer">Search on Apple Music</a></p>
            <p><a href={spotifySearchLink} target="_blank" rel="noopener noreferrer">Search on Spotify</a></p>
            <p><a href={lastFmSearchLink} target="_blank" rel="noopener noreferrer">Search on Last.fm</a></p>
            {discogsSearchLink ? <p><a href={discogsSearchLink} target="_blank" rel="noopener noreferrer">Search on Discogs</a></p> : null}
            {rateYourMusicSearchLink ? <p><a href={rateYourMusicSearchLink} target="_blank" rel="noopener noreferrer">Search on Rate Your Music</a></p> : null}
          </div>
          
          {playlistsList}
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default TrackDetailsModal;