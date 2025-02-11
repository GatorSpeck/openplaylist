import axios from 'axios';

export class PlaylistRepository {
    async getPlaylistDetails(playlistID, limit = null, offset = null) {
        try {
            const response = await axios.get(`/api/playlists/${playlistID}`, { limit: limit, offset: offset });

            return response.data;
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
};

const playlistRepository = new PlaylistRepository();
export default playlistRepository;
