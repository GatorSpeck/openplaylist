import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { FaExternalLinkAlt } from "react-icons/fa";
import LibraryMusicIcon from '@mui/icons-material/LibraryMusic';
import PlaylistEntry from '../lib/PlaylistEntry';

interface SimilarTracksPopupProps {
    x: number;
    y: number;
    tracks: PlaylistEntry[];
    onClose: () => void;
    onAddTracks: (tracks: PlaylistEntry[]) => void;
}

export const SimilarTracksPopup: React.FC<SimilarTracksPopupProps> = ({ x, y, tracks, onClose, onAddTracks }) => {
    const [selectedTracks, setSelectedTracks] = useState(new Set());
    const [position, setPosition] = useState({ x, y });

    useEffect(() => {
        const popup = document.querySelector('.similar-tracks-popup');
        if (!popup) return;

        const rect = popup.getBoundingClientRect();
        const viewport = {
        width: window.innerWidth,
        height: window.innerHeight
        };

        let newY = y;
        let newX = x + 200;

        // Check vertical overflow
        if (y + rect.height > viewport.height) {
        newY = Math.max(0, viewport.height - rect.height);
        }

        // Check horizontal overflow
        if (x + 200 + rect.width > viewport.width) {
        newX = Math.max(0, x - rect.width);
        }

        setPosition({ x: newX, y: newY });
    }, [x, y]);

    const toggleTrack = (e, idx) => {
        e.stopPropagation(); // Stop event from bubbling up
        setSelectedTracks(prev => {
        const newSet = new Set(prev);
        if (newSet.has(idx)) {
            newSet.delete(idx);
        } else {
            newSet.add(idx);
        }
        return newSet;
        });
    };

    const handleAddSelected = () => {
        const tracksToAdd = tracks.filter((track, idx) => selectedTracks.has(idx));

        // for tracks that have linked music files, add as a music file instead of Last.fm
        let fixedUpTracks = tracksToAdd;
        fixedUpTracks.forEach((track) => {
        if (track.music_file_id) {
            track.entry_type = "music_file";
            track.id = track.music_file_id;

            track.path = ""; // need a dummy value here to make the backend happy
        }
        });

        onAddTracks(fixedUpTracks);
        setSelectedTracks(new Set());
        onClose();
    };

    return (
        <div
        className="similar-tracks-popup max-h-[80vh] overflow-y-auto rounded border border-border bg-surface p-4 text-text shadow-sm dark:border-border-dark dark:bg-surface-dark-elevated dark:text-text-dark"
        onClick={e => e.stopPropagation()} // Stop clicks within popup from closing menu
        style={{
            position: 'fixed',
            left: position.x,
            top: position.y,
            zIndex: 1000,
        }}
        >
        <h3 className="mb-2 text-base font-semibold">Similar Tracks</h3>
        <ul className="m-0 list-none p-0">
            {tracks.map((track, idx) => (
            <li key={idx} onClick={e => toggleTrack(e, idx)}
                className="mb-2 flex items-center">
                <input
                type="checkbox"
                checked={selectedTracks.has(idx)}
                className="mr-2"
                readOnly
                />
                <span>{track.getArtist()} - {track.getTitle()}{track.getPath() ? (<span>&nbsp;<LibraryMusicIcon /></span>) : null}</span>
                {track.url && (
                    <span>
                        &nbsp;
                        <a href={track.url} target="_blank" rel="noopener noreferrer">
                            <FaExternalLinkAlt />
                        </a>
                    </span>
                )}
            </li>
            ))}
        </ul>
        <div className="mt-4 flex justify-between gap-2">
            <button
            onClick={handleAddSelected}
            disabled={selectedTracks.size === 0}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-text-dark transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
            Add Selected ({selectedTracks.size})
            </button>
            <button onClick={onClose} className="rounded border border-border px-4 py-2 text-sm hover:bg-surface-subtle dark:border-border-dark dark:hover:bg-surface-dark">
              Close
            </button>
        </div>
        </div>
    );
};

export default SimilarTracksPopup;