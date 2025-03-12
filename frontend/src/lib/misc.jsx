import moment from 'moment';

export const formatDuration = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

export const formatSize = (bytes) => {
    const kb = Math.floor(bytes / 1024);
    const mb = Math.floor(kb / 1024);
    const gb = Math.floor(mb / 1024);

    if (gb > 1) {
        return `${gb} GB`;
    } else if (mb > 1) {
        return `${mb} MB`;
    } else if (kb > 1) {
        return `${kb} KB`;
    } else {
        return `${bytes} B`;
    }
}

export const formatDate = (date, fmt) => {
    const m = moment(date);
    if (!m.isValid()) return null;

    const dateAdded = m.format(fmt);
    const relative = m.fromNow();
    return `${dateAdded} (${relative})`;
}

export default { formatDuration, formatSize, formatDate };