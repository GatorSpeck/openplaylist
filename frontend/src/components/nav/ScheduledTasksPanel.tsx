import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Alert,
  CircularProgress,
  Grid,
  Card,
  CardContent,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  PlayArrow as RunIcon,
  Schedule as ScheduleIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  MoreTime as PendingIcon,
} from '@mui/icons-material';
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

const TASK_TYPE_LABELS = {
  library_scan: 'Library Scan',
  playlist_sync: 'Playlist Sync',
};

const TaskStatusChip = ({ status, lastError }) => {
  const getStatusProps = (status) => {
    switch (status) {
      case 'success':
        return { color: 'success', icon: <CheckIcon /> };
      case 'failed':
        return { color: 'error', icon: <ErrorIcon /> };
      case 'running':
        return { color: 'warning', icon: <PendingIcon /> };
      default:
        return { color: 'default', icon: <ScheduleIcon /> };
    }
  };

  const props = getStatusProps(status);
  
  return (
    <Tooltip title={lastError || 'No errors'}>
      <Chip
        {...props}
        label={status || 'Pending'}
        size="small"
        icon={props.icon}
      />
    </Tooltip>
  );
};

const TaskFormDialog = ({ open, onClose, onSave, task = null, isEditing = false }) => {
  const [formData, setFormData] = useState({
    name: '',
    task_type: 'library_scan',
    cron_expression: '0 2 * * *',
    enabled: true,
    config: {},
  });
  const [cronValidation, setCronValidation] = useState({ valid: true, error: null, next_runs: [] });
  const [isValidating, setIsValidating] = useState(false);
  const [customCron, setCustomCron] = useState('');

  useEffect(() => {
    if (isEditing && task) {
      setFormData({
        name: task.name || '',
        task_type: task.task_type || 'library_scan',
        cron_expression: task.cron_expression || '0 2 * * *',
        enabled: task.enabled !== undefined ? task.enabled : true,
        config: task.config || {},
      });
      // Check if it's a custom cron expression
      const isPreset = Object.keys(CRON_PRESETS).includes(task.cron_expression || '');
      if (!isPreset) {
        setCustomCron(task.cron_expression || '');
      }
    } else {
      setFormData({
        name: '',
        task_type: 'library_scan',
        cron_expression: '0 2 * * *',
        enabled: true,
        config: {},
      });
      setCustomCron('');
    }
  }, [isEditing, task, open]);

  useEffect(() => {
    if (formData.cron_expression) {
      validateCronExpression(formData.cron_expression);
    }
  }, [formData.cron_expression]);

  const validateCronExpression = async (expression) => {
    if (!expression || expression.trim() === '') {
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

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCronChange = (value) => {
    setCustomCron(value);
    handleChange('cron_expression', value);
  };

  const handlePresetChange = (preset) => {
    setCustomCron('');
    handleChange('cron_expression', preset);
  };

  const handleSubmit = () => {
    if (!cronValidation.valid) {
      return;
    }
    onSave(formData);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{isEditing ? 'Edit Task' : 'Create Scheduled Task'}</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1 }}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Task Name"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                required
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Task Type</InputLabel>
                <Select
                  value={formData.task_type}
                  label="Task Type"
                  onChange={(e) => handleChange('task_type', e.target.value)}
                >
                  <MenuItem value="library_scan">Library Scan</MenuItem>
                  <MenuItem value="playlist_sync">Playlist Sync</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.enabled}
                    onChange={(e) => handleChange('enabled', e.target.checked)}
                  />
                }
                label="Enabled"
              />
            </Grid>

            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Schedule (Cron Expression)
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
                        variant={formData.cron_expression === cron ? "contained" : "outlined"}
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
                />
              </Box>

              {isValidating ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CircularProgress size={16} />
                  <Typography variant="body2">Validating...</Typography>
                </Box>
              ) : (
                <Box>
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
                        Next 5 run times:
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
            </Grid>
          </Grid>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained"
          disabled={!cronValidation.valid || !formData.name.trim() || isValidating}
        >
          {isEditing ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const ScheduledTasksPanel = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/scheduled-tasks/');
      setTasks(response.data);
    } catch (error) {
      console.error('Error loading scheduled tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTask = async (taskData) => {
    try {
      await axios.post('/api/scheduled-tasks/', taskData);
      setFormOpen(false);
      loadTasks();
    } catch (error) {
      console.error('Error creating task:', error);
    }
  };

  const handleEditTask = async (taskData) => {
    try {
      await axios.put(`/api/scheduled-tasks/${editingTask.id}`, taskData);
      setFormOpen(false);
      setEditingTask(null);
      loadTasks();
    } catch (error) {
      console.error('Error updating task:', error);
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Are you sure you want to delete this task?')) {
      return;
    }
    
    try {
      await axios.delete(`/api/scheduled-tasks/${taskId}`);
      loadTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  };

  const formatNextRun = (nextRunAt) => {
    if (!nextRunAt) return 'Not scheduled';
    const date = new Date(nextRunAt);
    return date.toLocaleString();
  };

  const formatLastRun = (lastRunAt) => {
    if (!lastRunAt) return 'Never';
    const date = new Date(lastRunAt);
    return date.toLocaleString();
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6">Scheduled Tasks</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setFormOpen(true)}
        >
          Add Task
        </Button>
      </Box>

      <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
        Schedule background tasks like library scanning and playlist synchronization using cron expressions.
      </Typography>

      {tasks.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body1" color="textSecondary">
            No scheduled tasks configured
          </Typography>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => setFormOpen(true)}
            sx={{ mt: 2 }}
          >
            Create First Task
          </Button>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Schedule</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Last Run</TableCell>
                <TableCell>Next Run</TableCell>
                <TableCell>Runs</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" fontWeight="medium">
                        {task.name}
                      </Typography>
                      {!task.enabled && (
                        <Chip label="Disabled" size="small" color="default" />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>{TASK_TYPE_LABELS[task.task_type] || task.task_type}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace">
                      {task.cron_expression}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      {CRON_PRESETS[task.cron_expression] || 'Custom schedule'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <TaskStatusChip 
                      status={task.last_run_status} 
                      lastError={task.last_error_message}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {formatLastRun(task.last_run_at)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {formatNextRun(task.next_run_at)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {task.successful_runs}/{task.total_runs}
                    </Typography>
                    {task.failed_runs > 0 && (
                      <Typography variant="caption" color="error">
                        ({task.failed_runs} failed)
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={() => {
                        setEditingTask(task);
                        setFormOpen(true);
                      }}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDeleteTask(task.id)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <TaskFormDialog
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingTask(null);
        }}
        onSave={editingTask ? handleEditTask : handleCreateTask}
        task={editingTask}
        isEditing={!!editingTask}
      />
    </Box>
  );
};

export default ScheduledTasksPanel;