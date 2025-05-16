import axios from 'axios';
import PlaylistEntry, { PlaylistEntryStub } from '../lib/PlaylistEntry';

interface PlaylistFilter {
    filter?: String,
    sortCriteria?: String,
    sortDirection?: String,
    limit?: number,
    offset?: number,
    countOnly?: Boolean
};

export class PlaylistRepository {
    async getPlaylistDetails(playlistID: number) {
        try {
            const data = (await axios.get(`/api/playlists/${playlistID}/details`)).data;

            return data;
        } catch (error) {
            console.error('Error fetching playlist details:', error);
        }
    }

    async getPlaylistEntries(playlistID: number, filter: PlaylistFilter) {
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
            const response = await axios.get(`/api/playlists/`);
            return response.data;
        } catch (error) {
            console.error('Error fetching playlists:', error);
        }
    }

    async deletePlaylist(id: number) {
        try {
            await axios.delete(`/api/playlists/${id}`);
        } catch (error) {
            console.error('Error deleting playlist:', error);
        }
    }

    async create(name: String) {
        return await axios.post(`/api/playlists/`, {
            name: name,
            entries: []
        });
    }

    async updateEntries(id: number, entries: PlaylistEntry[]) {
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

    async rename(id: number, name: String) {
        await axios.post(`/api/playlists/rename/${id}`, { new_name: name, description: "" });
    }

    async export(id: number, type: String) {
        if (type == 'm3u') {}
        else if (type == "json") {}
        else {
            window.alert(`Invalid export type: ${type}`);
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

    async syncToPlex(id: number) {
        await axios.get(`/api/playlists/${id}/synctoplex`);
    }

    async clone(fromID: number, toName: String) {
        const fromPlaylist = await this.getPlaylistDetails(fromID);

        let newPlaylist = await(this.create(toName));

        return this.updateEntries(newPlaylist.data.id, fromPlaylist.entries);
    }

    async dumpLibrary(id: number) {
        await axios.get(`/api/testing/dumpLibrary/${id}`);

        return this.getPlaylistDetails(id);
    }

    async addTracks(id: number, tracks: PlaylistEntry[], undo: Boolean) {
        await axios.post(`/api/playlists/${id}/add`,
            tracks, {
                params: {
                    "undo": undo
                }
            }
        );
    }

    async removeTracks(id: number, tracks: PlaylistEntry[], undo: Boolean) {
        await axios.post(`/api/playlists/${id}/remove`, 
            tracks, {params: {"undo": undo}});
    }

    async reorderTracks(id: number, tracks: PlaylistEntryStub[], position: number, undo: Boolean) {
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

    async replaceTrack(id: number, existingTrackID: number, newTrack: PlaylistEntry) {
        console.log(`Replacing track: ${existingTrackID} with new track`);
        await axios.put(`/api/playlists/${id}/replace`, {
            existing_track_id: existingTrackID,
            new_track: newTrack
        });
    }

    async getArtGrid(id: number) {
        try {
            const results = (await axios.get(`/api/playlists/${id}/artgrid`)).data;
            return results;
        }
        catch (error) {
            console.error('Error fetching art grid:', error);
        }
    }

    async getPlaylistsByTrack(trackID: number) {
        try {
            const response = await axios.get(`/api/playlists/listbytrack/${trackID}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching playlists by track:', error);
        }
    }
    
    async togglePin(id: number) {
        const playlists = await this.getPlaylists();

        const pinned = !playlists.find(p => p.id === id).pinned;

        await axios.put(`/api/playlists/${id}/updatepin?pin=${pinned}`);

        return this.getPlaylists();
    }

    async reorderPinnedPlaylist(id: number, position: number) {
        await axios.put(`/api/playlists/${id}/reorderpinned`, { position: position });

        return this.getPlaylists();
    }
};

const playlistRepository = new PlaylistRepository();
export default playlistRepository;
