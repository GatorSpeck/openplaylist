import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import axios from 'axios';
import Playlists from '../components/Playlists';
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

    fireEvent.click(screen.getByText('☰'));

    await waitFor(() => {
      fireEvent.click(screen.getByText('New Playlist'));
    });
    
    await waitFor(() => {
      const input = screen.getByPlaceholderText('New Playlist Name');
      const button = screen.getByText('Create');

      fireEvent.change(input, { target: { value: 'Playlist 1' } });
      fireEvent.click(button);
    });
    
    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        '/api/playlists',
        { name: 'Playlist 1', entries: [] }
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Playlist 1')).toBeInTheDocument();
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
      expect(screen.getByPlaceholderText('Search local files...')).toBeInTheDocument();
      fireEvent.change(screen.getByPlaceholderText('Search local files...'), { target: { value: 'Song' } });
    });

    // add a track to this playlist
    await waitFor(() => {
      const song = screen.getByText('Song 2');
      expect(song).toBeInTheDocument();
      song.click();
    });

    await waitFor(() => {
      const addButton = screen.getByText('Add 1 Selected to Playlist');
      expect(addButton).toBeInTheDocument();
      addButton.click();
    });

    await waitFor(() => {
      const playlist = screen.getAllByText('Playlist 1')[1];
      expect(playlist).toBeInTheDocument();
      playlist.click();
    })

    await waitFor(() => expect(axios.put).toHaveBeenCalled());

    expect(axios.put).toHaveBeenCalledWith(
      '/api/playlists/1',
      expect.objectContaining({ entries: [
        expect.objectContaining({"music_file_id": 2, "order": 0})
      ] })
    );
  });
});