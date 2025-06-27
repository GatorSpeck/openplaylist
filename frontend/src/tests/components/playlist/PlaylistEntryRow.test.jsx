import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import '@testing-library/jest-dom';

import PlaylistEntryRow from '../../../components/playlist/PlaylistEntryRow';
import PlaylistEntry from '../../../lib/PlaylistEntry';
import lastFMRepository from '../../../repositories/LastFMRepository';

// Mock the lastFMRepository
vi.mock('../../../repositories/LastFMRepository', () => ({
  default: {
    fetchAlbumArt: vi.fn()
  }
}));

describe('PlaylistEntryRow', () => {
  // Test data
  const createMusicTrackEntry = () => new PlaylistEntry({
    id: 1,
    order: 0,
    entry_type: 'music_file',
    details: {
      title: 'Test Track',
      artist: 'Test Artist',
      album: 'Test Album'
    }
  });
  
  const createAlbumEntry = () => new PlaylistEntry({
    id: 2,
    order: 1,
    entry_type: 'album',
    details: {
      title: 'Test Album',
      artist: 'Test Artist',
      album_artist: 'Test Album Artist',
      tracks: [
        { linked_track: { title: 'Track 1' } },
        { linked_track: { title: 'Track 2' } },
        { linked_track: { title: 'Track 3' } }
      ]
    }
  });

  const defaultProps = {
    isChecked: false,
    onClick: vi.fn(),
    onToggle: vi.fn(),
    onContextMenu: vi.fn(),
    className: 'test-class',
    dragHandleProps: { 'data-drag-handle': 'true' }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    lastFMRepository.fetchAlbumArt.mockResolvedValue(null);
  });
  
  test('renders a music track entry correctly', () => {
    const entry = createMusicTrackEntry();
    render(<PlaylistEntryRow entry={entry} {...defaultProps} />);
    
    expect(screen.getByText('Test Track')).toBeInTheDocument();
    expect(screen.getByText('Test Artist')).toBeInTheDocument();
    expect(screen.getByText('Test Album')).toBeInTheDocument();
    
    // Should show the EntryTypeBadge for music_file
    const badge = document.querySelector('.grid-cell div');
    expect(badge).toBeInTheDocument();
  });
  
  test('renders an album entry correctly', () => {
    const entry = createAlbumEntry();
    render(<PlaylistEntryRow entry={entry} {...defaultProps} />);
    
    expect(screen.getByText('(3 tracks)')).toBeInTheDocument();
    expect(screen.getByText('Test Artist')).toBeInTheDocument();
    expect(screen.getByText('Test Album')).toBeInTheDocument();
  });
  
  test('displays a checkmark when entry is checked', () => {
    const entry = createMusicTrackEntry();
    render(<PlaylistEntryRow entry={entry} {...defaultProps} isChecked={true} />);
    
    expect(screen.getByText('✔')).toBeInTheDocument();
  });
  
  test('expands album tracks when clicked', async () => {
    const entry = createAlbumEntry();
    render(<PlaylistEntryRow entry={entry} {...defaultProps} />);
    
    // Initially shows track count
    expect(screen.getByText('(3 tracks)')).toBeInTheDocument();
    
    // Click to expand
    fireEvent.click(screen.getByText('(3 tracks)'));
    
    // Now should show track list
    await waitFor(() => {
      expect(screen.getByText('Track 1, Track 2, Track 3')).toBeInTheDocument();
    });
  });
  
  test('calls onContextMenu when right-clicking the row', () => {
    const onContextMenu = vi.fn();
    const entry = createMusicTrackEntry();
    render(<PlaylistEntryRow entry={entry} {...defaultProps} onContextMenu={onContextMenu} />);
    
    fireEvent.contextMenu(screen.getByText('Test Track').closest('div[class^="test-class"]'));
    expect(onContextMenu).toHaveBeenCalled();
  });
  
  test('calls onToggle when clicking the first grid cell', () => {
    const onToggle = vi.fn();
    const entry = createMusicTrackEntry();
    render(<PlaylistEntryRow entry={entry} {...defaultProps} onToggle={onToggle} />);
    
    fireEvent.click(document.querySelector('.grid-cell'));
    expect(onToggle).toHaveBeenCalled();
  });
  
  test('applies drag handle props to the first grid cell', () => {
    const entry = createMusicTrackEntry();
    const dragHandleProps = { 'data-testid': 'drag-handle' };
    
    render(<PlaylistEntryRow entry={entry} {...defaultProps} dragHandleProps={dragHandleProps} />);
    
    const firstCell = document.querySelector('.grid-cell');
    expect(firstCell).toHaveAttribute('data-testid', 'drag-handle');
  });
  
  test('applies isDragging class when dragging', () => {
    const entry = createMusicTrackEntry();
    
    render(<PlaylistEntryRow entry={entry} {...defaultProps} isDragging={true} />);
    
    const row = document.querySelector('.test-class.dragging');
    expect(row).toBeInTheDocument();
  });
  
  test('displays album art when available in entry', () => {
    const entry = createMusicTrackEntry();
    entry.details.art_url = 'https://example.com/album.jpg';
    
    render(<PlaylistEntryRow entry={entry} {...defaultProps} />);
    
    const img = document.querySelector('.album-art img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/album.jpg');
    expect(img).toHaveAttribute('alt', 'Album Art');
  });
  
  test('fetches and displays album art from LastFM when not in entry', async () => {
    const entry = createMusicTrackEntry();
    lastFMRepository.fetchAlbumArt.mockResolvedValue({ 
      image_url: 'https://lastfm.com/album.jpg' 
    });
    
    render(<PlaylistEntryRow entry={entry} {...defaultProps} />);
    
    await waitFor(() => {
      const img = document.querySelector('.album-art img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'https://lastfm.com/album.jpg');
    });
    
    expect(lastFMRepository.fetchAlbumArt).toHaveBeenCalledWith('Test Artist', 'Test Album');
  });
});