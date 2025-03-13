import axios from 'axios';

export class PlaylistRepository {
    async getPlaylistDetails(playlistID) {
        try {
            const data = (await axios.get(`/api/playlists/${playlistID}/details`)).data;

            return data;
        } catch (error) {
            console.error('Error fetching playlist details:', error);
        }
    }

    async getPlaylistEntries(playlistID, filter) {
        try {
            const response = await axios.get(`/api/playlists/${playlistID}/entries`, {
                params: {
                    ...filter
                }
            });

            return response.data;
        } catch (error) {
            console.error('Error fetching playlist entries:', error);
        }
    }

    // get playlist names and IDs
    async getPlaylists() {
        try {
            const response = await axios.get(`/api/playlists`);
            return response.data;
        } catch (error) {
            console.error('Error fetching playlists:', error);
        }
    }

    async deletePlaylist(id) {
        try {
            await axios.delete(`/api/playlists/${id}`);
        } catch (error) {
            console.error('Error deleting playlist:', error);
        }
    }

    async create(name) {
        return await axios.post(`/api/playlists`, {
            name: name,
            entries: []
        });
    }

    async updateEntries(id, entries) {
        try {
            return await axios.put(`/api/playlists/${id}`, {
                entries: entries,
                name: ''
            });
        }
        catch (error) {
            console.error('Error updating playlist entries:', error);
        }
    }

    async rename(id, name) {
        await axios.post(`/api/playlists/rename/${id}`, { new_name: name, description: "" });
    }

    async export(id, type) {
        if (type == 'm3u') {}
        else if (type == "json") {}
        else {
            window.alert('Invalid export type:', type);
            return;
        }

        try {
            const { name } = (await this.getPlaylists()).find(playlist => playlist.id === id);

            const response = await axios.get(`/api/playlists/${id}/export?type=${type}`, {
                responseType: 'blob'
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${name}.${type}`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error('Error exporting playlist:', error);
        }
    }

    async syncToPlex(id) {
        await axios.get(`/api/playlists/${id}/synctoplex`);
    }

    async clone(fromID, toName) {
        const fromPlaylist = this.getPlaylistDetails(fromID);

        let newPlaylist = await(this.create(toName));

        return this.updateEntries(newPlaylist.data.id, fromPlaylist.entries);
    }

    async dumpLibrary(id) {
        await axios.get(`/api/testing/dumpLibrary/${id}`);

        return this.getPlaylistDetails(id);
    }

    async addTracks(id, tracks, undo) {
        await axios.post(`/api/playlists/${id}/add`,
            tracks, {
                params: {
                    "undo": undo
                }
            }
        );
    }

    async removeTracks(id, tracks, undo) {
        await axios.post(`/api/playlists/${id}/remove`, 
            tracks, {params: {"undo": undo}});
    }

    async reorderTracks(id, tracks, position, undo) {
        const positions = tracks.map(track => track.order);
        
        await axios.post(
            `/api/playlists/${id}/reorder?new_position=${position}`, // Add position as query param
            positions, // Send positions array directly as body
            {
                params: {
                    undo: undo || false
                }
            }
        );
    }

    async replaceTrack(id, existingTrackID, newTrack) {
        console.log(`Replacing track: ${existingTrackID} with new track`);
        await axios.put(`/api/playlists/${id}/replace`, {
            existing_track_id: existingTrackID,
            new_track: newTrack
        });
    }

    async getArtGrid(id) {
        try {
            const results = (await axios.get(`/api/playlists/${id}/artgrid`)).data;
            return results;
        }
        catch (error) {
            console.error('Error fetching art grid:', error);
        }
    }
};

const playlistRepository = new PlaylistRepository();
export default playlistRepository;
