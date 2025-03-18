import Axios from 'axios';
import { setupCache } from 'axios-cache-interceptor';

const instance = Axios.create(); 
const axios = setupCache(instance);

export class LastFMRepository {
    async findSimilarTracks(track) {
        try {
            const response = await axios.get(`/api/lastfm/similar`, {
                params: {
                artist: track.artist,
                title: track.title
                }
            });

            return response.data.map((track) => ({...track, entry_type: 'lastfm'}));
        } catch (error) {
            console.error('Error fetching similar tracks:', error);
        }
    }

    async fetchAlbumArt(artist, album) {
        if (!artist || !album) {
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

    async getAlbumInfo(title, artist) {
        try {
            const response = await axios.get('/api/lastfm/album/info', {
                params: { album: title, artist }
            });
            return {
                ...response.data,
                entry_type: 'requested_album'
            };
        } catch (error) {
            throw new Error('Failed to fetch album information');
        }
    }

    async searchAlbum(title, artist) {
        try {
            const response = await axios.get('/api/lastfm/album/search', {
                params: { album: title, artist }
            });
            return response.data.map((album) => ({...album, entry_type: 'requested_album'}));
        } catch (error) {
            return [];
        }
    }

    async searchTrack(title, artist) {
        try {
            const response = await axios.get('/api/lastfm', {
                params: { title, artist }
            });

            if (!response.data) {
                window.alert('No results found');
                return null;
            }

            return response.data.map((track) => ({...track, entry_type: 'lastfm'}));
        } catch (error) {
            throw new Error('Failed to fetch track information');
        }
    }

    // fetch up to 1, 4, or 9 album thumbnails for the playlist
    async generatePlaylistThumbnail(artistAlbums) {
        try {
            const albumThumbnails = await Promise.all(
                artistAlbums.map(async (album) => {
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
