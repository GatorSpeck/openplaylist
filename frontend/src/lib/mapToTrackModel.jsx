const mapToTrackModel = (item) => {
    const detailsToUse = item.details || item;
    return {
        ...item,
        id: detailsToUse.id,
        title: detailsToUse.title || null,
        artist: detailsToUse.artist || null,
        album: detailsToUse.album || null,
        album_artist: detailsToUse.album_artist || null,
        year: detailsToUse.year || null,
        length: detailsToUse.length || 0,
        genres: detailsToUse.genres || [],
        path: detailsToUse.path,
        publisher: detailsToUse.publisher || null,
        kind: detailsToUse.kind,
        music_file_id: item.music_file_id || null,
        entry_type: item.entry_type,
        order: item.order || 0,
        missing: detailsToUse.missing || false
    }
};

export default mapToTrackModel;