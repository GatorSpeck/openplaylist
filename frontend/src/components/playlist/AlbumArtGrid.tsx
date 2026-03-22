export const AlbumArtGrid = ({artList}) => {
        const hasMultiple = artList.length > 1;

        const gridStyle = {
            width: '36px',
            height: '36px',
            display: 'grid',
            gridTemplateColumns: hasMultiple ? 'repeat(2, minmax(0, 1fr))' : '1fr',
            gridTemplateRows: hasMultiple ? 'repeat(2, minmax(0, 1fr))' : '1fr',
            overflow: 'hidden',
            borderRadius: '4px',
            flexShrink: 0,
        } as const;

    return (
                <div style={gridStyle}>
            {artList.slice(0, 4).map((art, index) => (
                                <div key={index} style={{ overflow: 'hidden' }}>
                                        <img
                                            src={art}
                                            alt="Album Art"
                                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                        />
                </div>
            ))}
        </div>
    );
}

export default AlbumArtGrid;