import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import axios from 'axios';
import Playlists from '../Playlists';
import '@testing-library/jest-dom';
import {mockSongs, mockPlaylists} from './mockData';

vi.mock('axios');

describe('Playlists', () => {
  beforeEach(() => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/api/playlists/1')) {
        return Promise.resolve({ data: mockPlaylists[0] });
      }
      else if (url.includes('/api/playlists')) {
        return Promise.resolve({ data: mockPlaylists });
      }
      else if (url.includes('/api/search')) {
        return Promise.resolve({ data: mockSongs });
      }
      return Promise.reject(new Error('not found'));
    });
    vi.clearAllMocks();
  });

  it('fetches and displays playlists', async () => {
    render(<Playlists />);

    await waitFor(() => {
      expect(screen.getByText('Playlist 1')).toBeInTheDocument();
      expect(screen.getByText('Playlist 2')).toBeInTheDocument();
    });
  });

  it('creates new playlist', async () => {
    // Setup the mock response
    axios.post.mockResolvedValue({ 
      data: { id: 3, name: 'New Playlist', entries: [] }
    });
    
    render(<Playlists />);
    
    const input = screen.getByPlaceholderText('Playlist Name');
    const button = screen.getByText('Create Playlist');
    
    fireEvent.change(input, { target: { value: 'New Playlist' } });
    fireEvent.click(button);
    
    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/playlists'),
        { name: 'New Playlist', entries: [] }
      );
    });

    await waitFor(() => {
      expect(screen.getByText('New Playlist')).toBeInTheDocument();
    });
  });

  it('handles fetch errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error');
    axios.get.mockRejectedValueOnce(new Error('API Error'));

    render(<Playlists />);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error fetching playlists:', 
        expect.any(Error)
      );
    });
  });

  it('updates a playlist', async () => {
    // Setup the mock response for updating the playlist
    axios.put.mockResolvedValue({ 
      data: { id: 1, name: 'Playlist 1', entries: [mockSongs[1]] }
    });

    render(<Playlists />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
      fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'Song' } });
    });

    // Simulate fetching playlist details
    await waitFor(() => {
      expect(screen.getByText('Playlist 1')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Playlist 1'));
    });

    // add a track to this playlist
    await waitFor(() => {
      expect(screen.getAllByText('Add to Playlist')[1]).toBeInTheDocument();
      fireEvent.click(screen.getAllByText('Add to Playlist')[1]);
    });

    await waitFor(() => {
      fireEvent.click(screen.getAllByText('Playlist 1')[2]);
    });

    await waitFor(() => expect(axios.put).toHaveBeenCalled());

    expect(axios.put).toHaveBeenCalledWith(
      expect.stringContaining('/api/playlists/1'),
      { name: 'Playlist 1', entries: [{"music_file_id": 2, "order": 0}] }
    );
  });
});