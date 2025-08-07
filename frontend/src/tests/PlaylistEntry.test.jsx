import { describe, test, expect } from 'vitest';
import PlaylistEntry, { PlaylistEntryStub, EntryDetails } from '../lib/PlaylistEntry';

describe('PlaylistEntryStub', () => {
  test('initializes with default values when no data provided', () => {
    const stub = new PlaylistEntryStub();
    expect(stub.id).toBeNull();
    expect(stub.order).toBe(0);
    expect(stub.entry_type).toBe('music_file');
  });

  test('initializes with provided values', () => {
    const stub = new PlaylistEntryStub({
      id: 123,
      order: 5,
    });
    expect(stub.id).toBe(123);
    expect(stub.order).toBe(5);
  });
});

describe('EntryDetails', () => {
  test('initializes with default values when no data provided', () => {
    const details = new EntryDetails();
    expect(details.title).toBeNull();
    expect(details.artist).toBeNull();
    expect(details.album).toBeNull();
    expect(details.genres).toEqual([]);
    expect(details.tracks).toBeNull();
  });

  test('initializes with provided values', () => {
    const details = new EntryDetails({
      title: 'Test Title',
      artist: 'Test Artist',
      album: 'Test Album',
      genres: ['Rock', 'Pop'],
      tracks: [{ title: 'Track 1' }]
    });
    expect(details.title).toBe('Test Title');
    expect(details.artist).toBe('Test Artist');
    expect(details.album).toBe('Test Album');
    expect(details.genres).toEqual(['Rock', 'Pop']);
    expect(details.tracks).toEqual([{ title: 'Track 1' }]);
  });
});

describe('PlaylistEntry', () => {
  test('initializes with default values when no data provided', () => {
    const entry = new PlaylistEntry();
    expect(entry.id).toBeNull();
    expect(entry.order).toBe(0);
    expect(entry.entry_type).toBe('music_file');
    expect(entry.details).toBeInstanceOf(EntryDetails);
  });

  test('initializes with provided values', () => {
    const entry = new PlaylistEntry({
      id: 123,
      order: 5,
      title: 'Test Title',
      artist: 'Test Artist',
      album: 'Test Album'
    });
    
    expect(entry.id).toBe(123);
    expect(entry.order).toBe(5);
    expect(entry.details.title).toBe('Test Title');
    expect(entry.details.artist).toBe('Test Artist');
    expect(entry.details.album).toBe('Test Album');
  });

  test('initializes with nested details object', () => {
    const entry = new PlaylistEntry({
      id: 123,
      details: {
        title: 'Test Title',
        artist: 'Test Artist',
        album: 'Test Album'
      }
    });
    
    expect(entry.details.title).toBe('Test Title');
    expect(entry.details.artist).toBe('Test Artist');
    expect(entry.details.album).toBe('Test Album');
  });

  test('getAlbumArtist returns album_artist or falls back to artist', () => {
    const entryWithBoth = new PlaylistEntry({
      album_artist: 'Album Artist',
      artist: 'Track Artist'
    });
    
    const entryWithArtistOnly = new PlaylistEntry({
      artist: 'Track Artist'
    });
    
    expect(entryWithBoth.getAlbumArtist()).toBe('Album Artist');
    expect(entryWithArtistOnly.getAlbumArtist()).toBe('Track Artist');
  });

  test('getArtist returns artist or falls back to album_artist', () => {
    const entryWithBoth = new PlaylistEntry({
      album_artist: 'Album Artist',
      artist: 'Track Artist'
    });
    
    const entryWithAlbumArtistOnly = new PlaylistEntry({
      album_artist: 'Album Artist'
    });
    
    expect(entryWithBoth.getArtist()).toBe('Track Artist');
    expect(entryWithAlbumArtistOnly.getArtist()).toBe('Album Artist');
  });

  test('getTitle returns the title', () => {
    const entry = new PlaylistEntry({
      title: 'Test Title'
    });
    
    expect(entry.getTitle()).toBe('Test Title');
  });

  test('getAlbum returns title for album types or album for track types', () => {
    const albumEntry = new PlaylistEntry({
      entry_type: 'requested_album',
      title: 'Album Title',
      album: 'Should Not Use This'
    });
    
    const trackEntry = new PlaylistEntry({
      entry_type: 'music_file',
      title: 'Track Title',
      album: 'Album Name'
    });
    
    expect(albumEntry.getAlbum()).toBe('Album Title');
    expect(trackEntry.getAlbum()).toBe('Album Name');
  });

  test('isAlbum correctly identifies album types', () => {
    const albumEntry = new PlaylistEntry({ entry_type: 'album' });
    const requestedAlbumEntry = new PlaylistEntry({ entry_type: 'requested_album' });
    const trackEntry = new PlaylistEntry({ entry_type: 'music_file' });
    
    expect(albumEntry.isAlbum()).toBe(true);
    expect(requestedAlbumEntry.isAlbum()).toBe(true);
    expect(trackEntry.isAlbum()).toBe(false);
  });

  test('getArtUrl returns art_url or null', () => {
    const entryWithArt = new PlaylistEntry({
      art_url: 'http://example.com/art.jpg'
    });
    
    const entryWithoutArt = new PlaylistEntry({});
    
    expect(entryWithArt.getArtUrl()).toBe('http://example.com/art.jpg');
    expect(entryWithoutArt.getArtUrl()).toBeNull();
  });

  test('getTracks returns tracks array for album types or empty array for track types', () => {
    const albumEntry = new PlaylistEntry({
      entry_type: 'album',
      tracks: [{ title: 'Track 1' }, { title: 'Track 2' }]
    });
    
    const trackEntry = new PlaylistEntry({
      entry_type: 'music_file'
    });
    
    expect(albumEntry.getTracks()).toEqual([{ title: 'Track 1' }, { title: 'Track 2' }]);
    expect(trackEntry.getTracks()).toEqual([]);
  });

  test('toRequestedTrack converts entry to requested track type', () => {
    const originalEntry = new PlaylistEntry({
      id: 123,
      entry_type: 'music_file',
      music_file_id: 456,
      title: 'Test Title',
      artist: 'Test Artist'
    });
    
    const requestedTrack = originalEntry.toRequestedTrack();
    
    expect(requestedTrack.entry_type).toBe('requested');
    expect(requestedTrack.music_file_id).toBeNull();
    expect(requestedTrack.id).toBe(123);
    expect(requestedTrack.details.title).toBe('Test Title');
    expect(requestedTrack.details.artist).toBe('Test Artist');
  });

  test('toRequestedAlbum converts entry to requested album type', () => {
    const originalEntry = new PlaylistEntry({
      id: 123,
      entry_type: 'music_file',
      title: 'Test Album',
      artist: 'Test Artist'
    });
    
    const requestedAlbum = originalEntry.toRequestedAlbum();
    
    expect(requestedAlbum.entry_type).toBe('requested_album');
    expect(requestedAlbum.details.title).toBe('Test Album');
    expect(requestedAlbum.details.artist).toBe('Test Artist');
  });

  test('toApiFormat returns correct format for music file entry', () => {
    const entry = new PlaylistEntry({
      id: 123,
      order: 5,
      entry_type: 'music_file',
      music_file_id: 456
    });
    
    const apiFormat = entry.toApiFormat();
    
    expect(apiFormat.id).toBe(123);
    expect(apiFormat.order).toBe(5);
    expect(apiFormat.entry_type).toBe('music_file');
    expect(apiFormat.music_file_id).toBe(456);
    expect(apiFormat.details).toBeUndefined();
  });

  test('toApiFormat returns correct format for requested track entry', () => {
    const entry = new PlaylistEntry({
      id: 123,
      order: 5,
      entry_type: 'requested',
      title: 'Test Title',
      artist: 'Test Artist',
      album: 'Test Album',
      genres: ['Rock']
    });
    
    const apiFormat = entry.toApiFormat();
    
    expect(apiFormat.id).toBe(123);
    expect(apiFormat.order).toBe(5);
    expect(apiFormat.entry_type).toBe('requested');
    expect(apiFormat.details).toBeDefined();
    expect(apiFormat.details.title).toBe('Test Title');
    expect(apiFormat.details.artist).toBe('Test Artist');
    expect(apiFormat.details.album).toBe('Test Album');
    expect(apiFormat.details.genres).toEqual(['Rock']);
  });

  test('display methods return correct formatted values', () => {
    const albumEntry = new PlaylistEntry({
      entry_type: 'album',
      title: 'Album Title',
      artist: 'Artist Name',
      tracks: [{ title: 'Track 1' }, { title: 'Track 2' }]
    });
    
    const trackEntry = new PlaylistEntry({
      entry_type: 'music_file',
      title: 'Track Title',
      artist: 'Artist Name',
      album: 'Album Name'
    });
    
    const emptyEntry = new PlaylistEntry({});
    
    expect(albumEntry.getDisplayTitle()).toBe('Album Title (2 tracks)');
    expect(trackEntry.getDisplayTitle()).toBe('Track Title');
    expect(emptyEntry.getDisplayTitle()).toBe('Unknown Title');
    
    expect(albumEntry.getDisplayArtist()).toBe('Artist Name');
    expect(emptyEntry.getDisplayArtist()).toBe('Unknown Artist');
    
    expect(albumEntry.getDisplayAlbum()).toBe('Album Title');
    expect(trackEntry.getDisplayAlbum()).toBe('Album Name');
    expect(emptyEntry.getDisplayAlbum()).toBe('Unknown Album');
  });
});