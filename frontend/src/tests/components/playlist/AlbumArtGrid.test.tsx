import React from 'react';
import { render, screen } from '@testing-library/react';
import { AlbumArtGrid } from '../../../components/playlist/AlbumArtGrid';
import '@testing-library/jest-dom';

describe('AlbumArtGrid', () => {
  // Sample album art URLs for testing
  const sampleArtUrls = [
    'https://example.com/album1.jpg',
    'https://example.com/album2.jpg',
    'https://example.com/album3.jpg',
    'https://example.com/album4.jpg',
    'https://example.com/album5.jpg', // This one should be cut off when showing only 4
  ];

  test('renders with a single album art', () => {
    const singleArt = [sampleArtUrls[0]];
    const { container } = render(<AlbumArtGrid artList={singleArt} />);
    
    // Check if it renders as a 1x1 grid
    const gridElement = container.firstChild as HTMLElement;
    expect(gridElement).toBeInTheDocument();
    expect(gridElement).toHaveStyle('grid-template-columns: 1fr');
    expect(gridElement).toHaveStyle('grid-template-rows: 1fr');
    
    // Check if the image is rendered
    const imgElements = screen.getAllByAltText('Album Art');
    expect(imgElements).toHaveLength(1);
    expect(imgElements[0]).toHaveAttribute('src', sampleArtUrls[0]);
  });

  test('renders with two album arts in a 2x2 grid', () => {
    const twoArts = sampleArtUrls.slice(0, 2);
    const { container } = render(<AlbumArtGrid artList={twoArts} />);
    
    // Check if it renders as a 2x2 grid
    const gridElement = container.firstChild as HTMLElement;
    expect(gridElement).toBeInTheDocument();
    expect(gridElement).toHaveStyle('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(gridElement).toHaveStyle('grid-template-rows: repeat(2, minmax(0, 1fr))');
    
    // Check if both images are rendered
    const imgElements = screen.getAllByAltText('Album Art');
    expect(imgElements).toHaveLength(2);
    expect(imgElements[0]).toHaveAttribute('src', twoArts[0]);
    expect(imgElements[1]).toHaveAttribute('src', twoArts[1]);
  });

  test('renders with four album arts in a 2x2 grid', () => {
    const fourArts = sampleArtUrls.slice(0, 4);
    const { container } = render(<AlbumArtGrid artList={fourArts} />);
    
    // Check if it renders as a 2x2 grid
    const gridElement = container.firstChild as HTMLElement;
    expect(gridElement).toBeInTheDocument();
    expect(gridElement).toHaveStyle('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(gridElement).toHaveStyle('grid-template-rows: repeat(2, minmax(0, 1fr))');
    
    // Check if all four images are rendered
    const imgElements = screen.getAllByAltText('Album Art');
    expect(imgElements).toHaveLength(4);
    
    // Check if all images have the correct src attributes
    fourArts.forEach((url, index) => {
      expect(imgElements[index]).toHaveAttribute('src', url);
    });
  });

  test('renders maximum of 4 album arts even when more are provided', () => {
    // Use all 5 sample URLs
    const { container } = render(<AlbumArtGrid artList={sampleArtUrls} />);
    
    // Should still render as 2x2 layout even with 5 items
    const gridElement = container.firstChild as HTMLElement;
    expect(gridElement).toBeInTheDocument();
    expect(gridElement).toHaveStyle('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(gridElement).toHaveStyle('grid-template-rows: repeat(2, minmax(0, 1fr))');
    
    // Should only render 4 images max
    const imgElements = screen.getAllByAltText('Album Art');
    expect(imgElements).toHaveLength(4);
    
    // Check if the first 4 images are rendered (5th should be excluded)
    sampleArtUrls.slice(0, 4).forEach((url, index) => {
      expect(imgElements[index]).toHaveAttribute('src', url);
    });
  });

  test('applies the borderRadius style to album art divs', () => {
    const { container } = render(<AlbumArtGrid artList={[sampleArtUrls[0]]} />);
    
    const albumArtDiv = container.firstChild as HTMLElement;
    expect(albumArtDiv).toHaveStyle('border-radius: 4px');
  });

  test('renders empty grid when no album art is provided', () => {
    const { container } = render(<AlbumArtGrid artList={[]} />);
    
    // Should render with 1x1 layout for empty list
    const gridElement = container.firstChild as HTMLElement;
    expect(gridElement).toBeInTheDocument();
    expect(gridElement).toHaveStyle('grid-template-columns: 1fr');
    expect(gridElement).toHaveStyle('grid-template-rows: 1fr');
    
    // Should not have any images
    const imgElements = screen.queryAllByAltText('Album Art');
    expect(imgElements).toHaveLength(0);
  });
});