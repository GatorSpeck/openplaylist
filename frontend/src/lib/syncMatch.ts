// Match-confidence payload the backend attaches to sync log events as `metadata.match`
// (see backend/lib/match.py get_match_confidence / no_match_confidence).

export type SyncMatchLevel = 'high' | 'medium' | 'low' | 'none';

export interface SyncMatchField {
  target?: string | null;
  matched?: string | null;
  score?: number | null;
}

export interface SyncMatchConfidence {
  matched: boolean;
  score: number;
  level: SyncMatchLevel;
  needs_review: boolean;
  fields: {
    title: SyncMatchField;
    artist: SyncMatchField;
    album: SyncMatchField;
  };
}

export const getSyncMatch = (entry: { metadata?: Record<string, any> | null }): SyncMatchConfidence | null => {
  const match = entry?.metadata?.match;
  if (!match || typeof match !== 'object' || typeof match.level !== 'string') {
    return null;
  }
  return match as SyncMatchConfidence;
};

export const needsReview = (entry: { metadata?: Record<string, any> | null }): boolean => {
  return Boolean(getSyncMatch(entry)?.needs_review);
};

export const SYNC_MATCH_LEVEL_LABELS: Record<SyncMatchLevel, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
  none: 'No match',
};
