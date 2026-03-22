import Axios from 'axios';
import { setupCache } from 'axios-cache-interceptor';
import PlaylistEntry from '../lib/PlaylistEntry';

const instance = Axios.create(); 
const axios = setupCache(instance);

export class LastFMRepository {
    async findSimilarTracks(track: PlaylistEntry) {
        try {
            const response = await axios.get(`/api/lastfm/similar`, {
                params: {
                artist: track.getArtist(),
                title: track.getTitle()
                }
            });

            return response.data.map((track) => {
                let result = new PlaylistEntry(track);
                result.entry_type = 'music_file';
                return result;
            });
        } catch (error) {
            console.error('Error fetching similar tracks:', error);
        }
    }

    async isConfigured() {
        try {
            const response = await axios.get('/api/settings');
            return response.data.lastFmApiKeyConfigured ? true : false;
        }
        catch (error) {
            console.error('Error checking LastFM configuration:', error);
            return false;
        }
    }

    async fetchAlbumArt(artist: string, album: string) {
        if (!artist || !album) {
            return null;
        }

        if (!this.isConfigured()) {
            return null;
        }
        
        try {
            const response = await axios.get(`/api/lastfm/albumart`, {
                params: {
                    artist: artist,
                    album: album
                }
            });

            return response.data;
        }
        catch (error) {
            console.error('Error fetching album art:', error);
        }
    }

    async getAlbumInfo(title?: string, artist?: string, mbid?: string) {
        try {
            const response = await axios.get('/api/lastfm/album/info', {
                params: { album: title, artist, mbid }
            });
            return {
                ...response.data,
                entry_type: 'requested_album',
                last_fm_url: response.data.last_fm_url || null
            };
        } catch (error) {
            throw new Error('Failed to fetch album information');
        }
    }

    async searchAlbum(title: string, artist: string, limit: number = 10, page: number = 1) {
        try {
            const response = await axios.get('/api/lastfm/album/search', {
                params: { album: title, artist, limit, page }
            });
            return response.data.map((album) => {
                let result = new PlaylistEntry(album);
                result.entry_type = 'requested_album';
                result.details.last_fm_url = album.last_fm_url || null;
                return result;
            });
        } catch (error) {
            return [];
        }
    }

    async enhanceAlbumsWithDetailedInfo(albums: PlaylistEntry[]): Promise<PlaylistEntry[]> {
        const enhancedAlbums = await Promise.all(
            albums.map(async (album) => {
                try {
                    // Only fetch detailed info if we have an mbid
                    if (album.details?.mbid) {
                        const detailedInfo = await this.getAlbumInfo(
                            album.getTitle(), 
                            album.getArtist(), 
                            album.details.mbid
                        );
                        
                        // Create a new PlaylistEntry with enhanced details
                        const enhancedEntry = new PlaylistEntry({
                            ...album,
                            details: {
                                ...album.details,
                                ...detailedInfo,
                                // Preserve original fields that might not be in detailed info
                                last_fm_url: album.details.last_fm_url || detailedInfo.last_fm_url
                            }
                        });
                        
                        return enhancedEntry;
                    }
                    return album;
                } catch (error) {
                    console.warn(`Failed to enhance album ${album.getArtist()} - ${album.getTitle()}:`, error);
                    // Return original album if enhancement fails
                    return album;
                }
            })
        );
        
        return enhancedAlbums;
    }

    async searchTrack(title: string, artist: string, limit: number = 10, page: number = 1) {
        try {
            const response = await axios.get('/api/lastfm', {
                params: { title, artist, limit, page }
            });

            if (!response.data) {
                window.alert('No results found');
                return null;
            }

            return response.data.map((track: any) => {
                let result = new PlaylistEntry({
                    ...track,
                    entry_type: 'music_file'
                });
                return result;
            });
        } catch (error) {
            throw new Error('Failed to fetch track information');
        }
    }

    // fetch up to 1, 4, or 9 album thumbnails for the playlist
    async generatePlaylistThumbnail(artistAlbums: any[]) {
        try {
            const albumThumbnails = await Promise.all(
                artistAlbums.map(async (album: any) => {
                    const albumArt = await this.fetchAlbumArt(album.artist, album.album);
                    return albumArt;
                })
            );
            
            if (albumThumbnails.length > 9) {
                return albumThumbnails.slice(0, 9);
            }
            else if (albumThumbnails.length > 4) {
                return albumThumbnails.slice(0, 4);
            }
            else if (albumThumbnails.length >= 1) {
                return albumThumbnails.slice(0, 1);
            }
            else {
                return null;
            }
        }
        catch (error) {
            console.error('Error fetching album thumbnails:', error);
        }
    }
};

const lastFMRepository = new LastFMRepository();
export default lastFMRepository;
