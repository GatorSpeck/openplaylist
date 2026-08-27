import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import LandingStatsSummary from '../../../components/main/LandingStatsSummary';

describe('LandingStatsSummary', () => {
  test('renders the core collection counts', () => {
    render(
      <LandingStatsSummary
        stats={{
          trackCount: 128,
          artistCount: 32,
          albumCount: 17,
        }}
      />
    );

    expect(screen.getByText('128')).toBeInTheDocument();
    expect(screen.getByText('32')).toBeInTheDocument();
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(screen.getByText('Tracks')).toBeInTheDocument();
    expect(screen.getByText('Artists')).toBeInTheDocument();
    expect(screen.getByText('Albums')).toBeInTheDocument();
  });

  test('shows loading placeholders when requested', () => {
    render(<LandingStatsSummary loading />);

    expect(screen.getAllByText('—')).toHaveLength(3);
  });
});