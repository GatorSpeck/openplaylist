import React, { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Tabs, Tab, Box } from '@mui/material';
import PathSelector from './PathSelector';
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
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Settings</DialogTitle>
      <Tabs value={activeTab} onChange={handleTabChange} centered>
        <Tab label="Music Paths" />
        <Tab label="Last.fm" />
        <Tab label="Plex" />
        <Tab label="OpenAI" />
        <Tab label="Redis" />
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
          <h3>Last.fm Settings</h3>
          <strong>Last.fm API Configured:</strong>{settings.lastFmApiKeyConfigured ? ' Yes' : ' No'}
        </TabPanel>
        
        <TabPanel value={activeTab} index={2}>
          <h3>Plex Settings</h3>
          <strong>Plex Configured:</strong>{settings.plexConfigured ? ' Yes' : ' No'}
        </TabPanel>
        
        <TabPanel value={activeTab} index={3}>
          <h3>OpenAI Settings</h3>
          <strong>OpenAI API Configured:</strong>{settings.openAiApiKeyConfigured ? ' Yes' : ' No'}
        </TabPanel>

        <TabPanel value={activeTab} index={4}>
          <h3>Redis Settings</h3>
          <strong>Redis Configured:</strong>{settings.redisConfigured ? ' Yes' : ' No'}
        </TabPanel>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={saveSettings} variant="contained" color="primary">
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SettingsModal;