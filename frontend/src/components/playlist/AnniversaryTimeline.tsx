import React, { useState, useEffect } from 'react';
import libraryRepository from '../../repositories/LibraryRepository';
import '../../styles/AnniversaryTimeline.css';

interface Anniversary {
  id: number;
  album: string;
  artist: string;
  original_release_date: string;
  anniversary_date: string;
  years_since_release: number;
  art_url?: string;
}

interface AnniversaryTimelineProps {
  daysAhead?: number;
  daysBehind?: number;
  onAlbumClick?: (anniversary: Anniversary) => void;
}

const AnniversaryTimeline: React.FC<AnniversaryTimelineProps> = ({
  daysAhead = 30,
  daysBehind = 7,
  onAlbumClick
}) => {
  const [anniversaries, setAnniversaries] = useState<Anniversary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAnniversaries();
  }, [daysAhead, daysBehind]);

  const fetchAnniversaries = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await libraryRepository.getUpcomingAnniversaries(daysAhead, daysBehind);
      setAnniversaries(data);
    } catch (err) {
      console.error('Error fetching anniversaries:', err);
      setError('Failed to load anniversaries');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric'
    });
  };

  const formatFullDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      month: 'long', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const isToday = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isPast = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const groupAnniversariesByDate = () => {
    const grouped: { [key: string]: Anniversary[] } = {};
    
    anniversaries.forEach(anniversary => {
      const date = anniversary.anniversary_date;
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(anniversary);
    });

    return grouped;
  };

  const handleAlbumClick = (anniversary: Anniversary) => {
    if (onAlbumClick) {
      onAlbumClick(anniversary);
    }
  };

  if (loading) {
    return (
      <div className="anniversary-timeline loading">
        <div className="timeline-header">
          <h3>Album Anniversaries</h3>
        </div>
        <div className="loading-message">Loading anniversaries...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="anniversary-timeline error">
        <div className="timeline-header">
          <h3>Album Anniversaries</h3>
        </div>
        <div className="error-message">{error}</div>
        <button onClick={fetchAnniversaries} className="retry-button">
          Retry
        </button>
      </div>
    );
  }

  if (anniversaries.length === 0) {
    return (
      <div className="anniversary-timeline empty">
        <div className="timeline-header">
          <h3>Album Anniversaries</h3>
        </div>
        <div className="empty-message">
          No upcoming anniversaries in the next {daysAhead} days.
        </div>
      </div>
    );
  }

  const groupedAnniversaries = groupAnniversariesByDate();

  return (
    <div className="anniversary-timeline">
      <div className="timeline-header">
        <h3>Album Anniversaries</h3>
        <div className="timeline-controls">
          <button onClick={fetchAnniversaries} className="refresh-button">
            ↻
          </button>
        </div>
      </div>

      <div className="timeline-content">
        {Object.entries(groupedAnniversaries).map(([date, dayAnniversaries]) => (
          <div 
            key={date} 
            className={`timeline-day ${isToday(date) ? 'today' : ''} ${isPast(date) ? 'past' : ''}`}
          >
            <div className="day-header">
              <div className="day-date">
                <span className="day-short">{formatDate(date)}</span>
                <span className="day-full">{formatFullDate(date)}</span>
              </div>
              {isToday(date) && <span className="today-badge">Today</span>}
            </div>

            <div className="day-anniversaries">
              {dayAnniversaries.map(anniversary => (
                <div 
                  key={`${anniversary.id}-${date}`}
                  className="anniversary-item"
                  onClick={() => handleAlbumClick(anniversary)}
                >
                  <div className="album-info">
                    <div className="album-title">{anniversary.album}</div>
                    <div className="album-artist">{anniversary.artist}</div>
                    <div className="anniversary-info">
                      <span className="years-badge">
                        {anniversary.years_since_release} year{anniversary.years_since_release !== 1 ? 's' : ''}
                      </span>
                      <span className="original-date">
                        Released {formatFullDate(anniversary.original_release_date)}
                      </span>
                    </div>
                  </div>
                  
                  {anniversary.art_url && (
                    <div className="album-art">
                      <img src={anniversary.art_url} alt={`${anniversary.album} cover`} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AnniversaryTimeline;