export interface YouTubeSearchResult {
  title: string;
  artist: string;
  album: string;
  service: 'youtube';
  youtube_url: string;
  score: number;
}

export class YouTubeRepository {
  async searchTracks(query: string, title?: string, artist?: string, album?: string): Promise<YouTubeSearchResult[]> {
    try {
      const params = new URLSearchParams({ query });
      if (title) params.append('title', title);
      if (artist) params.append('artist', artist);
      if (album) params.append('album', album);

      const response = await fetch(`/api/youtube/search?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error searching YouTube Music:', error);
      throw error;
    }
  }
}

export const youtubeRepository = new YouTubeRepository();
