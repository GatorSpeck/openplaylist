import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { FaExternalLinkAlt } from "react-icons/fa";

export const SimilarTracksPopup = ({ x, y, tracks, onClose, onAddTracks }) => {
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
        <div className="similar-tracks-popup"
        onClick={e => e.stopPropagation()} // Stop clicks within popup from closing menu
        style={{
            position: 'fixed',
            left: position.x,
            top: position.y,
            zIndex: 1000,
            background: 'white',
            color: 'black',
            padding: '1rem',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            borderRadius: '4px',
            maxHeight: '80vh',
            overflowY: 'auto'
        }}
        >
        <h3>Similar Tracks</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
            {tracks.map((track, idx) => (
            <li key={idx} onClick={e => toggleTrack(e, idx)}
                style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                <input
                type="checkbox"
                checked={selectedTracks.has(idx)}
                style={{ marginRight: '0.5rem' }}
                readOnly
                />
                <span>{track.artist} - {track.title}{track.entry_type === "music_file" ? (<span> (in library)</span>) : null}</span>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
            <button
            onClick={handleAddSelected}
            disabled={selectedTracks.size === 0}
            style={{
                padding: '0.5rem 1rem',
                background: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: selectedTracks.size === 0 ? 'not-allowed' : 'pointer',
                opacity: selectedTracks.size === 0 ? 0.5 : 1
            }}
            >
            Add Selected ({selectedTracks.size})
            </button>
            <button onClick={onClose}>Close</button>
        </div>
        </div>
    );
};

export default SimilarTracksPopup;