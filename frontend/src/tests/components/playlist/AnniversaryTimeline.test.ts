import { describe, expect, it } from 'vitest';
import {
  buildCarouselColumns,
  buildDateRange,
  getAnniversaryBadgeMeta,
  mergeAnniversaryGroups,
  sortAnniversaryGroups,
  sortAnniversariesWithinDate,
} from '../../../components/playlist/anniversaryTimelineUtils';

const buildAnniversary = (date: string, id: number, originalReleaseDate = '2000-01-01') => ({
  id,
  album: `Album ${id}`,
  artist: `Artist ${id}`,
  original_release_date: originalReleaseDate,
  anniversary_date: date,
  years_since_release: 1,
});

describe('AnniversaryTimeline windowing', () => {
  it('sorts date groups chronologically and merges incoming batches without dropping items', () => {
    const merged = mergeAnniversaryGroups(
      [buildAnniversary('2026-06-14', 3), buildAnniversary('2026-06-15', 4)],
      [
        buildAnniversary('2026-06-12', 1),
        buildAnniversary('2026-06-13', 2),
        buildAnniversary('2026-06-15', 4),
        buildAnniversary('2026-06-16', 5),
      ],
      'past'
    );

    expect(merged.map(item => item.anniversary_date)).toEqual([
      '2026-06-12',
      '2026-06-13',
      '2026-06-14',
      '2026-06-15',
      '2026-06-16',
    ]);

    expect(merged.map(item => item.id)).toEqual([1, 2, 3, 4, 5]);

    const sortedGroups = sortAnniversaryGroups(merged);
    expect(sortedGroups.map(([date]) => date)).toEqual([
      '2026-06-12',
      '2026-06-13',
      '2026-06-14',
      '2026-06-15',
      '2026-06-16',
    ]);
  });

  it('builds a fixed date range with empty columns preserved', () => {
    const columns = buildCarouselColumns(new Date('2026-06-13T00:00:00'), new Date('2026-06-15T00:00:00'), [
      buildAnniversary('2026-06-14', 2),
    ]);

    expect(columns.map((column) => column.date)).toEqual([
      '2026-06-13',
      '2026-06-14',
      '2026-06-15',
    ]);
    expect(columns[0]?.anniversaries).toHaveLength(0);
    expect(columns[1]?.anniversaries.map((anniversary) => anniversary.id)).toEqual([2]);
  });

  it('sorts anniversaries within a date by original release date', () => {
    const sorted = sortAnniversariesWithinDate([
      { ...buildAnniversary('2026-06-14', 3), original_release_date: '2004-01-01' },
      { ...buildAnniversary('2026-06-14', 4), original_release_date: '2001-01-01' },
    ]);

    expect(sorted.map((item) => item.id)).toEqual([4, 3]);
  });

  it('provides the expected anniversary badge styles', () => {
    expect(getAnniversaryBadgeMeta(0).title).toBe('New release anniversary');
    expect(getAnniversaryBadgeMeta(5).title).toBe('Silver milestone anniversary');
    expect(getAnniversaryBadgeMeta(10).title).toBe('Gold milestone anniversary');
    expect(getAnniversaryBadgeMeta(25).title).toBe('Gold milestone anniversary');
    expect(getAnniversaryBadgeMeta(2).title).toBe('Bronze anniversary');
  });

  it('builds inclusive date ranges', () => {
    expect(buildDateRange(new Date('2026-06-13T00:00:00'), new Date('2026-06-15T00:00:00'))).toEqual([
      '2026-06-13',
      '2026-06-14',
      '2026-06-15',
    ]);
  });
});
