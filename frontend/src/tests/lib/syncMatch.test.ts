import { getSyncMatch, needsReview } from '../../lib/syncMatch';

describe('syncMatch helpers', () => {
  test('reads match payload from log metadata', () => {
    const entry = { metadata: { match: { matched: true, score: 40, level: 'low', needs_review: true, fields: {} } } };
    expect(getSyncMatch(entry)?.level).toBe('low');
    expect(needsReview(entry)).toBe(true);
  });

  test('tolerates entries without match metadata', () => {
    expect(getSyncMatch({})).toBeNull();
    expect(getSyncMatch({ metadata: { source: 'remote' } })).toBeNull();
    expect(needsReview({ metadata: null })).toBe(false);
  });
});
