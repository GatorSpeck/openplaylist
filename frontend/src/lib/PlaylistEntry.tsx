export class PlaylistEntryStub {
  constructor(entryData = {}) {
    this.id = entryData.id || null;
    this.order = entryData.order || 0;
    this.entry_type = entryData.entry_type || 'music_file';
    this.notes = entryData.notes || null;
    this.is_hidden = entryData.is_hidden || false;  // Add this line
    this.date_hidden = entryData.date_hidden || null;  // Add this line
  }
}

export class EntryDetails {
  constructor(details = {}) {
    this.title = details.title || null;
    this.artist = details.artist || null;
    this.album = details.album || null;
    this.album_artist = details.album_artist || null;
    this.year = details.year || null;
    this.length = details.length || 0;
    this.genres = details.genres || [];
    this.path = details.path || null;
    this.publisher = details.publisher || null;
    this.kind = details.kind || null;
    this.missing = details.missing || false;
    this.track_number = details.track_number || null;
    this.disc_number = details.disc_number || null;
    this.url = details.url || null;
    this.art_url = details.art_url || null;
    this.last_fm_url = details.last_fm_url || null;
    this.notes = details.notes || null;
    this.comments = details.comments || null;
    this.size = details.size || null;
    this.last_scanned = details.last_scanned || null;
    this.first_scanned = details.first_scanned || null;
    // Add missing external source fields
    this.spotify_uri = details.spotify_uri || null;
    this.youtube_url = details.youtube_url || null;
    this.mbid = details.mbid || null;
    this.plex_rating_key = details.plex_rating_key || null;
    this.rating = details.rating || null;

    // For album types, handle tracks
    this.tracks = details.tracks ? details.tracks : null;
  }
}

/**
 * PlaylistEntry class to model entries in a playlist
 * Handles different entry types: music_file, lastfm, requested, requested_album, album, nested_playlist
 */
class PlaylistEntry extends PlaylistEntryStub {
  /**
   * @typedef {Object} PlaylistEntry
   * @property {number} id - The ID of the entry
   * @property {number} order - The order of the entry in the playlist
   * @property {string} entry_type - The type of the entry (e.g., music_file, lastfm, requested, requested_album, album, nested_playlist)
   * @property {string} date_added - The date the entry was added to the playlist
   * @property {number} music_file_id - The ID of the music file (if applicable)
   * @property {number} lastfm_track_id - The ID of the Last.FM track (if applicable)
   * @property {number} requested_track_id - The ID of the requested track (if applicable)
   * @property {number} requested_album_id - The ID of the requested album (if applicable)
   * @property {number} album_id - The ID of the album (if applicable)
   * @property {number} playlist_id - The ID of the playlist (if applicable)
   * @property {EntryDetails} details - The details of the entry (e.g., title, artist, album, etc.)
   */

  /**
   * Create a new PlaylistEntry instance
   * @param {Object} entryData - The raw entry data
   */
  constructor(entryData = {}) {
    super(entryData);
    
    // Common properties for all entry types
    this.date_added = entryData.date_added || null;
    
    // Type-specific IDs
    this.music_file_id = entryData.music_file_id || null;
    if (!this.music_file_id && entryData.entry_type === 'music_file') {
      this.music_file_id = entryData.id || null; // Fallback to id if not provided
    }

    this.lastfm_track_id = entryData.lastfm_track_id || null;
    this.requested_track_id = entryData.requested_track_id || null;
    this.requested_album_id = entryData.requested_album_id || null;
    this.album_id = entryData.album_id || null;
    this.playlist_id = entryData.playlist_id || null;
    
    // Make sure notes is available at the entry level too
    this.notes = entryData.notes || null;
    
    // Track details - handles both direct properties and nested details object
    const detailsToUse = entryData.details || entryData;
    this.details = new EntryDetails(detailsToUse);
    
    // If notes isn't in details but is at the entry level, add it to details
    if (this.notes && !this.details.notes) {
      this.details.notes = this.notes;
    }
  }

  getEntryType() {
    return this.entry_type;
  }

  hasDetails() {
    return this.details !== null;
  }

  getAlbumArtist() {
    return this.details.album_artist || this.details.artist;
  }

  getArtist() {
    return this.details.artist || this.details.album_artist;
  }

  getTitle() {
    return this.details.title;
  }

  getAlbum() {
    return this.isAlbum() ? this.details.title : this.details.album;
  }

  isAlbum() {
    return this.entry_type === "album" || this.entry_type === "requested_album";
  }

  getArtUrl() {
    return this.details.art_url || null;
  }

  getPath() {
    return this.getDetails().path || null;
  }

  getTracks() {
    if (!this.isAlbum()) {
      return [];
    }
    
    return this.details?.tracks || [];
  }

  /**
   * Check if this entry is a music file
   * @returns {boolean}
   */
  isMusicFile() {
    return this.entry_type === 'music_file';
  }

  /**
   * Check if this entry is from Last.FM
   * @returns {boolean}
   */
  isLastFM() {
    return this.entry_type === 'lastfm';
  }

  /**
   * Check if this entry is a requested track
   * @returns {boolean}
   */
  isRequestedTrack() {
    return this.entry_type === 'requested';
  }

  /**
   * Check if this entry can be edited
   * @returns {boolean}
   */
  isEditable() {
    return this.isRequestedTrack() || this.entry_type === 'requested_album' || this.isLastFM();
  }

  /**
   * Convert to a requested track
   * @returns {PlaylistEntry} New entry with requested track type
   */
  toRequestedTrack() {
    return new PlaylistEntry({
      ...this,
      entry_type: 'requested',
      music_file_id: null,
      lastfm_track_id: null
    });
  }

  toRequestedAlbum() {
    return new PlaylistEntry({
      ...this,
      details: this.details,
      entry_type: 'requested_album'
    });
  }

  getDetails() {
    return this.details;
  }

  /**
   * Convert this entry to a format suitable for API requests
   * @returns {Object} Entry data ready for API
   */
  toApiFormat() {
    const baseEntry = {
      id: this.id,
      entry_type: this.entry_type,
      order: this.order,
      notes: this.notes,
      is_hidden: this.is_hidden,  // Add this line
      date_hidden: this.date_hidden  // Add this line
    };

    // Add type-specific IDs
    if (this.isMusicFile()) {
      baseEntry.music_file_id = this.music_file_id;
    } else if (this.isLastFM()) {
      baseEntry.lastfm_track_id = this.lastfm_track_id;
    } else if (this.isRequestedTrack()) {
      baseEntry.requested_track_id = this.requested_track_id;
    } else if (this.entry_type === 'album') {
      baseEntry.album_id = this.album_id;
    } else if (this.entry_type === 'requested_album') {
      baseEntry.requested_album_id = this.requested_album_id;
    } else if (this.entry_type === 'nested_playlist') {
      baseEntry.playlist_id = this.playlist_id;
    }

    // Add details for entries that need them
    if (this.isRequestedTrack() || this.isLastFM() || this.isAlbum() || this.isMusicFile()) {
      baseEntry.details = {
        title: this.getTitle(),
        artist: this.getArtist(),
        album: this.getAlbum(),
        album_artist: this.getAlbumArtist(),
        year: this.details.year,
        length: this.details.length,
        publisher: this.details.publisher,
        genres: this.details.genres || [],
        // Include all metadata fields
        notes: this.details.notes,
        comments: this.details.comments,
        track_number: this.details.track_number,
        disc_number: this.details.disc_number,
        rating: this.details.rating,
        // Include external source fields
        last_fm_url: this.details.last_fm_url,
        spotify_uri: this.details.spotify_uri,
        youtube_url: this.details.youtube_url,
        mbid: this.details.mbid,
        plex_rating_key: this.details.plex_rating_key,
        // Include local file fields if present
        path: this.details.path,
        kind: this.details.kind,
        size: this.details.size,
        missing: this.details.missing,
        first_scanned: this.details.first_scanned,
        last_scanned: this.details.last_scanned
      };

      if (this.details.url) {
        baseEntry.details.url = this.details.url;
      }

      if (this.isAlbum() && this.details.tracks) {
        baseEntry.details.tracks = this.details.tracks;
        baseEntry.details.art_url = this.details.art_url;
      }
    }

    return baseEntry;
  }

  /**
   * Create a PlaylistEntry from an API response
   * @param {Object} data - API data
   * @returns {PlaylistEntry}
   */
  static fromApiResponse(data) {
    return new PlaylistEntry(data);
  }

  /**
   * Get the display title for the entry
   * @returns {string}
   */
  getDisplayTitle() {
    if (this.isAlbum() && this.details.tracks) {
      return `${this.details.title} (${this.details.tracks.length} tracks)`;
    }
    return this.details.title || 'Unknown Title';
  }

  /**
   * Get the display artist
   * @returns {string}
   */
  getDisplayArtist() {
    return this.details.artist || this.details.album_artist || 'Unknown Artist';
  }

  /**
   * Get the display album
   * @returns {string}
   */
  getDisplayAlbum() {
    if (this.isAlbum()) {
      return this.details.title || 'Unknown Album';
    }
    return this.details.album || 'Unknown Album';
  }

  // Add method to check if entry is hidden
  isHidden() {
    return this.is_hidden;
  }

  // Add method to get formatted hidden date
  getHiddenDate() {
    if (!this.date_hidden) return null;
    return new Date(this.date_hidden).toLocaleString();
  }
}

export default PlaylistEntry;