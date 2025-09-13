import React, { useState, useEffect, useRef } from 'react';
import { 
  Box, 
  Paper, 
  Typography, 
  FormControl, 
  InputLabel, 
  Select, 
  MenuItem, 
  Switch, 
  FormControlLabel,
  Button
} from '@mui/material';
import axios from 'axios';

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

  const getLogLevelColor = (level) => {
    switch (level) {
      case 'DEBUG': return '#6c757d';
      case 'INFO': return '#17a2b8';
      case 'WARNING': return '#ffc107';
      case 'ERROR': return '#dc3545';
      case 'CRITICAL': return '#6f42c1';
      default: return '#000000';
    }
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
      
      // Use the ref value for the most up-to-date timestamp
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
          const latestTimestamp = Math.max(...newLogs.map(log => log.timestamp));
          updateLastTimestamp(latestTimestamp);
        } else {
          const currentTime = Date.now() / 1000;
          updateLastTimestamp(currentTime);
        }
      } else if (newLogs.length > 0) {
        setLogs(prev => {
          return [...prev, ...newLogs];
        });
        const latestTimestamp = Math.max(...newLogs.map(log => log.timestamp));
        updateLastTimestamp(latestTimestamp);
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
    const currentTime = Date.now() / 1000;
    updateLastTimestamp(currentTime);
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
    <Box sx={{ height: '600px', display: 'flex', flexDirection: 'column' }}>
      {/* Controls */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Log Level</InputLabel>
          <Select
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(e.target.value)}
            label="Log Level"
          >
            <MenuItem value="">All Levels</MenuItem>
            {logLevels.map(level => (
              <MenuItem key={level} value={level}>{level}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <Button
          variant="outlined"
          onClick={() => loadRecentLogs(true)}
          disabled={isPolling}
        >
          Refresh
        </Button>

        <Button
          variant={isPolling ? "contained" : "outlined"}
          onClick={isPolling ? stopPolling : startPolling}
          color={isPolling ? "secondary" : "primary"}
        >
          {isPolling ? 'Stop Auto-Refresh' : 'Start Auto-Refresh'}
        </Button>

        <Button
          variant="outlined"
          onClick={clearLogs}
          color="warning"
        >
          Clear
        </Button>

        <FormControlLabel
          control={
            <Switch
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
          }
          label="Auto Scroll"
        />

        <Typography variant="caption" color="textSecondary">
          {logs.length} logs displayed
        </Typography>

        {lastLogTimestamp && (
          <Typography variant="caption" color="textSecondary">
            Last: {new Date(lastLogTimestamp * 1000).toLocaleTimeString()}
          </Typography>
        )}
      </Box>

      {/* Log Display */}
      <Paper 
        sx={{ 
          flex: 1, 
          overflow: 'auto', 
          p: 1, 
          backgroundColor: '#000000', 
          color: '#ffffff',
          fontFamily: 'monospace',
          fontSize: '12px'
        }}
      >
        {logs.length === 0 ? (
          <Typography sx={{ color: '#888888', textAlign: 'center', mt: 4 }}>
            No logs to display
          </Typography>
        ) : (
          logs.map((log, index) => (
            <Box key={`${log.timestamp}-${index}`} sx={{ mb: 0.5, wordBreak: 'break-word' }}>
              <span style={{ color: '#888888' }}>
                {formatTimestamp(log.timestamp)}
              </span>
              {' '}
              <span 
                style={{ 
                  color: getLogLevelColor(log.level),
                  fontWeight: 'bold',
                  minWidth: '60px',
                  display: 'inline-block'
                }}
              >
                {log.level}
              </span>
              {' '}
              <span style={{ color: '#00ff00' }}>
                {log.name}:{log.filename}:{log.lineno}
              </span>
              {' - '}
              <span style={{ color: '#ffffff' }}>
                {log.message}
              </span>
            </Box>
          ))
        )}
        <div ref={logsEndRef} />
      </Paper>

      {isPolling && (
        <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
          <Box 
            sx={{ 
              width: 8, 
              height: 8, 
              borderRadius: '50%', 
              backgroundColor: '#4caf50',
              animation: 'pulse 1s infinite',
              mr: 1
            }}
          />
          <Typography variant="caption" color="success.main">
            Auto-refreshing logs every 2 seconds
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default LogsPanel;