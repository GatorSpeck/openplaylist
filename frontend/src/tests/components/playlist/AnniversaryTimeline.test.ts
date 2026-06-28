import { describe, expect, it } from 'vitest';
import { mergeAnniversaryGroups, sortAnniversaryGroups } from '../../../components/playlist/anniversaryTimelineUtils';

const buildAnniversary = (date: string, id: number) => ({
  id,
  album: `Album ${id}`,
  artist: `Artist ${id}`,
  original_release_date: '2000-01-01',
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
});
