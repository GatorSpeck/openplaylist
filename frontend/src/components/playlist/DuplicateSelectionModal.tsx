import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import PlaylistEntry from '../../lib/PlaylistEntry';

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
            <div className="flex max-h-[65vh] flex-col">
                <div className="shrink-0 border-b border-border pb-4 dark:border-border-dark">
                    <p className="m-0 text-sm text-text dark:text-text-dark">
                        {duplicateCount > 0 && (
                            <span className="mb-2 block font-semibold text-amber-700 dark:text-amber-300">
                                ⚠️ {duplicateCount} potential duplicate{duplicateCount !== 1 ? 's' : ''} detected.
                            </span>
                        )}
                        <br />
                        Select which tracks you want to add to the playlist:
                    </p>
                    
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button 
                            type="button" 
                            onClick={handleSelectAll}
                            className="rounded border border-border bg-surface-subtle px-3 py-1.5 text-sm font-medium text-text transition hover:bg-surface-muted dark:border-border-dark dark:bg-surface-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated"
                        >
                            Select All ({tracks.length})
                        </button>
                        <button 
                            type="button" 
                            onClick={handleDeselectAll}
                            className="rounded border border-border bg-surface-subtle px-3 py-1.5 text-sm font-medium text-text transition hover:bg-surface-muted dark:border-border-dark dark:bg-surface-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated"
                        >
                            Deselect All
                        </button>
                    </div>
                </div>

                <div className="my-2 flex-1 overflow-y-auto">
                    {tracks.map((track) => {
                        const isSelected = selectedTracks.has(track.id);
                        const duplicate = isDuplicate(track);
                        
                        return (
                            <div
                                key={track.id}
                                className={`flex cursor-pointer items-center gap-3 border-b px-1 py-3 transition ${duplicate ? 'border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-900/20' : ''} ${isSelected ? 'bg-sky-100 dark:bg-sky-900/30' : 'border-border dark:border-border-dark'} hover:bg-surface-subtle dark:hover:bg-surface-dark-elevated`}
                                onClick={() => toggleTrackSelection(track.id)}
                            >
                                <div className="shrink-0">
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleTrackSelection(track.id)}
                                        onClick={(e) => e.stopPropagation()}
                                        className="h-4 w-4 cursor-pointer"
                                    />
                                </div>
                                
                                <div className="min-w-0 flex-1">
                                    <div className="mb-1 flex items-center gap-2 text-sm font-medium text-text dark:text-text-dark">
                                        {track.getTitle()}
                                        {duplicate && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-dark">Duplicate</span>}
                                    </div>
                                    <div className="truncate text-xs text-text/70 dark:text-text-dark/70">
                                        {track.getArtist()} {track.getAlbum() && `- ${track.getAlbum()}`}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-3 flex shrink-0 flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-border-dark">
                    <div className="text-sm font-medium text-text/75 dark:text-text-dark/75">
                        {selectedCount} of {tracks.length} tracks selected
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={handleCancel}
                            className="rounded border border-border bg-surface-subtle px-4 py-2 text-sm font-medium text-text transition hover:bg-surface-muted dark:border-border-dark dark:bg-surface-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirm}
                            className="rounded bg-accent px-4 py-2 text-sm font-semibold text-text-dark transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-dark/70 dark:disabled:bg-surface-dark-elevated"
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