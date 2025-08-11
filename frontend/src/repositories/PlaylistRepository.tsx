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

    // Update getPlaylistEntries to support include_hidden parameter
    async getPlaylistEntries(playlistId: number, params: {
        filter?: string;
        sortCriteria?: string;
        sortDirection?: string;
        limit?: number;
        offset?: number;
        countOnly?: boolean;
        includeHidden?: boolean;
        randomSeed?: number;  // Add this parameter
    } = {}) {
        const queryParams = new URLSearchParams();
        
        if (params.filter) queryParams.append('filter', params.filter);
        if (params.sortCriteria) queryParams.append('sort_criteria', params.sortCriteria);
        if (params.sortDirection) queryParams.append('sort_direction', params.sortDirection);
        if (params.limit) queryParams.append('limit', params.limit.toString());
        if (params.offset) queryParams.append('offset', params.offset.toString());
        if (params.countOnly) queryParams.append('count_only', params.countOnly.toString());
        if (params.includeHidden) queryParams.append('include_hidden', params.includeHidden.toString());
        if (params.randomSeed !== undefined) queryParams.append('random_seed', params.randomSeed.toString());  // Add this line

        const response = await fetch(`/api/playlists/${playlistId}/filter?${queryParams}`);
        return response.json();
    }

    // Add method to hide entries
    async hideEntries(playlistId: number, entryIds: number[], hide: boolean = true) {
        const response = await fetch(`/api/playlists/${playlistId}/hide`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                entry_ids: entryIds,
                hide: hide
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to ${hide ? 'hide' : 'unhide'} entries`);
        }

        return response.json();
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
        await axios.get(`/api/playlists/${id}/sync`);
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

    async checkForDuplicates(id: number, tracks: PlaylistEntry[]) {
        const response = await axios.post(`/api/playlists/${id}/checkdups`, tracks);
        return response.data.map(e => new PlaylistEntry(e));
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

    async unlinkTrack(id: number, existingTrackID: number, newTrack: PlaylistEntry) {
        console.log(`Replacing track: ${existingTrackID} with new track`);
        await axios.put(`/api/playlists/${id}/links`, {
            track_id: existingTrackID,
            updates: {
                // Clear all external links to "unlink" the track
                last_fm_url: null,
                spotify_uri: null,
                youtube_url: null,
                mbid: null,
                plex_rating_key: null,
                local_path: null
            }
        });
    }

    async updateLinks(id: number, existingTrackID: number, newTrack: PlaylistEntry) {
        console.log(`Updating links for track: ${existingTrackID} with new track data`);

        let updates = {};
        if (newTrack.details.art_url) updates['art_url'] = newTrack.details.art_url;
        if (newTrack.details.last_fm_url) updates['last_fm_url'] = newTrack.details.last_fm_url;
        if (newTrack.details.spotify_uri) updates['spotify_uri'] = newTrack.details.spotify_uri;
        if (newTrack.details.youtube_url) updates['youtube_url'] = newTrack.details.youtube_url;
        if (newTrack.details.mbid) updates['mbid'] = newTrack.details.mbid;
        if (newTrack.details.plex_rating_key) updates['plex_rating_key'] = newTrack.details.plex_rating_key;

        await axios.put(`/api/playlists/${id}/links`, {
            track_id: existingTrackID,
            updates: updates
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
