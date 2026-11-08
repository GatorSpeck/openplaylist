import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi } from 'vitest';

const { getSyncLog, resyncTrack } = vi.hoisted(() => ({ getSyncLog: vi.fn(), resyncTrack: vi.fn() }));
vi.mock('../../../repositories/PlaylistRepository', () => ({
  default: { getSyncLog, resyncTrack },
}));

import SyncLogModal from '../../../components/playlist/SyncLogModal';

const match = (level: string, needsReview: boolean, artistMatched: string) => ({
  match: {
    matched: true,
    score: needsReview ? 55 : 98,
    level,
    needs_review: needsReview,
    fields: {
      title: { target: 'Hurt', matched: 'Hurt', score: 100 },
      artist: { target: 'Johnny Cash', matched: artistMatched, score: needsReview ? 31 : 100 },
      album: { target: null, matched: null, score: null },
    },
  },
});

const baseEntry = { syncRunId: 1, playlistId: 7, target: 'plex', targetName: 'Mix', reason: 'New local track', createdAt: '2026-01-01T00:00:00Z' };

describe('SyncLogModal match confidence', () => {
  beforeEach(() => {
    getSyncLog.mockResolvedValue([
      { ...baseEntry, id: 1, eventKind: 'change', action: 'add', track: 'Johnny Cash - Hurt', success: true, metadata: { ...match('low', true, 'Nine Inch Nails'), music_file_id: 42 } },
      { ...baseEntry, id: 2, eventKind: 'change', action: 'add', track: 'Queen - Under Pressure', success: true, metadata: match('high', false, 'Johnny Cash') },
      { ...baseEntry, id: 3, eventKind: 'change', action: 'remove', track: 'Old - Track', success: true },
    ]);
  });

  test('flags low-confidence matches and filters to them', async () => {
    render(<SyncLogModal open onClose={() => {}} playlistId={7} playlistName="Mix" />);

    await waitFor(() => expect(screen.getAllByTestId('sync-log-entry')).toHaveLength(3));

    expect(screen.getByText('Low confidence')).toBeInTheDocument();
    expect(screen.getByText('High confidence')).toBeInTheDocument();
    // Comparison is only shown for the flagged match
    expect(screen.getByText('Nine Inch Nails')).toBeInTheDocument();
    expect(screen.getAllByText('Requested')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /Needs Review \(1\)/ }));

    const rows = screen.getAllByTestId('sync-log-entry');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText('Johnny Cash - Hurt')).toBeInTheDocument();
  });

  test('summarises review count from the latest sync result', async () => {
    render(
      <SyncLogModal
        open
        onClose={() => {}}
        playlistId={7}
        playlistName="Mix"
        syncResult={{
          status: 'success',
          synced: [],
          failed: [],
          summary: { total_targets: 1, successful: 1, failed: 0 },
          log: [
            { action: 'add', track: 'A - B', target: 'plex', reason: 'x', success: true, metadata: match('low', true, 'X') },
            { action: 'failed_match', track: 'C - D', target: 'plex', reason: 'x', success: false, eventKind: 'failed_match' },
            { action: 'add', track: 'E - F', target: 'plex', reason: 'x', success: true },
          ],
        }}
      />
    );

    await screen.findAllByTestId('sync-log-entry');
    const label = screen.getByText('Needs Review', { selector: 'span' });
    expect(label.previousSibling).toHaveTextContent('2');
  });

  test('resyncs a flagged track and reloads the log', async () => {
    resyncTrack.mockResolvedValue({ status: 'success' });
    render(<SyncLogModal open onClose={() => {}} playlistId={7} playlistName="Mix" />);

    await waitFor(() => expect(screen.getAllByTestId('sync-log-entry')).toHaveLength(3));
    // Only the flagged entry (which carries a music_file_id) offers a resync
    const buttons = screen.getAllByRole('button', { name: 'Resync track' });
    expect(buttons).toHaveLength(1);

    getSyncLog.mockClear();
    fireEvent.click(buttons[0]);

    await waitFor(() => expect(resyncTrack).toHaveBeenCalledWith(7, 42));
    await screen.findByText(/Resynced/);
    await waitFor(() => expect(getSyncLog).toHaveBeenCalled());
  });
});
