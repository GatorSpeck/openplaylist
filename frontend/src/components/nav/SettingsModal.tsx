import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Tabs, Tab, Box, 
         CircularProgress, Typography, Card, CardContent, Avatar, Paper, 
         FormControl, InputLabel, Select, MenuItem, Switch, FormControlLabel } from '@mui/material';
import { MusicNote as SpotifyIcon, YouTube as YouTubeIcon } from '@mui/icons-material';
import PathSelector from './PathSelector';
import LogsPanel from './LogsPanel';
import JobsPanel from '../job/JobsPanel';
import axios from 'axios';

function TabPanel(props) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`settings-tabpanel-${index}`}
      aria-labelledby={`settings-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const SpotifyConnectionPanel = () => {
  const [status, setStatus] = useState({
    loading: true,
    authenticated: false,
    error: null,
    user: null,
  });

  useEffect(() => {
    checkSpotifyStatus();
  }, []);

  const checkSpotifyStatus = async () => {
    setStatus(prev => ({ ...prev, loading: true }));
    
    try {
      const response = await axios.get('/api/spotify/status');
      setStatus({
        loading: false,
        authenticated: response.data.authenticated,
        error: response.data.error,
        user: response.data.user,
      });
    } catch (error) {
      console.error('Error checking Spotify status:', error);
      setStatus({
        loading: false,
        authenticated: false,
        error: error.response?.data?.detail || 'Failed to check Spotify status',
        user: null,
      });
    }
  };

  const handleConnect = () => {
    window.location.href = '/api/spotify/login';
  };

  const handleDisconnect = async () => {
    try {
      await axios.get('/api/spotify/logout');
      checkSpotifyStatus();
    } catch (error) {
      console.error('Error disconnecting from Spotify:', error);
      setStatus(prev => ({
        ...prev,
        error: 'Failed to disconnect from Spotify',
      }));
    }
  };

  if (status.loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <div>
      <Typography variant="h6" gutterBottom>
        Spotify Connection
      </Typography>
      
      {status.error && (
        <Paper 
          sx={{ 
            p: 2, 
            mb: 2, 
            bgcolor: 'error.light', 
            color: 'error.contrastText' 
          }}
        >
          <Typography variant="body2">{status.error}</Typography>
        </Paper>
      )}

      {status.authenticated ? (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent>
            <Box display="flex" alignItems="center" mb={2}>
              <Avatar 
                src={status.user?.images?.[0]?.url} 
                alt={status.user?.display_name}
                sx={{ mr: 2, bgcolor: 'primary.main' }}
              >
                <SpotifyIcon />
              </Avatar>
              <Box>
                <Typography variant="subtitle1">
                  {status.user?.display_name || 'Spotify User'}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  {status.user?.email || ''}
                </Typography>
              </Box>
            </Box>
            <Typography variant="body2" color="success.main" gutterBottom>
              Connected to Spotify
            </Typography>
            <Button 
              variant="outlined" 
              color="secondary"
              onClick={handleDisconnect}
              sx={{ mt: 1 }}
            >
              Disconnect
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Box textAlign="center" p={3} border={1} borderColor="divider" borderRadius={1}>
          <Typography variant="body1" gutterBottom>
            Connect your Spotify account to enable playlist synchronization
          </Typography>
          <Button 
            variant="contained" 
            color="primary"
            onClick={handleConnect}
            sx={{ 
              mt: 2,
              bgcolor: '#1DB954', // Spotify green
              '&:hover': {
                bgcolor: '#1AA34A',
              }
            }}
            startIcon={<SpotifyIcon />}
          >
            Connect to Spotify
          </Button>
        </Box>
      )}

      <Typography variant="body2" color="textSecondary" sx={{ mt: 3 }}>
        Connecting to Spotify allows you to synchronize playlists between your local collection and Spotify.
      </Typography>
    </div>
  );
};

const YouTubeMusicConnectionPanel = () => {
  const [status, setStatus] = useState({
    loading: true,
    authenticated: false,
    error: null,
    user: null,
  });

  useEffect(() => {
    checkYouTubeMusicStatus();
  }, []);

  const checkYouTubeMusicStatus = async () => {
    setStatus(prev => ({ ...prev, loading: true }));
    
    try {
      const response = await axios.get('/api/youtube/status');
      setStatus({
        loading: false,
        authenticated: response.data.authenticated,
        error: response.data.error,
        user: response.data.user,
      });
    } catch (error) {
      console.error('Error checking YouTube Music status:', error);
      setStatus({
        loading: false,
        authenticated: false,
        error: error.response?.data?.detail || 'Failed to check YouTube Music status',
        user: null,
      });
    }
  };

  const handleRefresh = () => {
    checkYouTubeMusicStatus();
  };

  if (status.loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <div>
      <Typography variant="h6" gutterBottom>
        YouTube Music Connection
      </Typography>
      
      {status.error && (
        <Paper 
          sx={{ 
            p: 2, 
            mb: 2, 
            bgcolor: 'error.light', 
            color: 'error.contrastText' 
          }}
        >
          <Typography variant="body2">{status.error}</Typography>
        </Paper>
      )}

      {status.authenticated ? (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent>
            <Box display="flex" alignItems="center" mb={2}>
              <Avatar 
                sx={{ mr: 2, bgcolor: '#FF0000' }} // YouTube red
              >
                <YouTubeIcon />
              </Avatar>
              <Box>
                <Typography variant="subtitle1">
                  YouTube Music User
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Library Access: {status.user?.library_accessible ? 'Yes' : 'No'}
                </Typography>
                {status.user?.playlists_count !== undefined && (
                  <Typography variant="body2" color="textSecondary">
                    Playlists: {status.user.playlists_count}
                  </Typography>
                )}
              </Box>
            </Box>
            <Typography variant="body2" color="success.main" gutterBottom>
              Connected to YouTube Music
            </Typography>
            <Button 
              variant="outlined" 
              color="primary"
              onClick={handleRefresh}
              sx={{ mt: 1 }}
            >
              Refresh Status
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Box textAlign="center" p={3} border={1} borderColor="divider" borderRadius={1}>
          <Typography variant="body1" gutterBottom>
            YouTube Music requires OAuth credentials and authentication
          </Typography>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            Please configure your OAuth credentials and ensure the oauth.json file is properly set up.
          </Typography>
          <Button 
            variant="outlined" 
            color="primary"
            onClick={handleRefresh}
            sx={{ 
              mt: 2,
              borderColor: '#FF0000', // YouTube red
              color: '#FF0000',
              '&:hover': {
                bgcolor: 'rgba(255, 0, 0, 0.04)',
              }
            }}
            startIcon={<YouTubeIcon />}
          >
            Check Status
          </Button>
        </Box>
      )}

      <Typography variant="body2" color="textSecondary" sx={{ mt: 3 }}>
        YouTube Music integration allows you to import playlists and synchronize with your YouTube Music library.
      </Typography>
    </div>
  );
};

const SettingsModal = ({ open, onClose }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [indexPaths, setIndexPaths] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState({});
  
  // Load settings when the modal opens
  useEffect(() => {
    if (open) {
      loadSettings();
    }
  }, [open]);
  
  const loadSettings = async () => {
    setIsLoading(true);
    try {
      // Fetch paths from the backend
      const response = await axios.get('/api/settings/paths');
      setIndexPaths(response.data || []);

      // fetch other settings
      const settingsResp = await axios.get('/api/settings');
      setSettings(settingsResp.data || {});
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const saveSettings = async () => {
    setIsLoading(true);
    try {
      // Save paths to the backend
      await axios.post('/api/settings/paths', indexPaths);
      onClose();
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };
  
  const handlePathsChange = (paths) => {
    setIndexPaths(paths);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>Settings</DialogTitle>
      <Tabs value={activeTab} onChange={handleTabChange} centered>
        <Tab label="Music Paths" />
        <Tab label="Jobs" />
        <Tab label="Last.fm" />
        <Tab label="Plex" />
        <Tab label="OpenAI" />
        <Tab label="Redis" />
        <Tab label="Spotify" />
        <Tab label="YouTube Music" />
        <Tab label="Logs" />
      </Tabs>
      
      <DialogContent>
        <TabPanel value={activeTab} index={0}>
          <PathSelector 
            paths={indexPaths} 
            onChange={handlePathsChange} 
            isLoading={isLoading} 
          />
        </TabPanel>
        
        <TabPanel value={activeTab} index={1}>
          <JobsPanel />
        </TabPanel>
        
        <TabPanel value={activeTab} index={2}>
          <h3>Last.fm Settings</h3>
          <strong>Last.fm API Configured:</strong>{settings.lastFmApiKeyConfigured ? ' Yes' : ' No'}
        </TabPanel>
        
        <TabPanel value={activeTab} index={3}>
          <h3>Plex Settings</h3>
          <strong>Plex Configured:</strong>{settings.plexConfigured ? ' Yes' : ' No'}
        </TabPanel>
        
        <TabPanel value={activeTab} index={4}>
          <h3>OpenAI Settings</h3>
          <strong>OpenAI API Configured:</strong>{settings.openAiApiKeyConfigured ? ' Yes' : ' No'}
        </TabPanel>

        <TabPanel value={activeTab} index={5}>
          <h3>Redis Settings</h3>
          <strong>Redis Configured:</strong>{settings.redisConfigured ? ' Yes' : ' No'}
        </TabPanel>

        <TabPanel value={activeTab} index={6}>
          <h3>Spotify Settings</h3>
          <Box mb={2}>
            <Typography variant="body2">
              <strong>Spotify API Configured:</strong>{settings.spotifyConfigured ? ' Yes' : ' No'}
            </Typography>
          </Box>
          <SpotifyConnectionPanel />
        </TabPanel>

        <TabPanel value={activeTab} index={7}>
          <h3>YouTube Music Settings</h3>
          <Box mb={2}>
            <Typography variant="body2">
              <strong>YouTube Music API Configured:</strong>{settings.youtubeMusicConfigured ? ' Yes' : ' No'}
            </Typography>
          </Box>
          <YouTubeMusicConnectionPanel />
        </TabPanel>

        <TabPanel value={activeTab} index={8}>
          <LogsPanel />
        </TabPanel>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {activeTab !== 1 && activeTab !== 8 && (
          <Button 
            onClick={saveSettings} 
            variant="contained" 
            disabled={isLoading}
          >
            {isLoading ? <CircularProgress size={20} /> : 'Save'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default SettingsModal;