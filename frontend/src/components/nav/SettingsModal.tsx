import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Tabs, Tab, Box, 
         CircularProgress, Typography, Card, CardContent, Avatar, Paper, 
         FormControl, InputLabel, Select, MenuItem, Switch, FormControlLabel,
         Alert, List, ListItem, ListItemText, Chip, Divider } from '@mui/material';
import { MusicNote as SpotifyIcon, YouTube as YouTubeIcon, Storage as DatabaseIcon,
         CheckCircle as CheckIcon, Warning as WarningIcon, Error as ErrorIcon } from '@mui/icons-material';
import PathSelector from './PathSelector';
import LogsPanel from './LogsPanel';
import JobsPanel from '../job/JobsPanel';
import ScheduledTasksPanel from './ScheduledTasksPanel';
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

const DatabaseMigrationsPanel = () => {
  const [migrationStatus, setMigrationStatus] = useState({
    loading: true,
    error: null,
    current_revision: null,
    head_revision: null,
    needs_upgrade: false,
    pending_count: 0,
    migrations: [],
    status: 'checking'
  });
  const [isUpgrading, setIsUpgrading] = useState(false);

  useEffect(() => {
    checkMigrationStatus();
  }, []);

  const checkMigrationStatus = async () => {
    setMigrationStatus(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const response = await axios.get('/api/settings/migrations/status');
      setMigrationStatus({
        loading: false,
        error: response.data.error || null,
        ...response.data
      });
    } catch (error) {
      console.error('Failed to check migration status:', error);
      setMigrationStatus(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to check migration status: ' + (error.response?.data?.detail || error.message)
      }));
    }
  };

  const runMigrations = async () => {
    setIsUpgrading(true);
    
    try {
      const response = await axios.post('/api/settings/migrations/upgrade');
      
      if (response.data.success) {
        // Refresh status after successful upgrade
        await checkMigrationStatus();
      }
    } catch (error) {
      console.error('Migration upgrade failed:', error);
      const errorMsg = error.response?.data?.detail?.error || error.response?.data?.detail || error.message;
      setMigrationStatus(prev => ({
        ...prev,
        error: 'Migration failed: ' + errorMsg
      }));
    } finally {
      setIsUpgrading(false);
    }
  };

  const getStatusIcon = () => {
    if (migrationStatus.loading) return <CircularProgress size={20} />;
    if (migrationStatus.error) return <ErrorIcon color="error" />;
    if (migrationStatus.needs_upgrade) return <WarningIcon color="warning" />;
    return <CheckIcon color="success" />;
  };

  const getStatusText = () => {
    if (migrationStatus.loading) return 'Checking...';
    if (migrationStatus.error) return 'Error';
    if (migrationStatus.needs_upgrade) return `${migrationStatus.pending_count} pending migration(s)`;
    return 'Up to date';
  };

  const getStatusColor = () => {
    if (migrationStatus.error) return 'error';
    if (migrationStatus.needs_upgrade) return 'warning';
    return 'success';
  };

  if (migrationStatus.loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" p={3}>
        <CircularProgress />
        <Typography variant="body1" sx={{ ml: 2 }}>
          Checking database migration status...
        </Typography>
      </Box>
    );
  }

  return (
    <div>
      <Typography variant="h6" gutterBottom display="flex" alignItems="center">
        <DatabaseIcon sx={{ mr: 1 }} />
        Database Migrations
      </Typography>
      
      {migrationStatus.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <Typography variant="body2">{migrationStatus.error}</Typography>
        </Alert>
      )}

      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
            <Box display="flex" alignItems="center">
              {getStatusIcon()}
              <Box sx={{ ml: 2 }}>
                <Typography variant="subtitle1">
                  Migration Status
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  {getStatusText()}
                </Typography>
              </Box>
            </Box>
            <Chip 
              label={getStatusText()} 
              color={getStatusColor()}
              variant="outlined"
            />
          </Box>
          
          <Divider sx={{ my: 2 }} />
          
          <Typography variant="body2" color="textSecondary" gutterBottom>
            <strong>Current Revision:</strong> {migrationStatus.current_revision}
          </Typography>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            <strong>Latest Revision:</strong> {migrationStatus.head_revision}
          </Typography>
          
          {migrationStatus.needs_upgrade && (
            <Box sx={{ mt: 2 }}>
              <Alert severity="info" sx={{ mb: 2 }}>
                Your database has {migrationStatus.pending_count} pending migration(s). 
                Click "Run Migrations" to update your database to the latest version.
              </Alert>
              <Button 
                variant="contained" 
                color="primary"
                onClick={runMigrations}
                disabled={isUpgrading}
                startIcon={isUpgrading ? <CircularProgress size={16} /> : <DatabaseIcon />}
              >
                {isUpgrading ? 'Running Migrations...' : 'Run Migrations'}
              </Button>
            </Box>
          )}
          
          <Box sx={{ mt: 2 }}>
            <Button 
              variant="outlined" 
              color="primary"
              onClick={checkMigrationStatus}
              disabled={migrationStatus.loading}
            >
              Refresh Status
            </Button>
          </Box>
        </CardContent>
      </Card>

      {migrationStatus.migrations && migrationStatus.migrations.length > 0 && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Recent Migrations
            </Typography>
            <List dense>
              {migrationStatus.migrations.map((migration, index) => (
                <ListItem key={index}>
                  <ListItemText
                    primary={
                      <Box display="flex" alignItems="center">
                        <Typography variant="body2" component="span" sx={{ fontFamily: 'monospace' }}>
                          {migration.revision}
                        </Typography>
                        {migration.is_current && (
                          <Chip 
                            label="Current" 
                            size="small" 
                            color="primary" 
                            sx={{ ml: 1 }} 
                          />
                        )}
                      </Box>
                    }
                    secondary={migration.message}
                  />
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      )}
      
      <Typography variant="body2" color="textSecondary" sx={{ mt: 3 }}>
        Database migrations update your database schema to match the latest application version. 
        Always backup your database before running migrations in production.
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
        <Tab label="Scheduled Tasks" />
        <Tab label="Database" />
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
          <ScheduledTasksPanel />
        </TabPanel>
        
        <TabPanel value={activeTab} index={3}>
          <DatabaseMigrationsPanel />
        </TabPanel>
        
        <TabPanel value={activeTab} index={4}>
          <h3>Last.fm Settings</h3>
          <strong>Last.fm API Configured:</strong>{settings.lastFmApiKeyConfigured ? ' Yes' : ' No'}
        </TabPanel>
        
        <TabPanel value={activeTab} index={5}>
          <h3>Plex Settings</h3>
          <strong>Plex Configured:</strong>{settings.plexConfigured ? ' Yes' : ' No'}
        </TabPanel>
        
        <TabPanel value={activeTab} index={6}>
          <h3>OpenAI Settings</h3>
          <strong>OpenAI API Configured:</strong>{settings.openAiApiKeyConfigured ? ' Yes' : ' No'}
        </TabPanel>

        <TabPanel value={activeTab} index={7}>
          <h3>Redis Settings</h3>
          <strong>Redis Configured:</strong>{settings.redisConfigured ? ' Yes' : ' No'}
        </TabPanel>

        <TabPanel value={activeTab} index={8}>
          <h3>Spotify Settings</h3>
          <Box mb={2}>
            <Typography variant="body2">
              <strong>Spotify API Configured:</strong>{settings.spotifyConfigured ? ' Yes' : ' No'}
            </Typography>
          </Box>
          <SpotifyConnectionPanel />
        </TabPanel>

        <TabPanel value={activeTab} index={9}>
          <h3>YouTube Music Settings</h3>
          <Box mb={2}>
            <Typography variant="body2">
              <strong>YouTube Music API Configured:</strong>{settings.youtubeMusicConfigured ? ' Yes' : ' No'}
            </Typography>
          </Box>
          <YouTubeMusicConnectionPanel />
        </TabPanel>

        <TabPanel value={activeTab} index={10}>
          <LogsPanel />
        </TabPanel>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {activeTab !== 1 && activeTab !== 2 && activeTab !== 3 && activeTab !== 10 && (
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