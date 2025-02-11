import { useEffect, useState } from "react"
import lastFMRepository from "../../repositories/LastFMRepository";
import EntryTypeBadge from '../EntryTypeBadge';
import '../../styles/PlaylistGrid.css';

export const PlaylistEntryRow = ({track, isChecked, className}) => {
    const [imageUrl, setImageUrl] = useState(null);

    useEffect(() => {
        const fetchAlbumArt = async () => {
            const url = await lastFMRepository.fetchAlbumArt(track.artist, track.album);
            setImageUrl(url.image_url);
        }

        fetchAlbumArt();
    }, [track])

    return (
        <div className={className}>
            <div className="grid-cell">
                <input
                type="checkbox"
                checked={isChecked}
                readOnly
                />
            </div>
            <div className="grid-cell">
                <EntryTypeBadge type={track.entry_type} />
                <span>{track.order + 1}</span>
            </div>
            <div className="grid-cell">
                {imageUrl && <div><img style={{height: 40}} src={imageUrl}/></div>}
                <div>{track.artist || track.album_artist}</div>
                {track.album && <div><i>{track.album}</i></div>}
            </div>
            <div className="grid-cell"
            >
                {track.missing ? <s>{track.title}</s> : track.title}
            </div>
      </div>
    )
}

export default PlaylistEntryRow;