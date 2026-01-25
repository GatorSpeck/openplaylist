import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControlLabel,
  Switch,
  TextField,
  Typography,
  Box,
  Alert,
  CircularProgress,
  Paper,
  Grid,
} from '@mui/material';
import axios from 'axios';

const CRON_PRESETS = {
  '0 2 * * *': 'Daily at 2 AM',
  '0 2 * * 0': 'Weekly on Sunday at 2 AM',
  '0 2 1 * *': 'Monthly on 1st at 2 AM',
  '0 */6 * * *': 'Every 6 hours',
  '0 */2 * * *': 'Every 2 hours',
  '*/30 * * * *': 'Every 30 minutes',
  '*/15 * * * *': 'Every 15 minutes',
};

const PlaylistAutoSyncDialog = ({ open, onClose, playlistId, playlistName }) => {
  const [settings, setSettings] = useState({
    auto_sync_enabled: false,
    auto_sync_schedule: '0 2 * * *',
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cronValidation, setCronValidation] = useState({ valid: true, error: null, next_runs: [] });
  const [isValidating, setIsValidating] = useState(false);
  const [customCron, setCustomCron] = useState('');

  useEffect(() => {
    if (open && playlistId) {
      loadSettings();
    }
  }, [open, playlistId]);

  useEffect(() => {
    if (settings.auto_sync_schedule) {
      validateCronExpression(settings.auto_sync_schedule);
    }
  }, [settings.auto_sync_schedule]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/playlists/${playlistId}/auto-sync`);
      setSettings(response.data);
      
      // Check if it's a custom cron expression
      const schedule = response.data.auto_sync_schedule || '0 2 * * *';
      const isPreset = Object.keys(CRON_PRESETS).includes(schedule);
      if (!isPreset && schedule) {
        setCustomCron(schedule);
      } else {
        setCustomCron('');
      }
    } catch (error) {
      console.error('Error loading auto-sync settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const validateCronExpression = async (expression) => {
    if (!expression) {
      setCronValidation({ valid: false, error: 'Cron expression is required', next_runs: [] });
      return;
    }

    setIsValidating(true);
    try {
      // Use POST to avoid URL encoding issues
      const response = await axios.post('/api/scheduled-tasks/validate-cron', {
        cron_expression: expression
      });
      setCronValidation(response.data);
    } catch (error) {
      console.error('Cron validation error:', error);
      setCronValidation({ 
        valid: false, 
        error: error.response?.data?.detail || error.response?.data?.error || 'Failed to validate cron expression', 
        next_runs: [] 
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleSave = async () => {
    if (settings.auto_sync_enabled && !cronValidation.valid) {
      return;
    }

    setSaving(true);
    try {
      await axios.put(`/api/playlists/${playlistId}/auto-sync`, settings);
      onClose();
    } catch (error) {
      console.error('Error saving auto-sync settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleCronChange = (value) => {
    setCustomCron(value);
    setSettings(prev => ({ ...prev, auto_sync_schedule: value }));
  };

  const handlePresetChange = (preset) => {
    setCustomCron('');
    setSettings(prev => ({ ...prev, auto_sync_schedule: preset }));
  };

  if (loading) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogContent>
          <Box display="flex" justifyContent="center" alignItems="center" p={3}>
            <CircularProgress />
          </Box>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Auto-Sync Settings for "{playlistName}"</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1 }}>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
            Configure automatic synchronization for this playlist with external services.
          </Typography>

          <FormControlLabel
            control={
              <Switch
                checked={settings.auto_sync_enabled}
                onChange={(e) => setSettings(prev => ({ ...prev, auto_sync_enabled: e.target.checked }))}
              />
            }
            label="Enable Auto-Sync"
            sx={{ mb: 3 }}
          />

          {settings.auto_sync_enabled && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Sync Schedule (Cron Expression)
              </Typography>
              
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="textSecondary" gutterBottom>
                  Choose a preset or enter a custom cron expression:
                </Typography>
                
                <Grid container spacing={1} sx={{ mb: 2 }}>
                  {Object.entries(CRON_PRESETS).map(([cron, label]) => (
                    <Grid item xs={12} sm={6} md={4} key={cron}>
                      <Button
                        fullWidth
                        variant={settings.auto_sync_schedule === cron ? "contained" : "outlined"}
                        size="small"
                        onClick={() => handlePresetChange(cron)}
                      >
                        {label}
                      </Button>
                    </Grid>
                  ))}
                </Grid>

                <TextField
                  fullWidth
                  label="Custom Cron Expression"
                  placeholder="e.g., 0 */4 * * * (every 4 hours)"
                  value={customCron}
                  onChange={(e) => handleCronChange(e.target.value)}
                  helperText="Format: minute hour day month day_of_week"
                  sx={{ mb: 2 }}
                />
              </Box>

              {isValidating ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <CircularProgress size={16} />
                  <Typography variant="body2">Validating...</Typography>
                </Box>
              ) : (
                <Box sx={{ mb: 2 }}>
                  {!cronValidation.valid ? (
                    <Alert severity="error" sx={{ mb: 1 }}>
                      {cronValidation.error}
                    </Alert>
                  ) : (
                    <Alert severity="success" sx={{ mb: 1 }}>
                      Valid cron expression
                    </Alert>
                  )}
                  
                  {cronValidation.next_runs && cronValidation.next_runs.length > 0 && (
                    <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                      <Typography variant="body2" fontWeight="medium" gutterBottom>
                        Next 5 sync times:
                      </Typography>
                      {cronValidation.next_runs.map((time, index) => (
                        <Typography key={index} variant="body2" color="textSecondary">
                          {new Date(time).toLocaleString()}
                        </Typography>
                      ))}
                    </Paper>
                  )}
                </Box>
              )}

              <Alert severity="info">
                Auto-sync will use the configured sync targets for this playlist. 
                Make sure you have set up sync targets in the playlist sync configuration.
              </Alert>
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleSave} 
          variant="contained"
          disabled={saving || (settings.auto_sync_enabled && !cronValidation.valid) || isValidating}
        >
          {saving ? <CircularProgress size={20} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PlaylistAutoSyncDialog;