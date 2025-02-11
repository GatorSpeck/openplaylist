import axios from 'axios';

export class LibraryRepository {
    async searchLibrary(query) {
        try {
            const response = await axios.get(`/api/library/search`, {
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

    async findLocalFiles(tracks) {
        try {
            const response = await axios.post(`/api/library/findlocals`, tracks);
            const localFiles = response.data.map(tracks => ({...tracks, entry_type: "music_file"}));

            return tracks.map((track, idx) => localFiles[idx].path ? localFiles[idx] : track);
        } catch (error) {
            console.error('Error fetching local files:', error);
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
};

const libraryRepository = new LibraryRepository();
export default libraryRepository;
