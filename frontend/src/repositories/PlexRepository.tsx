import React from 'react';

export interface PlexSearchResult {
  title: string;
  artist: string;
  album: string;
  service: 'plex';
  plex_rating_key: string;
}

export class PlexRepository {
  async searchTracks(query: string): Promise<PlexSearchResult[]> {
    try {
      const response = await fetch(`/api/plex/search?query=${encodeURIComponent(query)}`);
      
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