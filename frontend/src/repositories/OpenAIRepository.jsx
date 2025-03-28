import axios from 'axios';

export class OpenAIRepository {
    async isConfigured() {
        try {
            const response = await axios.get('/api/settings');
            return response.data.openAiApiKeyConfigured ? true : false;
        } catch (error) {
            console.error('Error checking OpenAI configuration:', error);
            return false;
        }
    }

    async findSimilarTracks(track) {
        if (!this.isConfigured()) {
            console.error('OpenAI is not configured.');
            return [];
        }

        const title = track.getTitle();
        const artist = track.getArtist();

        if (!title || !artist) {
            console.error('Track title or artist is missing.');
            return [];
        }

        try {
            // Fix: Manually encode the parameters in the URL
            const encodedArtist = encodeURIComponent(artist);
            const encodedTitle = encodeURIComponent(title);
            
            const response = await axios.get(
                `/api/openai/similar?artist=${encodedArtist}&title=${encodedTitle}`
            );

            return response.data.tracks.map((track) => ({...track, entry_type: 'requested'}));
        } catch (error) {
            console.error('Error fetching similar tracks:', error);
            return []; // Return empty array on error
        }
    }
};

const openAIRepository = new OpenAIRepository();
export default openAIRepository;
