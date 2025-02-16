import axios from 'axios';

export class OpenAIRepository {
    async findSimilarTracks(track) {
        try {
            const response = await axios.get(`/api/openai/similar`, {
                params: {
                artist: track.artist,
                title: track.title
                }
            });

            return response.data.tracks.map((track) => ({...track, entry_type: 'requested'}));
        } catch (error) {
            console.error('Error fetching similar tracks:', error);
        }
    }
};

const openAIRepository = new OpenAIRepository();
export default openAIRepository;
