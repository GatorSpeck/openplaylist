import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import playlistRepository from '../../repositories/PlaylistRepository';

const SelectPlaylistModal = ({ isOpen, onClose, selectedEntries, setSnackbar, onSuccess }) => {
    const [playlists, setPlaylists] = useState([]);
    const [filteredPlaylists, setFilteredPlaylists] = useState([]);
    const [filter, setFilter] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setLoading(true);
            playlistRepository.getPlaylists()
                .then(data => {
                    setPlaylists(data);
                    setFilteredPlaylists(data);
                    setLoading(false);
                })
                .catch(error => {
                    console.error('Error fetching playlists:', error);
                    setLoading(false);
                });
        }
    }, [isOpen]);

    // Filter playlists based on search input
    useEffect(() => {
        if (filter) {
            const filtered = playlists.filter(playlist => 
                playlist.name.toLowerCase().includes(filter.toLowerCase())
            );
            setFilteredPlaylists(filtered);
        } else {
            setFilteredPlaylists(playlists);
        }
    }, [filter, playlists]);

    const handleFilterChange = (e) => {
        setFilter(e.target.value);
    };

    const handlePlaylistSelect = async (playlistId) => {
        setLoading(true);
        try {
            await playlistRepository.addTracks(playlistId, selectedEntries, false);

            setSnackbar({
                message: 'Tracks added to playlist successfully!',
                severity: 'success',
                open: true,
            });

            onSuccess?.();
            onClose();
        } catch (error) {
            console.error('Error adding tracks to playlist:', error);
            setLoading(false);
        }
    };

    return (
        <Modal open={isOpen} onClose={onClose} title="Add to playlist...">
            <div className="flex max-h-[500px] flex-col">
                <div className="mb-4">
                    <input
                        type="text"
                        placeholder="Search playlists..."
                        value={filter}
                        onChange={handleFilterChange}
                        className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-border-dark dark:bg-surface-dark dark:text-text-dark"
                    />
                </div>
                
                {loading ? (
                    <div className="py-8 text-center text-sm text-text/80 dark:text-text-dark/80">Loading playlists...</div>
                ) : (
                    <div className="max-h-[350px] overflow-y-auto rounded border border-border dark:border-border-dark">
                        {filteredPlaylists.length === 0 ? (
                            <div className="px-4 py-8 text-center text-sm text-text/70 dark:text-text-dark/70">
                                No playlists found. Try another search or create a new playlist.
                            </div>
                        ) : (
                            filteredPlaylists.map(playlist => (
                                <div 
                                    key={playlist.id} 
                                    className="cursor-pointer border-b border-border px-4 py-3 transition hover:bg-surface-subtle dark:border-border-dark dark:hover:bg-surface-dark-elevated"
                                    onClick={() => handlePlaylistSelect(playlist.id)}
                                >
                                    <div className="text-sm font-medium text-text dark:text-text-dark">{playlist.name}</div>
                                </div>
                            ))
                        )}
                    </div>
                )}
                
                <div className="mt-4 flex justify-end">
                    <button 
                        type="button" 
                        onClick={onClose} 
                        className="rounded border border-border bg-surface-subtle px-4 py-2 text-sm font-medium text-text transition hover:bg-surface-muted dark:border-border-dark dark:bg-surface-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default SelectPlaylistModal;