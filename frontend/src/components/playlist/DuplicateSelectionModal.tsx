import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import PlaylistEntry from '../../lib/PlaylistEntry';
import '../../styles/DuplicateSelectionModal.css';

interface DuplicateSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    tracks: PlaylistEntry[];
    duplicates: PlaylistEntry[];
    onConfirm: (selectedTracks: PlaylistEntry[]) => void;
}

const DuplicateSelectionModal: React.FC<DuplicateSelectionModalProps> = ({
    isOpen,
    onClose,
    tracks,
    duplicates,
    onConfirm
}) => {
    const [selectedTracks, setSelectedTracks] = useState<Set<number>>(new Set());

    console.log('DuplicateSelectionModal render:', { isOpen, tracks: tracks.length, duplicates: duplicates.length });

    // Initialize selection state when modal opens
    useEffect(() => {
        if (isOpen && tracks.length > 0) {
            const duplicateIds = new Set(duplicates.map(dup => dup.id));
            const initialSelection = new Set(
                tracks
                    .filter(track => !duplicateIds.has(track.id)) // Non-duplicates default to checked
                    .map(track => track.id)
            );
            setSelectedTracks(initialSelection);
        }
    }, [isOpen, tracks, duplicates]);

    const toggleTrackSelection = (trackId: number) => {
        const newSelection = new Set(selectedTracks);
        if (newSelection.has(trackId)) {
            newSelection.delete(trackId);
        } else {
            newSelection.add(trackId);
        }
        setSelectedTracks(newSelection);
    };

    const handleSelectAll = () => {
        const allTrackIds = new Set(tracks.map(track => track.id));
        setSelectedTracks(allTrackIds);
    };

    const handleDeselectAll = () => {
        setSelectedTracks(new Set());
    };

    const handleConfirm = () => {
        const selected = tracks.filter(track => selectedTracks.has(track.id));
        onConfirm(selected);
        onClose();
    };

    const handleCancel = () => {
        onClose();
    };

    const isDuplicate = (track: PlaylistEntry) => {
        return duplicates.some(dup => dup.id === track.id);
    };

    const selectedCount = selectedTracks.size;
    const duplicateCount = duplicates.length;

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title="Select Tracks to Add"
        >
            <div className="duplicate-selection-content">
                <div className="duplicate-selection-header">
                    <p>
                        {duplicateCount > 0 && (
                            <span className="duplicate-warning">
                                ⚠️ {duplicateCount} potential duplicate{duplicateCount !== 1 ? 's' : ''} detected.
                            </span>
                        )}
                        <br />
                        Select which tracks you want to add to the playlist:
                    </p>
                    
                    <div className="selection-controls">
                        <button 
                            type="button" 
                            onClick={handleSelectAll}
                            className="btn-secondary"
                        >
                            Select All ({tracks.length})
                        </button>
                        <button 
                            type="button" 
                            onClick={handleDeselectAll}
                            className="btn-secondary"
                        >
                            Deselect All
                        </button>
                    </div>
                </div>

                <div className="track-selection-list">
                    {tracks.map((track) => {
                        const isSelected = selectedTracks.has(track.id);
                        const duplicate = isDuplicate(track);
                        
                        return (
                            <div
                                key={track.id}
                                className={`track-item ${duplicate ? 'duplicate' : ''} ${isSelected ? 'selected' : ''}`}
                                onClick={() => toggleTrackSelection(track.id)}
                            >
                                <div className="track-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleTrackSelection(track.id)}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                </div>
                                
                                <div className="track-info">
                                    <div className="track-title">
                                        {track.getTitle()}
                                        {duplicate && <span className="duplicate-badge">Duplicate</span>}
                                    </div>
                                    <div className="track-artist">
                                        {track.getArtist()} {track.getAlbum() && `- ${track.getAlbum()}`}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="duplicate-selection-footer">
                    <div className="selection-summary">
                        {selectedCount} of {tracks.length} tracks selected
                    </div>
                    
                    <div className="modal-buttons">
                        <button
                            type="button"
                            onClick={handleCancel}
                            className="btn-secondary"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirm}
                            className="btn-primary"
                            disabled={selectedCount === 0}
                        >
                            Add Selected Tracks ({selectedCount})
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default DuplicateSelectionModal;