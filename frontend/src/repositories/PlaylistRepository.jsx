import axios from 'axios';

export class PlaylistRepository {
    async getPlaylistDetails(playlistID) {
        try {
            const count = (await axios.get(`/api/playlists/${playlistID}/count`)).data.count;

            let response = null;
            
            let firstRun = true;

            while (firstRun || (response.entries.length < count)) {
                const offset = firstRun ? 0 : response.entries.length;
                const chunk = await axios.get(`/api/playlists/${playlistID}?limit=100&offset=${offset}`, {
                });

                if (!response) {
                    response = chunk.data;
                }
                else {
                    response.entries = response.entries.concat(chunk.data.entries);
                }

                firstRun = false;
            }

            return response;
        } catch (error) {
            console.error('Error fetching playlist details:', error);
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

    async export(id) {
        try {
            const response = await axios.get(`/api/playlists/${id}/export`, {
                responseType: 'blob'
            }).data;

              const url = window.URL.createObjectURL(new Blob([response]));
              const link = document.createElement('a');
              link.href = url;
              link.setAttribute('download', `${name}.m3u`);
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
};

const playlistRepository = new PlaylistRepository();
export default playlistRepository;
