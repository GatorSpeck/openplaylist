import React from 'react';

export interface PlexSearchResult {
  title: string;
  artist: string;
  album: string;
  service: 'plex';
  plex_rating_key: string;
}

export class PlexRepository {
  async searchTracks(query: string, title?: string, artist?: string, album?: string): Promise<PlexSearchResult[]> {
    try {
      // Build query parameters
      const params = new URLSearchParams({ query });
      if (title) params.append('title', title);
      if (artist) params.append('artist', artist);
      if (album) params.append('album', album);
      
      const response = await fetch(`/api/plex/search?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const results = await response.json();
      return results;
    } catch (error) {
      console.error('Error searching Plex:', error);
      throw error;
    }
  }

  async checkAuthentication(): Promise<boolean> {
    try {
      const response = await fetch('/api/settings');
      if (!response.ok) {
        return false;
      }
      
      const settings = await response.json();
      return settings.plexConfigured || false;
    } catch (error) {
      console.error('Error checking Plex authentication:', error);
      return false;
    }
  }
}

export const plexRepository = new PlexRepository();