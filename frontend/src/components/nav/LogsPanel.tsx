import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const LOG_LEVEL_COLORS: Record<string, string> = {
  DEBUG: '#6c757d',
  INFO: '#17a2b8',
  WARNING: '#d97706',
  ERROR: '#dc2626',
  CRITICAL: '#7c3aed',
};

const LogsPanel = () => {
  const [logs, setLogs] = useState([]);
  const [selectedLevel, setSelectedLevel] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [isPolling, setIsPolling] = useState(false);
  const [lastLogTimestamp, setLastLogTimestamp] = useState(null);
  const logsEndRef = useRef(null);
  const pollingIntervalRef = useRef(null);

  // Use a ref to track the latest timestamp immediately
  const lastLogTimestampRef = useRef(null);

  const logLevels = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'];

  const scrollToBottom = () => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [logs, autoScroll]);

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleTimeString();
  };

  const updateLastTimestamp = (timestamp) => {
    lastLogTimestampRef.current = timestamp;
    setLastLogTimestamp(timestamp);
  };

  const loadRecentLogs = async (isInitialLoad = false) => {
    try {
      const params = new URLSearchParams();
      if (selectedLevel) {
        params.append('level', selectedLevel);
      }

      const currentTimestamp = lastLogTimestampRef.current;
      if (!isInitialLoad && currentTimestamp) {
        params.append('since', currentTimestamp.toString());
      }

      const queryString = params.toString();
      const url = `/api/logs/recent${queryString ? `?${queryString}` : ''}`;

      const response = await axios.get(url);
      const newLogs = response.data.logs || [];

      if (isInitialLoad) {
        setLogs(newLogs);
        if (newLogs.length > 0) {
          updateLastTimestamp(Math.max(...newLogs.map(log => log.timestamp)));
        } else {
          updateLastTimestamp(Date.now() / 1000);
        }
      } else if (newLogs.length > 0) {
        setLogs(prev => [...prev, ...newLogs]);
        updateLastTimestamp(Math.max(...newLogs.map(log => log.timestamp)));
      }
    } catch (error) {
      console.error('Error loading recent logs:', error);
    }
  };

  const startPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    pollingIntervalRef.current = setInterval(() => {
      loadRecentLogs(false);
    }, 2000);
    setIsPolling(true);
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPolling(false);
  };

  const clearLogs = () => {
    setLogs([]);
    updateLastTimestamp(Date.now() / 1000);
  };

  useEffect(() => {
    loadRecentLogs(true);
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [selectedLevel]);

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  return (
    <div className="flex h-[600px] flex-col">
      {/* Controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={selectedLevel}
          onChange={(e) => setSelectedLevel(e.target.value)}
          className="rounded border border-border bg-surface px-2 py-1.5 text-xs text-text focus:outline-none focus:ring-1 focus:ring-accent dark:border-border-dark dark:bg-surface-dark dark:text-text-dark"
        >
          <option value="">All Levels</option>
          {logLevels.map(level => (
            <option key={level} value={level}>{level}</option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => loadRecentLogs(true)}
          disabled={isPolling}
          className="rounded border border-border px-3 py-1.5 text-xs text-text transition hover:bg-surface-muted disabled:opacity-50 dark:border-border-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated"
        >
          Refresh
        </button>

        <button
          type="button"
          onClick={isPolling ? stopPolling : startPolling}
          className={`rounded px-3 py-1.5 text-xs font-medium transition ${
            isPolling
              ? 'bg-accent text-text-dark hover:bg-accent/90'
              : 'border border-border text-text hover:bg-surface-muted dark:border-border-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated'
          }`}
        >
          {isPolling ? 'Stop Auto-Refresh' : 'Start Auto-Refresh'}
        </button>

        <button
          type="button"
          onClick={clearLogs}
          className="rounded border border-amber-400/60 px-3 py-1.5 text-xs text-amber-700 transition hover:bg-amber-50 dark:border-amber-600/40 dark:text-amber-400 dark:hover:bg-amber-900/20"
        >
          Clear
        </button>

        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text/80 dark:text-text-dark/80">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="rounded accent-accent"
          />
          Auto Scroll
        </label>

        <span className="text-xs text-text/50 dark:text-text-dark/50">{logs.length} logs</span>

        {lastLogTimestamp && (
          <span className="text-xs text-text/50 dark:text-text-dark/50">
            Last: {new Date(lastLogTimestamp * 1000).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Log display */}
      <div className="flex-1 overflow-auto rounded border border-border bg-surface-dark-elevated p-2 font-mono text-xs text-text-dark dark:border-border-dark dark:bg-surface-dark-elevated dark:text-text-dark">
        {logs.length === 0 ? (
          <div className="mt-8 text-center text-text-dark/55">
            No logs to display
          </div>
        ) : (
          logs.map((log, index) => (
            <div key={`${log.timestamp}-${index}`} style={{ marginBottom: '2px', wordBreak: 'break-word' }}>
              <span className="text-text-dark/55">{formatTimestamp(log.timestamp)}</span>
              {' '}
              <span style={{ color: LOG_LEVEL_COLORS[log.level] ?? 'currentColor', fontWeight: 'bold', minWidth: '60px', display: 'inline-block' }}>
                {log.level}
              </span>
              {' '}
              <span className="text-emerald-400">{log.name}:{log.filename}:{log.lineno}</span>
              {' - '}
              <span className="text-text-dark">{log.message}</span>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>

      {isPolling && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          <span className="text-xs text-emerald-600 dark:text-emerald-400">
            Auto-refreshing logs every 2 seconds
          </span>
        </div>
      )}
    </div>
  );
};

export default LogsPanel;