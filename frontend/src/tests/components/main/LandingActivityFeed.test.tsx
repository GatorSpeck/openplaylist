import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi } from 'vitest';
import LandingActivityFeed from '../../../components/main/LandingActivityFeed';

describe('LandingActivityFeed', () => {
  test('renders entries and triggers quick add', () => {
    const onQuickAdd = vi.fn();

    render(
      <LandingActivityFeed
        title="Last.fm activity"
        description="Recent imported activity"
        entries={[
          {
            id: 1,
            entry_type: 'lastfm',
            date_added: '2026-01-01T12:00:00Z',
            playlist_name: 'Inbox',
            title: 'Song Title',
            artist: 'Artist Name',
            album: 'Album Name',
            notes: 'Imported from Last.fm',
            details: { title: 'Song Title', artist: 'Artist Name', album: 'Album Name' },
          },
        ]}
        emptyMessage="No activity"
        onQuickAdd={onQuickAdd}
        quickAddLabel="Add to playlist"
      />
    );

    expect(screen.getByText('Song Title')).toBeInTheDocument();
    expect(screen.getByText('Artist Name • Album Name')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add to playlist' }));

    expect(onQuickAdd).toHaveBeenCalledTimes(1);
    expect(onQuickAdd.mock.calls[0][0]).toMatchObject({
      id: 1,
      entry_type: 'lastfm',
      playlist_name: 'Inbox',
    });
  });

  test('renders the empty state when no entries are available', () => {
    render(
      <LandingActivityFeed
        title="OpenPlaylist activity"
        description="Recent library activity"
        entries={[]}
        emptyMessage="No recent activity yet."
      />
    );

    expect(screen.getByText('No recent activity yet.')).toBeInTheDocument();
  });
});