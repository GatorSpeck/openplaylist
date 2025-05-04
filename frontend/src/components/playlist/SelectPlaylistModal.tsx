import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import playlistRepository from '../../repositories/PlaylistRepository';
import '../../styles/SelectPlaylistModal.css'; // You may need to create this CSS file

const SelectPlaylistModal = ({ isOpen, onClose, selectedEntries, setSnackbar }) => {
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

            onClose();
        } catch (error) {
            console.error('Error adding tracks to playlist:', error);
            setLoading(false);
        }
    };

    return (
        <Modal open={isOpen} onClose={onClose} title="Add to playlist...">
            <div className="playlist-select-container">
                <div className="playlist-search">
                    <input
                        type="text"
                        placeholder="Search playlists..."
                        value={filter}
                        onChange={handleFilterChange}
                        className="playlist-filter-input"
                    />
                </div>
                
                {loading ? (
                    <div className="loading-spinner">Loading playlists...</div>
                ) : (
                    <div className="playlist-list">
                        {filteredPlaylists.length === 0 ? (
                            <div className="no-playlists">
                                No playlists found. Try another search or create a new playlist.
                            </div>
                        ) : (
                            filteredPlaylists.map(playlist => (
                                <div 
                                    key={playlist.id} 
                                    className="playlist-item"
                                    onClick={() => handlePlaylistSelect(playlist.id)}
                                >
                                    <div className="playlist-name">{playlist.name}</div>
                                </div>
                            ))
                        )}
                    </div>
                )}
                
                <div className="modal-footer">
                    <button 
                        type="button" 
                        onClick={onClose} 
                        className="cancel-button"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default SelectPlaylistModal;