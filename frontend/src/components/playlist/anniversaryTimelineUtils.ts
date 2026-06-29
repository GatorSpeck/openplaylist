export interface Anniversary {
  id: number;
  album: string;
  artist: string;
  original_release_date: string;
  anniversary_date: string;
  years_since_release: number;
  art_url?: string;
}

export interface AnniversaryColumn {
  date: string;
  anniversaries: Anniversary[];
}

export const parseDateKey = (dateString: string) => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatShortDate = (dateString: string) => {
  const date = parseDateKey(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
};

export const formatFullDate = (dateString: string) => {
  const date = parseDateKey(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

export const buildDateRange = (start: Date, end: Date) => {
  const dates: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const lastDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  while (cursor <= lastDate) {
    dates.push(formatDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
};

export const sortAnniversariesWithinDate = <T extends Pick<Anniversary, 'artist' | 'album' | 'original_release_date'>>(
  items: T[]
) => {
  return [...items].sort((a, b) => {
    const releaseDelta = parseDateKey(a.original_release_date).getTime() - parseDateKey(b.original_release_date).getTime();
    if (releaseDelta !== 0) {
      return releaseDelta;
    }

    const artistDelta = a.artist.localeCompare(b.artist);
    if (artistDelta !== 0) {
      return artistDelta;
    }

    return a.album.localeCompare(b.album);
  });
};

export const groupAnniversariesByDate = (items: Anniversary[]) => {
  const grouped: Record<string, Anniversary[]> = {};

  items.forEach((item) => {
    if (!grouped[item.anniversary_date]) {
      grouped[item.anniversary_date] = [];
    }

    grouped[item.anniversary_date].push(item);
  });

  Object.keys(grouped).forEach((date) => {
    grouped[date] = sortAnniversariesWithinDate(grouped[date]);
  });

  return grouped;
};

export const buildCarouselColumns = (start: Date, end: Date, items: Anniversary[]): AnniversaryColumn[] => {
  const grouped = groupAnniversariesByDate(items);

  return buildDateRange(start, end).map((date) => ({
    date,
    anniversaries: grouped[date] ?? [],
  }));
};

const compareAnniversaryAlbums = (left: Anniversary, right: Anniversary) => {
  const releaseDelta = parseDateKey(left.original_release_date).getTime() - parseDateKey(right.original_release_date).getTime();
  if (releaseDelta !== 0) {
    return releaseDelta;
  }

  const artistDelta = left.artist.localeCompare(right.artist);
  if (artistDelta !== 0) {
    return artistDelta;
  }

  const albumDelta = left.album.localeCompare(right.album);
  if (albumDelta !== 0) {
    return albumDelta;
  }

  return left.id - right.id;
};

export const sortAnniversaryGroups = <T extends { anniversary_date: string; original_release_date: string; artist: string; album: string; id: number }>(items: T[]) => {
  const grouped: Record<string, T[]> = {};

  items.forEach(item => {
    const date = item.anniversary_date;
    if (!grouped[date]) {
      grouped[date] = [];
    }
    grouped[date].push(item);
  });

  return Object.entries(grouped)
    .sort(([a], [b]) => parseDateKey(a).getTime() - parseDateKey(b).getTime())
    .map(([date, groupItems]) => [date, [...groupItems].sort(compareAnniversaryAlbums as (left: T, right: T) => number)] as [string, T[]]);
};

export const flattenAnniversaryGroups = <T>(groups: Array<[string, T[]]>) =>
  groups.flatMap(([, groupItems]) => groupItems);

export const mergeAnniversaryGroups = <T extends { id: number; anniversary_date: string; original_release_date: string; artist: string; album: string }>(
  existing: T[],
  incoming: T[],
  direction: 'past' | 'future',
) => {
  const combined = direction === 'past' ? [...incoming, ...existing] : [...existing, ...incoming];
  const unique = combined.filter((item, index, self) =>
    index === self.findIndex(candidate => candidate.id === item.id && candidate.anniversary_date === item.anniversary_date)
  );

  return flattenAnniversaryGroups(sortAnniversaryGroups(unique));
};

export function getAnniversaryBadgeMeta(years: number): { className: string; marker: string; title: string } {
  if (years === 0) {
    return {
      className: 'inline-flex w-fit items-center rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-emerald-300/70 shadow-sm',
      marker: '●',
      title: 'New release anniversary',
    };
  }

  if (years === 5) {
    return {
      className: 'inline-flex w-fit items-center rounded-full bg-gradient-to-r from-slate-200 via-slate-300 to-slate-400 px-2.5 py-1 text-[11px] font-semibold text-slate-900 ring-1 ring-slate-200/80 shadow-sm',
      marker: '🥈',
      title: 'Silver milestone anniversary',
    };
  }

  if (years === 10 || years === 25) {
    return {
      className: 'inline-flex w-fit items-center rounded-full bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 px-2.5 py-1 text-[11px] font-semibold text-amber-950 ring-1 ring-amber-200/90 shadow-sm',
      marker: '🥇',
      title: 'Gold milestone anniversary',
    };
  }

  return {
    className: 'inline-flex w-fit items-center rounded-full bg-gradient-to-r from-amber-700 via-orange-600 to-amber-800 px-2.5 py-1 text-[11px] font-semibold text-amber-50 ring-1 ring-amber-500/50 shadow-sm',
    marker: '🥉',
    title: 'Bronze anniversary',
  };
}
