import '../../styles/AlbumArtGrid.css';

export const AlbumArtGrid = ({artList}) => {
    let gridClass = "grid1x1";
    if (artList.length > 1) {
        gridClass = "grid2x2";
    }
    else if (artList.length > 4) {
        gridClass = "grid3x3";
    }

    return (
        <div className={gridClass}>
            {artList.map((art, index) => (
                <div key={index} className="album-art" style={{ borderRadius: 0 }}>
                    <img src={art} alt="Album Art" />
                </div>
            ))}
        </div>
    );
}

export default AlbumArtGrid;