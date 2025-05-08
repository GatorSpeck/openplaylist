import Axios from 'axios';
import PlaylistEntry from '../lib/PlaylistEntry';

import { setupCache } from 'axios-cache-interceptor';

const axios = Axios.create(); 
const axiosCached = setupCache(axios);

export class LibraryRepository {
    async searchLibrary(query) {
        try {
            const response = await axios.get(`/api/search`, {
                params: {
                    query: query
                }
            });

            return response.data;
        } catch (error) {
            console.error('Error fetching search results:', error);
        }
    }

    async scan(full) {
        const URI = full ? '/api/fullscan' : '/api/scan';
        await axios.get(URI);
    }

    async getStats() {
        try {
            const response = await axios.get(`/api/stats`);
            return response.data;
        } catch (error) {
            console.error('Error fetching library stats:', error);
        }
    }

    async findLocalFiles(tracks: PlaylistEntry[]) {
        try {
            const details = tracks.map(track => track.details);
            const response = await axios.post(`/api/library/findlocals`, details);
            const localFiles = response.data.map(tracks => ({...tracks, entry_type: "music_file"}));

            return tracks.map((track, idx) => localFiles[idx].path ? localFiles[idx] : track);
        } catch (error) {
            console.error('Error fetching local files:', error);
            return [];
        }
    }

    async filter(query) {
        try {
            const response = await axios.get(`/api/filter`, {
                params: query
            });

            return response.data;
        } catch (error) {
            console.error('Error fetching filter results:', error);
        }
    }

    async getArtistList() {
        try {
            const response = await axiosCached.get(`/api/artistlist`);
            return response.data;
        } catch (error) {
            console.error('Error fetching artist list:', error);
        }
    }

    async getAlbumList() {
        try {
            const response = await axiosCached.get(`/api/albumlist`);
            return response.data;
        } catch (error) {
            console.error('Error fetching album list:', error);
        }
    }
};

const libraryRepository = new LibraryRepository();
export default libraryRepository;
