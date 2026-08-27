import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { formatDate, formatDuration, formatSize } from '../../lib/misc';
import playlistRepository from '../../repositories/PlaylistRepository';
import libraryRepository from '../../repositories/LibraryRepository';
import PlaylistEntry from '../../lib/PlaylistEntry';
import { LastFMRepository } from '../../repositories/LastFMRepository';
import { plexRepository, PlexSearchResult } from '../../repositories/PlexRepository';
import { youtubeRepository, YouTubeSearchResult } from '../../repositories/YouTubeRepository';

interface TrackDetailsModalProps {
  entry: PlaylistEntry;
  playlistId?: number;
  onClose: () => void;
  onEntryUpdated?: (updatedEntry: PlaylistEntry) => void;
}

const TrackDetailsModal: React.FC<TrackDetailsModalProps> = ({ 
  entry: entryProp, 
  playlistId, 
  onClose, 
  onEntryUpdated 
}) => {
  // Use local state for entry so we can update it immediately without waiting for parent
  const [entry, setEntry] = useState(entryProp);
  
  // Update local entry state when prop changes
  useEffect(() => {
    setEntry(entryProp);
  }, [entryProp]);
  
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
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(() => entry.notes || entry.details?.notes || '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [customSearchQuery, setCustomSearchQuery] = useState(() => `${entry.getArtist()} ${entry.getTitle()}`.trim());
  const [hasSearched, setHasSearched] = useState(false);
  const [lastFmSearchResults, setLastFmSearchResults] = useState([]);
  const [isSearchingLastFm, setIsSearchingLastFm] = useState(false);
  const [showLastFmSearch, setShowLastFmSearch] = useState(false);
  const [plexSearchResults, setPlexSearchResults] = useState<PlexSearchResult[]>([]);
  const [isSearchingPlex, setIsSearchingPlex] = useState(false);
  const [showPlexSearch, setShowPlexSearch] = useState(false);
  const [plexSearchQuery, setPlexSearchQuery] = useState(() => `${entry.getArtist()} ${entry.getTitle()}`.trim());
  const [plexSearchFields, setPlexSearchFields] = useState({
    title: entry.getTitle() || '',
    artist: entry.getArtist() || '',
    album: entry.getAlbum() || ''
  });
  const [youtubeSearchResults, setYoutubeSearchResults] = useState<YouTubeSearchResult[]>([]);
  const [isSearchingYoutube, setIsSearchingYoutube] = useState(false);
  const [showYoutubeSearch, setShowYoutubeSearch] = useState(false);
  const [youtubeSearchFields, setYoutubeSearchFields] = useState({
    title: entry.getTitle() || '',
    artist: entry.getArtist() || '',
    album: entry.getAlbum() || ''
  });
  const [showFullSizeArt, setShowFullSizeArt] = useState(false);
  const [modalAlbumArt, setModalAlbumArt] = useState(null);
  
  if (!entry) return null;

  const lastFMRepository = new LastFMRepository();

  // Fetch album art for the modal if not already available
  useEffect(() => {
    const fetchModalAlbumArt = async () => {
      if (entry.details.art_url) {
        setModalAlbumArt(entry.details.art_url);
        return;
      }
      
      if (entry.image_url) {
        setModalAlbumArt(entry.image_url);
        return;
      }
      
      const url = await lastFMRepository.fetchAlbumArt(entry.getAlbumArtist(), entry.details.album);
      if (url) {
        setModalAlbumArt(url.image_url);
      }
    };

    fetchModalAlbumArt();
  }, [entry]);

  useEffect(() => {
    const fn = async () => {
      if (entry.entry_type !== "music_file") return;
      if (!entry.music_file_id) return;
      const result = await playlistRepository.getPlaylistsByTrack(entry.music_file_id);
      setPlaylists(result);
    }

    fn();
  }, [entry]);

  useEffect(() => {
    setNotesValue(entry.notes || entry.details?.notes || '');
  }, [entry.notes, entry.details?.notes]);

  const searchForLocalFiles = async (searchQuery?: string) => {
    setIsSearching(true);
    setHasSearched(true);
    try {
      const queryToUse = searchQuery || customSearchQuery || `${entry.getArtist()} ${entry.getTitle()}`;
      const results = await libraryRepository.searchLibrary(queryToUse);
      setSearchResults(results || []);
    } catch (error) {
      console.error('Error searching for local files:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchQueryChange = (newQuery: string) => {
    setCustomSearchQuery(newQuery);
    // Reset results when query changes
    if (hasSearched) {
      setSearchResults([]);
      setHasSearched(false);
    }
  };

  const handleSearchKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && customSearchQuery.trim()) {
      searchForLocalFiles(customSearchQuery.trim());
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
        updates: {
          [sourceType]: inputValue.trim()
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

      // Create updated entry with the new external source
      const updatedEntry = new PlaylistEntry({
        ...entry,
        details: {
          ...entry.details,
          updates: {
            [sourceType]: inputValue.trim()
          }
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
      
      // Create the unlink request with the correct field
      const unlinkRequest = {
        track_id: entry.id,
        updates: {
          [fieldName]: null  // Use the correct field name, not just local_path
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
      
      // Update local entry state immediately for UI responsiveness
      setEntry(updatedEntry);
      
      // Clear external link input if this was an external source
      if (sourceType !== 'local') {
        const inputFieldMapping = {
          'lastfm': 'last_fm_url',
          'spotify': 'spotify_uri', 
          'youtube': 'youtube_url',
          'musicbrainz': 'mbid',
          'plex': 'plex_rating_key'
        };
        const inputField = inputFieldMapping[sourceType];
        if (inputField) {
          setExternalLinkInputs(prev => ({ 
            ...prev, 
            [inputField]: '' 
          }));
        }
      }
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

  const handleSearchLastFm = async () => {
    setIsSearchingLastFm(true);
    try {
      let results = [];
      const title = entry.getTitle();
      const artist = entry.getArtist();
      
      if (entry.isAlbum()) {
        // Search for albums
        results = await lastFMRepository.searchAlbum(title, artist);
      } else {
        // Search for tracks
        results = await lastFMRepository.searchTrack(title, artist);
      }
      
      setLastFmSearchResults(results || []);
      setShowLastFmSearch(true);
    } catch (error) {
      console.error('Error searching Last.fm:', error);
      alert('Failed to search Last.fm. Please try again.');
    } finally {
      setIsSearchingLastFm(false);
    }
  };

  const handleSelectLastFmResult = async (result: PlaylistEntry) => {
    if (!playlistId) {
      console.error('Cannot link without playlist ID');
      return;
    }

    const lastFmUrl = result.details.last_fm_url;
    if (!lastFmUrl) {
      alert('Selected result does not have a Last.fm URL');
      return;
    }

    setLinkingExternal('last_fm_url');
    
    try {
      // Build the update request with both Last.fm URL and metadata
      const updates = {
        last_fm_url: lastFmUrl
      };
      
      // Add other metadata if available from the Last.fm result
      if (result.details.art_url) {
        updates.art_url = result.details.art_url;
      }
      if (result.details.mbid) {
        updates.mbid = result.details.mbid;
      }

      const linkRequest = {
        track_id: entry.id,
        updates: updates
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

      // Create updated entry with new metadata from Last.fm result
      const updatedEntry = new PlaylistEntry({
        ...entry,
        details: {
          ...entry.details,
          last_fm_url: lastFmUrl,
          art_url: result.details.art_url || entry.details.art_url,
          mbid: result.details.mbid || entry.details.mbid,
          // Update other metadata if the result has better/more complete info
          ...(result.getTitle() && { title: result.getTitle() }),
          ...(result.getArtist() && { artist: result.getArtist() }),
          ...(result.getAlbum() && { album: result.getAlbum() })
        }
      });

      if (onEntryUpdated) {
        onEntryUpdated(updatedEntry);
      }
      
      // Close search results and modal
      setShowLastFmSearch(false);
      setLastFmSearchResults([]);
      setLinkingExternal(null);
      
    } catch (error) {
      console.error('Error linking Last.fm result:', error);
      alert('Failed to link Last.fm result. Please try again.');
      setLinkingExternal(null);
    }
  };

  const handleSearchPlex = async () => {
    setIsSearchingPlex(true);
    try {
      // Build query from individual fields, fallback to combined query
      let query = '';
      if (plexSearchFields.title && plexSearchFields.artist) {
        query = `${plexSearchFields.artist} ${plexSearchFields.title}`;
      } else if (plexSearchFields.title) {
        query = plexSearchFields.title;
      } else if (plexSearchFields.artist) {
        query = plexSearchFields.artist;
      } else {
        query = plexSearchQuery.trim() || `${entry.getArtist()} ${entry.getTitle()}`.trim();
      }
      
      const results = await plexRepository.searchTracks(
        query, 
        plexSearchFields.title, 
        plexSearchFields.artist, 
        plexSearchFields.album
      );
      
      setPlexSearchResults(results || []);
      setShowPlexSearch(true);
    } catch (error) {
      console.error('Error searching Plex:', error);
      alert('Failed to search Plex. Please try again.');
    } finally {
      setIsSearchingPlex(false);
    }
  };

  const handleSelectPlexResult = async (result: PlexSearchResult) => {
    if (!playlistId) {
      console.error('Cannot link without playlist ID');
      return;
    }

    const plexRatingKey = result.plex_rating_key;
    if (!plexRatingKey) {
      alert('Selected result does not have a Plex rating key');
      return;
    }

    setLinkingExternal('plex_rating_key');
    
    try {
      const linkRequest = {
        track_id: entry.id,
        updates: {
          plex_rating_key: plexRatingKey
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

      // Create updated entry with the new Plex rating key
      const updatedEntry = new PlaylistEntry({
        ...entry,
        details: {
          ...entry.details,
          plex_rating_key: plexRatingKey
        }
      });

      if (onEntryUpdated) {
        onEntryUpdated(updatedEntry);
      }
      
      // Update local entry state immediately for UI responsiveness
      setEntry(updatedEntry);
      
      // Close search results but keep the main modal open
      setShowPlexSearch(false);
      setPlexSearchResults([]);
      setLinkingExternal(null);
      
      // Clear the manual input field since it's now linked
      setExternalLinkInputs(prev => ({ 
        ...prev, 
        plex_rating_key: '' 
      }));
      
    } catch (error) {
      console.error('Error linking Plex result:', error);
      alert('Failed to link Plex result. Please try again.');
      setLinkingExternal(null);
    }
  };

  const handleSearchYoutube = async () => {
    setIsSearchingYoutube(true);
    try {
      let query = '';
      if (youtubeSearchFields.title && youtubeSearchFields.artist) {
        query = `${youtubeSearchFields.artist} ${youtubeSearchFields.title}`;
      } else if (youtubeSearchFields.title) {
        query = youtubeSearchFields.title;
      } else if (youtubeSearchFields.artist) {
        query = youtubeSearchFields.artist;
      } else {
        query = `${entry.getArtist()} ${entry.getTitle()}`.trim();
      }

      const results = await youtubeRepository.searchTracks(
        query,
        youtubeSearchFields.title,
        youtubeSearchFields.artist,
        youtubeSearchFields.album
      );

      setYoutubeSearchResults(results || []);
      setShowYoutubeSearch(true);
    } catch (error) {
      console.error('Error searching YouTube Music:', error);
      alert('Failed to search YouTube Music. Please try again.');
    } finally {
      setIsSearchingYoutube(false);
    }
  };

  const handleSelectYoutubeResult = async (result: YouTubeSearchResult) => {
    if (!playlistId) {
      console.error('Cannot link without playlist ID');
      return;
    }

    const youtubeVideoId = result.youtube_url;
    if (!youtubeVideoId) {
      alert('Selected result does not have a YouTube video ID');
      return;
    }

    setLinkingExternal('youtube_url');

    try {
      const linkRequest = {
        track_id: entry.id,
        updates: {
          youtube_url: youtubeVideoId
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

      const updatedEntry = new PlaylistEntry({
        ...entry,
        details: {
          ...entry.details,
          youtube_url: youtubeVideoId
        }
      });

      if (onEntryUpdated) {
        onEntryUpdated(updatedEntry);
      }

      setEntry(updatedEntry);
      setShowYoutubeSearch(false);
      setYoutubeSearchResults([]);
      setExternalLinkInputs(prev => ({
        ...prev,
        youtube_url: ''
      }));
      setLinkingExternal(null);
    } catch (error) {
      console.error('Error linking YouTube Music result:', error);
      alert('Failed to link YouTube Music result. Please try again.');
      setLinkingExternal(null);
    }
  };

  const handleSaveNotes = async () => {
    if (!playlistId) {
      console.error('Cannot save notes without playlist ID');
      return;
    }

    const trimmedNotes = notesValue.trim() || null;

    // Optimistically update the entry immediately
    const updatedEntry = new PlaylistEntry({
      ...entry,
      notes: trimmedNotes,
      details: {
        ...entry.details,
        notes: trimmedNotes
      }
    });

    // Update the UI immediately
    if (onEntryUpdated) {
      onEntryUpdated(updatedEntry);
    }

    // Close the editing state immediately
    setEditingNotes(false);

    // Now save to backend in the background
    setSavingNotes(true);
    try {
      const updateRequest = {
        track_id: entry.id,
        updates: {
          notes: trimmedNotes
        }
      };

      const response = await fetch(`/api/playlists/${playlistId}/update-entry`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateRequest)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Success - the optimistic update was correct
      console.log('Notes saved successfully');

    } catch (error) {
      console.error('Error saving notes:', error);
      
      // Revert the optimistic update on error
      const revertedEntry = new PlaylistEntry({
        ...entry,
        notes: entry.notes, // Revert to original notes
        details: {
          ...entry.details,
          notes: entry.notes
        }
      });

      if (onEntryUpdated) {
        onEntryUpdated(revertedEntry);
      }
      
      // Reopen the editor with the current value
      setNotesValue(entry.notes || entry.details?.notes || '');
      setEditingNotes(true);
      
      alert('Failed to save notes. Please try again.');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleCancelNotes = () => {
    // Reset to the current entry's notes (from the updated entry prop)
    setNotesValue(entry.notes || entry.details?.notes || '');
    setEditingNotes(false);
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
    const isLastFm = sourceType === 'last_fm_url';
    const isPlex = sourceType === 'plex_rating_key';
    const isYoutube = sourceType === 'youtube_url';
    
    return (
      <div className="external-source-item" key={sourceType}>
        {currentValue ? (
          <p>
            <strong>{label}:</strong> 
            {sourceType === 'youtube_url' || sourceType === 'last_fm_url' || sourceType === 'spotify_uri'  ? (
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
                  className="link-input-group_input text-text placeholder:text-text/60 dark:text-text-dark dark:placeholder:text-text-dark/60"
                  onChange={(e) => handleExternalInputChange(sourceType, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && externalLinkInputs[sourceType].trim()) {
                      handleLinkExternalSource(sourceType);
                    }
                  }}
                />
                <button 
                  className="link-input-group_button"
                  onClick={() => handleLinkExternalSource(sourceType)}
                  disabled={linkingExternal === sourceType || !externalLinkInputs[sourceType].trim()}
                >
                  {linkingExternal === sourceType ? 'Linking...' : 'Link'}
                </button>
                {isLastFm && (
                  <button 
                    onClick={handleSearchLastFm}
                    disabled={isSearchingLastFm}
                    className="search-button"
                  >
                    {isSearchingLastFm ? 'Searching...' : 'Search Last.fm'}
                  </button>
                )}
                {isPlex && (
                  <button 
                    onClick={handleSearchPlex}
                    disabled={isSearchingPlex}
                    className="search-button"
                  >
                    {isSearchingPlex ? 'Searching...' : 'Search Plex'}
                  </button>
                )}
                {isYoutube && (
                  <button
                    onClick={handleSearchYoutube}
                    disabled={isSearchingYoutube}
                    className="search-button"
                  >
                    {isSearchingYoutube ? 'Searching...' : 'Search YouTube Music'}
                  </button>
                )}
              </div>
              
              {/* Last.fm Search Results */}
              {isLastFm && showLastFmSearch && (
                <div className="lastfm-search-results">
                  <div className="search-header">
                    <h4>Last.fm Search Results:</h4>
                    <button 
                      onClick={() => setShowLastFmSearch(false)}
                      className="close-search-button"
                    >
                      ×
                    </button>
                  </div>
                  
                  {lastFmSearchResults.length > 0 ? (
                    <div className="search-results-list">
                      {lastFmSearchResults.map((result, index) => (
                        <div key={index} className="search-result-item">
                          <div className="result-content">
                            {result.details.art_url && (
                              <img 
                                src={result.details.art_url} 
                                alt="Album art" 
                                className="result-thumbnail"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            )}
                            <div className="result-info">
                              <strong>{result.getTitle()}</strong>
                              {result.getArtist() && <><br /><em>by {result.getArtist()}</em></>}
                              {result.getAlbum() && <><br /><span>Album: {result.getAlbum()}</span></>}
                              {result.details.last_fm_url && (
                                <><br /><a href={result.details.last_fm_url} target="_blank" rel="noopener noreferrer" className="lastfm-link">View on Last.fm</a></>
                              )}
                            </div>
                          </div>
                          <button 
                            onClick={() => handleSelectLastFmResult(result)}
                            className="select-button"
                            disabled={linkingExternal === 'last_fm_url'}
                          >
                            {linkingExternal === 'last_fm_url' ? 'Linking...' : 'Select'}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="no-results">No results found. Try searching with different terms or enter the URL manually.</p>
                  )}
                </div>
              )}
              
              {/* Plex Search Results */}
              {isPlex && showPlexSearch && (
                <div className="plex-search-results">
                  <div className="search-header">
                    <h4>Plex Search Results:</h4>
                    <button 
                      onClick={() => setShowPlexSearch(false)}
                      className="close-search-button"
                    >
                      ×
                    </button>
                  </div>
                  
                  <div className="search-fields-group">
                    <div className="search-field">
                      <label htmlFor="plex-search-title">Title:</label>
                      <input
                        id="plex-search-title"
                        type="text"
                        value={plexSearchFields.title}
                        onChange={(e) => setPlexSearchFields(prev => ({ ...prev, title: e.target.value }))}
                        placeholder="Enter track title..."
                        className="search-input placeholder:text-text/60 dark:placeholder:text-text-dark/60"
                      />
                    </div>
                    
                    <div className="search-field">
                      <label htmlFor="plex-search-artist">Artist:</label>
                      <input
                        id="plex-search-artist"
                        type="text"
                        value={plexSearchFields.artist}
                        onChange={(e) => setPlexSearchFields(prev => ({ ...prev, artist: e.target.value }))}
                        placeholder="Enter artist name..."
                        className="search-input placeholder:text-text/60 dark:placeholder:text-text-dark/60"
                      />
                    </div>
                    
                    <div className="search-field">
                      <label htmlFor="plex-search-album">Album:</label>
                      <input
                        id="plex-search-album"
                        type="text"
                        value={plexSearchFields.album}
                        onChange={(e) => setPlexSearchFields(prev => ({ ...prev, album: e.target.value }))}
                        placeholder="Enter album name..."
                        className="search-input placeholder:text-text/60 dark:placeholder:text-text-dark/60"
                      />
                    </div>
                    
                    <div className="search-actions">
                      <button 
                        onClick={handleSearchPlex} 
                        disabled={isSearchingPlex || (!plexSearchFields.title && !plexSearchFields.artist)}
                        className="search-button"
                      >
                        {isSearchingPlex ? 'Searching...' : 'Search Plex'}
                      </button>
                    </div>
                  </div>
                  
                  {plexSearchResults.length > 0 ? (
                    <div className="search-results-list">
                      {plexSearchResults.map((result, index) => (
                        <div key={index} className="search-result-item">
                          <div className="result-content">
                            <div className="result-info">
                              <strong>{result.title}</strong>
                              {result.artist && <><br /><em>by {result.artist}</em></>}
                              {result.album && <><br /><span>Album: {result.album}</span></>}
                              <br /><small>Rating Key: {result.plex_rating_key}</small>
                            </div>
                          </div>
                          <button 
                            onClick={() => handleSelectPlexResult(result)}
                            className="select-button"
                            disabled={linkingExternal === 'plex_rating_key'}
                          >
                            {linkingExternal === 'plex_rating_key' ? 'Linking...' : 'Select'}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    plexSearchResults.length === 0 && !isSearchingPlex && (
                      <p className="no-results">No results found. Try searching with different terms or enter the rating key manually.</p>
                    )
                  )}
                </div>
              )}

              {/* YouTube Music Search Results */}
              {isYoutube && showYoutubeSearch && (
                <div className="lastfm-search-results">
                  <div className="search-header">
                    <h4>YouTube Music Search Results:</h4>
                    <button
                      onClick={() => setShowYoutubeSearch(false)}
                      className="close-search-button"
                    >
                      ×
                    </button>
                  </div>

                  <div className="search-fields-group">
                    <div className="search-field">
                      <label htmlFor="youtube-search-title">Title:</label>
                      <input
                        id="youtube-search-title"
                        type="text"
                        value={youtubeSearchFields.title}
                        onChange={(e) => setYoutubeSearchFields(prev => ({ ...prev, title: e.target.value }))}
                        placeholder="Enter track title..."
                        className="search-input placeholder:text-text/60 dark:placeholder:text-text-dark/60"
                      />
                    </div>

                    <div className="search-field">
                      <label htmlFor="youtube-search-artist">Artist:</label>
                      <input
                        id="youtube-search-artist"
                        type="text"
                        value={youtubeSearchFields.artist}
                        onChange={(e) => setYoutubeSearchFields(prev => ({ ...prev, artist: e.target.value }))}
                        placeholder="Enter artist name..."
                        className="search-input placeholder:text-text/60 dark:placeholder:text-text-dark/60"
                      />
                    </div>

                    <div className="search-field">
                      <label htmlFor="youtube-search-album">Album:</label>
                      <input
                        id="youtube-search-album"
                        type="text"
                        value={youtubeSearchFields.album}
                        onChange={(e) => setYoutubeSearchFields(prev => ({ ...prev, album: e.target.value }))}
                        placeholder="Enter album name..."
                        className="search-input placeholder:text-text/60 dark:placeholder:text-text-dark/60"
                      />
                    </div>

                    <div className="search-actions">
                      <button
                        onClick={handleSearchYoutube}
                        disabled={isSearchingYoutube || (!youtubeSearchFields.title && !youtubeSearchFields.artist)}
                        className="search-button"
                      >
                        {isSearchingYoutube ? 'Searching...' : 'Search YouTube Music'}
                      </button>
                    </div>
                  </div>

                  {youtubeSearchResults.length > 0 ? (
                    <div className="search-results-list">
                      {youtubeSearchResults.map((result, index) => (
                        <div key={index} className="search-result-item">
                          <div className="result-content">
                            <div className="result-info">
                              <strong>{result.title}</strong>
                              {result.artist && <><br /><em>by {result.artist}</em></>}
                              {result.album && <><br /><span>Album: {result.album}</span></>}
                              {result.youtube_url && (
                                <>
                                  <br />
                                  <a
                                    href={`https://www.youtube.com/watch?v=${result.youtube_url}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="lastfm-link"
                                  >
                                    View on YouTube
                                  </a>
                                </>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => handleSelectYoutubeResult(result)}
                            className="select-button"
                            disabled={linkingExternal === 'youtube_url'}
                          >
                            {linkingExternal === 'youtube_url' ? 'Linking...' : 'Select'}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    youtubeSearchResults.length === 0 && !isSearchingYoutube && (
                      <p className="no-results">No results found. Try searching with different terms or enter the URL manually.</p>
                    )
                  )}
                </div>
              )}
            </div>
          )
        )}
      </div>
    );
  };

  let spotifyUrlToUse = entry.details.spotify_uri || '';
  if (spotifyUrlToUse.length) {
    const components = spotifyUrlToUse.split(":");
    spotifyUrlToUse = `https://open.spotify.com/track/${components[components.length - 1]}`;
  }

  let youtubeUrlToUse = entry.details.youtube_url || '';
  if (youtubeUrlToUse.length) {
    youtubeUrlToUse = `https://www.youtube.com/watch?v=${youtubeUrlToUse}`;
  }

  const handleBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const modalMarkup = (
    <div
      data-track-details-modal="backdrop"
      className="z-[5000] flex items-center justify-center overflow-y-auto bg-surface-muted0 px-4 py-6"
      style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 }}
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        data-track-details-modal="content"
        className="my-4 w-[min(700px,calc(100vw-2rem))] max-h-[calc(100vh-3rem)] overflow-y-auto rounded border border-border bg-surface p-5 text-text shadow-lg dark:border-border-dark dark:bg-surface-dark-elevated dark:text-text-dark [&_.track-details]:mx-auto [&_.track-details]:max-w-[640px] [&_.track-details]:space-y-2 [&_.track-details>p]:text-center [&_.album-art-section]:flex [&_.album-art-section]:justify-center [&_.album-art-thumbnail]:block [&_.album-art-thumbnail]:mx-auto [&_.source-section]:my-4 [&_.source-section]:rounded-md [&_.source-section]:border [&_.source-section]:border-border [&_.source-section]:bg-surface-subtle [&_.source-section]:p-3 dark:[&_.source-section]:border-border-dark dark:[&_.source-section]:bg-surface-dark [&_.link-section]:mt-3 [&_.link-section]:rounded-md [&_.link-section]:border [&_.link-section]:border-border [&_.link-section]:bg-surface [&_.link-section]:p-3 dark:[&_.link-section]:border-border-dark dark:[&_.link-section]:bg-surface-dark-elevated [&_.external-source-item]:rounded-md [&_.external-source-item]:border [&_.external-source-item]:border-border [&_.external-source-item]:bg-surface [&_.external-source-item]:p-2 [&_.external-source-item]:my-2 dark:[&_.external-source-item]:border-border-dark dark:[&_.external-source-item]:bg-surface-dark-elevated [&_.search-input-group]:flex [&_.search-input-group]:flex-col [&_.search-input-group]:gap-2 [&_.search-fields-group]:space-y-2 [&_.search-field]:space-y-1 [&_.search-input]:w-full [&_.search-input]:rounded [&_.search-input]:border [&_.search-input]:border-border [&_.search-input]:bg-surface [&_.search-input]:px-3 [&_.search-input]:py-2 [&_.search-input]:text-sm [&_.search-input]:text-text dark:[&_.search-input]:border-border-dark dark:[&_.search-input]:bg-surface-dark dark:[&_.search-input]:text-text-dark [&_.search-actions]:mt-2 [&_.search-actions]:flex [&_.search-actions]:justify-end [&_.search-button]:rounded [&_.search-button]:bg-accent [&_.search-button]:px-3 [&_.search-button]:py-1.5 [&_.search-button]:text-xs [&_.search-button]:font-semibold [&_.search-button]:text-text-dark [&_.search-button]:transition hover:[&_.search-button]:bg-accent-hover disabled:[&_.search-button]:cursor-not-allowed disabled:[&_.search-button]:bg-surface-muted dark:disabled:[&_.search-button]:bg-surface-dark-elevated [&_.link-input-group]:mt-2 [&_.link-input-group]:flex [&_.link-input-group]:flex-wrap [&_.link-input-group]:gap-2 [&_.link-input-group_input]:min-w-[180px] [&_.link-input-group_input]:flex-1 [&_.link-input-group_input]:rounded [&_.link-input-group_input]:border [&_.link-input-group_input]:border-border [&_.link-input-group_input]:bg-surface [&_.link-input-group_input]:px-3 [&_.link-input-group_input]:py-2 [&_.link-input-group_input]:text-sm dark:[&_.link-input-group_input]:border-border-dark dark:[&_.link-input-group_input]:bg-surface-dark [&_.link-input-group_button]:rounded [&_.link-input-group_button]:border [&_.link-input-group_button]:border-border [&_.link-input-group_button]:bg-surface-subtle [&_.link-input-group_button]:px-3 [&_.link-input-group_button]:py-1.5 [&_.link-input-group_button]:text-xs [&_.link-input-group_button]:font-medium [&_.link-input-group_button]:text-text [&_.link-input-group_button]:transition hover:[&_.link-input-group_button]:bg-surface-muted dark:[&_.link-input-group_button]:border-border-dark dark:[&_.link-input-group_button]:bg-surface-dark dark:[&_.link-input-group_button]:text-text-dark dark:hover:[&_.link-input-group_button]:bg-surface-dark-elevated [&_.unlink-button]:ml-2 [&_.unlink-button]:rounded [&_.unlink-button]:border [&_.unlink-button]:border-red-500 [&_.unlink-button]:px-2 [&_.unlink-button]:py-1 [&_.unlink-button]:text-xs [&_.unlink-button]:font-medium [&_.unlink-button]:text-red-600 [&_.unlink-button]:transition hover:[&_.unlink-button]:bg-red-50 dark:[&_.unlink-button]:text-red-300 dark:hover:[&_.unlink-button]:bg-red-900/20 [&_.lastfm-search-results]:mt-3 [&_.lastfm-search-results]:rounded-md [&_.lastfm-search-results]:border [&_.lastfm-search-results]:border-border [&_.lastfm-search-results]:bg-surface-subtle [&_.lastfm-search-results]:p-3 dark:[&_.lastfm-search-results]:border-border-dark dark:[&_.lastfm-search-results]:bg-surface-dark [&_.plex-search-results]:mt-3 [&_.plex-search-results]:rounded-md [&_.plex-search-results]:border [&_.plex-search-results]:border-border [&_.plex-search-results]:bg-surface-subtle [&_.plex-search-results]:p-3 dark:[&_.plex-search-results]:border-border-dark dark:[&_.plex-search-results]:bg-surface-dark [&_.search-header]:mb-2 [&_.search-header]:flex [&_.search-header]:items-center [&_.search-header]:justify-between [&_.search-header_h4]:m-0 [&_.search-header_h4]:text-sm [&_.search-header_h4]:font-semibold [&_.close-search-button]:inline-flex [&_.close-search-button]:h-6 [&_.close-search-button]:w-6 [&_.close-search-button]:items-center [&_.close-search-button]:justify-center [&_.close-search-button]:rounded-full [&_.close-search-button]:bg-red-600 [&_.close-search-button]:text-text-dark [&_.close-search-button]:transition hover:[&_.close-search-button]:bg-red-700 [&_.search-results-list]:max-h-[280px] [&_.search-results-list]:space-y-2 [&_.search-results-list]:overflow-y-auto [&_.search-result-item]:flex [&_.search-result-item]:items-start [&_.search-result-item]:gap-2 [&_.search-result-item]:rounded [&_.search-result-item]:border [&_.search-result-item]:border-border [&_.search-result-item]:bg-surface [&_.search-result-item]:p-2 dark:[&_.search-result-item]:border-border-dark dark:[&_.search-result-item]:bg-surface-dark-elevated [&_.result-content]:flex [&_.result-content]:min-w-0 [&_.result-content]:flex-1 [&_.result-content]:items-start [&_.result-content]:gap-2 [&_.result-thumbnail]:h-14 [&_.result-thumbnail]:w-14 [&_.result-thumbnail]:rounded [&_.result-thumbnail]:object-cover [&_.result-info]:min-w-0 [&_.result-info]:text-sm [&_.result-info]:text-text dark:[&_.result-info]:text-text-dark [&_.result-info_em]:text-xs [&_.result-info_em]:text-text/70 dark:[&_.result-info_em]:text-text-dark/70 [&_.select-button]:rounded [&_.select-button]:bg-emerald-600 [&_.select-button]:px-3 [&_.select-button]:py-1.5 [&_.select-button]:text-xs [&_.select-button]:font-semibold [&_.select-button]:text-text-dark [&_.select-button]:transition hover:[&_.select-button]:bg-emerald-700 disabled:[&_.select-button]:cursor-not-allowed disabled:[&_.select-button]:bg-surface-muted dark:disabled:[&_.select-button]:bg-surface-dark-elevated [&_.lastfm-link]:font-medium [&_.lastfm-link]:underline [&_.lastfm-link]:decoration-text/35 [&_.lastfm-link]:underline-offset-2 [&_.lastfm-link]:text-text/90 hover:[&_.lastfm-link]:text-text dark:[&_.lastfm-link]:decoration-text-dark/40 dark:[&_.lastfm-link]:text-text-dark/90 dark:hover:[&_.lastfm-link]:text-text-dark [&_.track-details_a]:font-medium [&_.track-details_a]:underline [&_.track-details_a]:decoration-text/35 [&_.track-details_a]:underline-offset-2 [&_.track-details_a]:text-text/90 hover:[&_.track-details_a]:text-text dark:[&_.track-details_a]:decoration-text-dark/40 dark:[&_.track-details_a]:text-text-dark/90 dark:hover:[&_.track-details_a]:text-text-dark [&_.no-results]:rounded [&_.no-results]:border [&_.no-results]:border-border [&_.no-results]:bg-surface [&_.no-results]:px-3 [&_.no-results]:py-2 [&_.no-results]:text-sm [&_.no-results]:text-text/75 dark:[&_.no-results]:border-border-dark dark:[&_.no-results]:bg-surface-dark dark:[&_.no-results]:text-text-dark/75 [&_.search-results]:space-y-2 [&_.no-results-message]:rounded [&_.no-results-message]:border [&_.no-results-message]:border-amber-300 [&_.no-results-message]:bg-amber-50 [&_.no-results-message]:p-3 dark:[&_.no-results-message]:border-amber-700 dark:[&_.no-results-message]:bg-amber-900/30 [&_.no-results-message_p]:m-0 [&_.no-results-message_p]:mb-2 [&_.no-results-message_p]:font-semibold [&_.no-results-message_p]:text-amber-900 dark:[&_.no-results-message_p]:text-amber-200 [&_.no-results-message_ul]:m-0 [&_.no-results-message_ul]:list-disc [&_.no-results-message_ul]:pl-5 [&_.no-results-message_ul]:text-amber-900 dark:[&_.no-results-message_ul]:text-amber-200 [&_.external-links_h3]:mb-2 [&_.external-links_h3]:mt-2 [&_.external-links_h3]:text-sm [&_.external-links_h3]:font-semibold [&_.external-links]:rounded-md [&_.external-links]:border [&_.external-links]:border-border [&_.external-links]:bg-surface-subtle [&_.external-links]:p-3 dark:[&_.external-links]:border-border-dark dark:[&_.external-links]:bg-surface-dark [&_.external-links_a]:font-medium [&_.external-links_a]:underline [&_.external-links_a]:decoration-text/35 [&_.external-links_a]:underline-offset-2 [&_.external-links_a]:text-text/90 hover:[&_.external-links_a]:text-text dark:[&_.external-links_a]:decoration-text-dark/40 dark:[&_.external-links_a]:text-text-dark/90 dark:hover:[&_.external-links_a]:text-text-dark [&_.notes-section]:rounded-md [&_.notes-section]:border [&_.notes-section]:border-border [&_.notes-section]:bg-surface-subtle [&_.notes-section]:p-3 dark:[&_.notes-section]:border-border-dark dark:[&_.notes-section]:bg-surface-dark [&_.notes-header]:mb-2 [&_.notes-header]:flex [&_.notes-header]:items-center [&_.notes-header]:justify-between [&_.edit-notes-button]:rounded [&_.edit-notes-button]:bg-accent [&_.edit-notes-button]:px-2.5 [&_.edit-notes-button]:py-1 [&_.edit-notes-button]:text-xs [&_.edit-notes-button]:font-semibold [&_.edit-notes-button]:text-text-dark [&_.notes-editor]:space-y-2 [&_.notes-textarea]:w-full [&_.notes-textarea]:rounded [&_.notes-textarea]:border [&_.notes-textarea]:border-border [&_.notes-textarea]:bg-surface [&_.notes-textarea]:px-3 [&_.notes-textarea]:py-2 [&_.notes-textarea]:text-sm [&_.notes-textarea]:text-text dark:[&_.notes-textarea]:border-border-dark dark:[&_.notes-textarea]:bg-surface-dark dark:[&_.notes-textarea]:text-text-dark [&_.notes-actions]:flex [&_.notes-actions]:justify-end [&_.notes-actions]:gap-2 [&_.save-button]:rounded [&_.save-button]:bg-emerald-600 [&_.save-button]:px-3 [&_.save-button]:py-1.5 [&_.save-button]:text-xs [&_.save-button]:font-semibold [&_.save-button]:text-text-dark hover:[&_.save-button]:bg-emerald-700 [&_.cancel-button]:rounded [&_.cancel-button]:border [&_.cancel-button]:border-border [&_.cancel-button]:bg-surface-subtle [&_.cancel-button]:px-3 [&_.cancel-button]:py-1.5 [&_.cancel-button]:text-xs [&_.cancel-button]:font-medium [&_.cancel-button]:text-text hover:[&_.cancel-button]:bg-surface-muted dark:[&_.cancel-button]:border-border-dark dark:[&_.cancel-button]:bg-surface-dark dark:[&_.cancel-button]:text-text-dark dark:hover:[&_.cancel-button]:bg-surface-dark-elevated [&_.saving-indicator]:text-xs [&_.saving-indicator]:italic [&_.saving-indicator]:text-text/70 dark:[&_.saving-indicator]:text-text-dark/70 [&_.notes-text]:m-0 [&_.notes-text]:whitespace-pre-wrap [&_.no-notes]:m-0 [&_.no-notes]:italic [&_.no-notes]:text-text/70 dark:[&_.no-notes]:text-text-dark/70 [&_.detail-row]:rounded [&_.detail-row]:bg-surface-subtle [&_.detail-row]:px-2 [&_.detail-row]:py-1 dark:[&_.detail-row]:bg-surface-dark dark:[&_h3]:text-text-dark dark:[&_h4]:text-text-dark dark:[&_label]:text-text-dark dark:[&_small]:text-text-dark/80 dark:[&_li]:text-text-dark dark:[&_p]:text-text-dark"
        onClick={e => e.stopPropagation()}
      >
        <h2>Entry Details</h2>
        <div className="track-details">
          {/* Album Art Display */}
          {modalAlbumArt && (
            <div className="album-art-section">
              <img 
                src={modalAlbumArt}
                alt="Album artwork"
                className="album-art-thumbnail"
                onClick={() => setShowFullSizeArt(true)}
                style={{
                  width: '120px',
                  height: '120px',
                  objectFit: 'cover',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  marginBottom: '16px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
                title="Click to view full size"
              />
            </div>
          )}
          
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
                <button className="rounded border border-border bg-surface-subtle px-3 py-1.5 text-xs font-medium text-text transition hover:bg-surface-muted dark:border-border-dark dark:bg-surface-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated" onClick={() => setShowLinkSection(!showLinkSection)}>
                  {showLinkSection ? 'Cancel' : 'Link to Local File'}
                </button>
                
                {showLinkSection && (
                  <div className="link-section">
                    <div className="search-input-group">
                      <label htmlFor="search-query">Search Query:</label>
                      <input
                        id="search-query"
                        type="text"
                        value={customSearchQuery}
                        onChange={(e) => handleSearchQueryChange(e.target.value)}
                        onKeyDown={handleSearchKeyPress}
                        placeholder="Enter artist and/or track name..."
                        className="search-input placeholder:text-text/60 dark:placeholder:text-text-dark/60"
                      />
                      <button 
                        onClick={() => searchForLocalFiles()} 
                        disabled={isSearching || !customSearchQuery.trim()}
                        className="search-button"
                      >
                        {isSearching ? 'Searching...' : 'Search Library'}
                      </button>
                    </div>
                    
                    {hasSearched && searchResults.length === 0 && !isSearching && (
                      <div className="no-results-message">
                        <p>No local files found for "{customSearchQuery}". Try:</p>
                        <ul>
                          <li>Searching for just the artist name</li>
                          <li>Searching for just the track title</li>
                          <li>Using partial words or different spellings</li>
                          <li>Removing special characters or punctuation</li>
                        </ul>
                      </div>
                    )}
                    
                    {searchResults.length > 0 && (
                      <div className="search-results">
                        <h4>Select a local file to link:</h4>
                        {searchResults.map((result, index) => (
                          <div key={index} className="search-result-item">
                            <div>
                              <strong>{result.title || 'Unknown Title'}</strong> - {result.artist || 'Unknown Artist'}
                              {result.album && <><br /><em>Album: {result.album}</em></>}
                              <br />
                              <small>{result.path}</small>
                            </div>
                            <button className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-text-dark transition hover:bg-emerald-700" onClick={() => handleLinkToLocalFile(result)}>
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
              spotifyUrlToUse,
              'Enter Spotify URI (spotify:track:...)'
            )}
            
            {renderExternalSourceSection(
              'youtube_url',
              'YouTube',
              youtubeUrlToUse,
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
          {entry.details.url ? <p><strong>URL:</strong> <a className="font-medium underline decoration-text/35 underline-offset-2 text-text/90 transition hover:text-text dark:decoration-text-dark/40 dark:text-text-dark/90 dark:hover:text-text-dark" href={entry.details.url}>{entry.details.url}</a></p> : null}
          {dateAdded ? <p><strong>Date Added to Playlist:</strong> {dateAdded}</p> : null}
          
          <div className="external-links">
            <h3>Search External Services</h3>
            <p><a className="font-medium underline decoration-text/35 underline-offset-2 text-text/90 transition hover:text-text dark:decoration-text-dark/40 dark:text-text-dark/90 dark:hover:text-text-dark" href={youtubeMusicSearchLink} target="_blank" rel="noopener noreferrer">Search on YouTube Music</a></p>
            <p><a className="font-medium underline decoration-text/35 underline-offset-2 text-text/90 transition hover:text-text dark:decoration-text-dark/40 dark:text-text-dark/90 dark:hover:text-text-dark" href={appleMusicSearchLink} target="_blank" rel="noopener noreferrer">Search on Apple Music</a></p>
            <p><a className="font-medium underline decoration-text/35 underline-offset-2 text-text/90 transition hover:text-text dark:decoration-text-dark/40 dark:text-text-dark/90 dark:hover:text-text-dark" href={spotifySearchLink} target="_blank" rel="noopener noreferrer">Search on Spotify</a></p>
            <p><a className="font-medium underline decoration-text/35 underline-offset-2 text-text/90 transition hover:text-text dark:decoration-text-dark/40 dark:text-text-dark/90 dark:hover:text-text-dark" href={lastFmSearchLink} target="_blank" rel="noopener noreferrer">Search on Last.fm</a></p>
            {discogsSearchLink ? <p><a className="font-medium underline decoration-text/35 underline-offset-2 text-text/90 transition hover:text-text dark:decoration-text-dark/40 dark:text-text-dark/90 dark:hover:text-text-dark" href={discogsSearchLink} target="_blank" rel="noopener noreferrer">Search on Discogs</a></p> : null}
            {rateYourMusicSearchLink ? <p><a className="font-medium underline decoration-text/35 underline-offset-2 text-text/90 transition hover:text-text dark:decoration-text-dark/40 dark:text-text-dark/90 dark:hover:text-text-dark" href={rateYourMusicSearchLink} target="_blank" rel="noopener noreferrer">Search on Rate Your Music</a></p> : null}
          </div>
          
          {playlistsList}

          {/* Notes Section - make it editable */}
          <div className="notes-section">
            <div className="notes-header">
              <strong>Notes:</strong>
              {playlistId && !editingNotes && (
                <button 
                  onClick={() => setEditingNotes(true)}
                  className="edit-notes-button"
                >
                  {(entry.notes || entry.details?.notes) ? 'Edit' : 'Add Notes'}
                </button>
              )}
            </div>
            
            {editingNotes ? (
              <div className="notes-editor">
                <textarea
                  value={notesValue}
                  onChange={(e) => setNotesValue(e.target.value)}
                  placeholder="Add your notes here..."
                  rows={4}
                  className="notes-textarea placeholder:text-text/60 dark:placeholder:text-text-dark/60"
                />
                <div className="notes-actions">
                  <button 
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    className="save-button"
                  >
                    Save
                  </button>
                  <button 
                    onClick={handleCancelNotes}
                    disabled={savingNotes}
                    className="cancel-button"
                  >
                    Cancel
                  </button>
                  {savingNotes && (
                    <span className="saving-indicator">Saving...</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="notes-display">
                {(notesValue || entry.notes || entry.details?.notes) ? (
                  <p className="notes-text">{notesValue || entry.notes || entry.details?.notes}</p>
                ) : (
                  <p className="no-notes">No notes added</p>
                )}
              </div>
            )}
          </div>

          {/* Hidden Information Section */}
          {entry.isHidden() && (
            <div className="detail-row">
              <strong>Hidden:</strong>
              <span>Yes (on {entry.getHiddenDate()})</span>
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button className="rounded border border-border bg-surface-subtle px-3 py-2 text-sm !text-text transition hover:bg-surface-muted dark:border-border-dark dark:bg-surface-dark dark:!text-text-dark dark:hover:bg-surface-dark-elevated" onClick={onClose}>Close</button>
        </div>
      </div>
      
      {/* Full-size album art modal */}
      {showFullSizeArt && modalAlbumArt && (
        <div 
          className="fixed inset-0 z-[6000] flex items-center justify-center bg-text/55 px-4 py-6 dark:bg-text-dark/30" 
          onClick={() => setShowFullSizeArt(false)}
        >
          <div 
            className="fullsize-art-container"
            onClick={e => e.stopPropagation()}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              maxWidth: '90vw',
              maxHeight: '90vh'
            }}
          >
            <img 
              src={modalAlbumArt}
              alt="Album artwork - full size"
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                borderRadius: '8px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
              }}
              onClick={() => setShowFullSizeArt(false)}
            />
            <button
              onClick={() => setShowFullSizeArt(false)}
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                background: 'rgba(0,0,0,0.7)',
                color: 'rgba(255, 255, 255, 0.87)',
                border: 'none',
                borderRadius: '50%',
                width: '40px',
                height: '40px',
                fontSize: '20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (typeof document === 'undefined') {
    return modalMarkup;
  }

  return createPortal(modalMarkup, document.body);
};

export default TrackDetailsModal;