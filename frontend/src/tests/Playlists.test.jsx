import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import axios from 'axios'

// Add the mock for axios
vi.mock('axios')

import Playlists from '../Playlists'
import { mockPlaylists, mockSongs } from './mockData'

describe('Playlists', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders playlists', async () => {
    axios.get.mockResolvedValueOnce({ data: mockPlaylists })
    axios.get.mockResolvedValueOnce({ data: mockSongs })

    render(<Playlists />)

    await waitFor(() => {
      expect(screen.getByText('Playlist 1')).toBeInTheDocument()
      expect(screen.getByText('Playlist 2')).toBeInTheDocument()
    })
  })

  it('creates new playlist', async () => {
    // Setup the mock response
    axios.post.mockResolvedValue({ 
      data: { id: 3, name: 'New Playlist', entries: [] }
    })
    
    render(<Playlists />)
    
    const input = screen.getByPlaceholderText('Playlist Name')
    const button = screen.getByText('Create Playlist')
    
    fireEvent.change(input, { target: { value: 'New Playlist' } })
    fireEvent.click(button)
    
    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/playlists'),
        { name: 'New Playlist', entries: [] }
      )
    })
  })

  it('handles fetch errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error')
    axios.get.mockRejectedValueOnce(new Error('API Error'))

    render(<Playlists />)

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error fetching playlists:', 
        expect.any(Error)
      )
    })
  })
})