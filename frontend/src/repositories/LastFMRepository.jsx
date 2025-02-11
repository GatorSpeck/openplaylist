import axios from 'axios';

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
};

const lastFMRepository = new LastFMRepository();
export default lastFMRepository;
