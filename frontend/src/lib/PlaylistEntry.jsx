/**
 * PlaylistEntry class to model entries in a playlist
 * Handles different entry types: music_file, lastfm, requested, requested_album, album, nested_playlist
 */
class PlaylistEntry {
  /**
   * Create a new PlaylistEntry instance
   * @param {Object} entryData - The raw entry data
   */
  constructor(entryData = {}) {
    // Common properties for all entry types
    this.id = entryData.id || null;
    this.order = entryData.order || 0;
    this.entry_type = entryData.entry_type || 'music_file';
    this.date_added = entryData.date_added || null;
    
    // Type-specific IDs
    this.music_file_id = entryData.music_file_id || null;
    this.lastfm_track_id = entryData.lastfm_track_id || null;
    this.requested_track_id = entryData.requested_track_id || null;
    this.requested_album_id = entryData.requested_album_id || null;
    this.album_id = entryData.album_id || null;
    this.playlist_id = entryData.playlist_id || null;
    
    // Track details - handles both direct properties and nested details object
    const detailsToUse = entryData.details || entryData;
    this.title = detailsToUse.title || null;
    this.artist = detailsToUse.artist || null;
    this.album = detailsToUse.album || null;
    this.album_artist = detailsToUse.album_artist || null;
    this.year = detailsToUse.year || null;
    this.length = detailsToUse.length || 0;
    this.genres = detailsToUse.genres || [];
    this.path = detailsToUse.path || null;
    this.publisher = detailsToUse.publisher || null;
    this.kind = detailsToUse.kind || null;
    this.missing = detailsToUse.missing || false;
    this.track_number = detailsToUse.track_number || null;
    this.disc_number = detailsToUse.disc_number || null;
    this.url = entryData.url || detailsToUse.url || null;
    this.art_url = detailsToUse.art_url || null;
    
    // For album types, handle tracks
    if (detailsToUse.tracks) {
      this.tracks = detailsToUse.tracks;
    }
    
    // Keep original details if needed
    this.details = entryData.details || null;
  }

  hasDetails() {
    return this.details !== null;
  }

  getAlbumArtist() {
    return this.album_artist || this.artist;
  }

  getArtist() {
    return this.artist || this.album_artist;
  }

  getTitle() {
    return !this.isAlbum() ? this.title : this.album;
  }

  getAlbum() {
    return this.isAlbum() ? this.title : this.album;
  }

  isAlbum() {
    return this.entry_type === "album" || this.entry_type === "requested_album";
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
   * Check if this entry is an album
   * @returns {boolean}
   */
  isAlbum() {
    return this.entry_type === 'album' || this.entry_type === 'requested_album';
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
      lastfm_track_id: null,
      details: {
        title: this.title,
        artist: this.artist,
        album: this.album,
        album_artist: this.album_artist
      }
    });
  }

  /**
   * Convert this entry to a format suitable for API requests
   * @returns {Object} Entry data ready for API
   */
  toApiFormat() {
    const baseEntry = {
      id: this.id,
      entry_type: this.entry_type,
      order: this.order
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
    if (this.isRequestedTrack() || this.isLastFM() || this.isAlbum()) {
      baseEntry.details = {
        title: this.title,
        artist: this.artist,
        album: this.album,
        album_artist: this.album_artist,
        year: this.year,
        length: this.length,
        publisher: this.publisher
      };

      if (this.url) {
        baseEntry.details.url = this.url;
      }

      if (this.isAlbum() && this.tracks) {
        baseEntry.details.tracks = this.tracks;
        baseEntry.details.art_url = this.art_url;
      }

      if (this.genres && this.genres.length) {
        baseEntry.details.genres = this.genres;
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
    if (this.isAlbum() && this.tracks) {
      return `${this.title} (${this.tracks.length} tracks)`;
    }
    return this.title || 'Unknown Title';
  }

  /**
   * Get the display artist
   * @returns {string}
   */
  getDisplayArtist() {
    return this.artist || this.album_artist || 'Unknown Artist';
  }

  /**
   * Get the display album
   * @returns {string}
   */
  getDisplayAlbum() {
    if (this.isAlbum()) {
      return this.title || 'Unknown Album';
    }
    return this.album || 'Unknown Album';
  }
}

export default PlaylistEntry;