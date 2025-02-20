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

    async searchAlbum(title, artist) {
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

    async searchTrack(title, artist) {
        try {
            const response = await axios.get('/api/lastfm', {
                params: { title, artist }
            });
            return {
                ...response.data,
                entry_type: 'lastfm'
            };
        } catch (error) {
            throw new Error('Failed to fetch track information');
        }
    }
};

const lastFMRepository = new LastFMRepository();
export default lastFMRepository;
