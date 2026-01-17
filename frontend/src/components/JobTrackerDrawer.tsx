import React, { useState } from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemText,
  LinearProgress,
  Chip,
  Button,
  Alert,
  Divider,
  Tooltip,
  Badge,
  Fab,
} from '@mui/material';
import {
  Close as CloseIcon,
  Cancel as CancelIcon,
  Work as WorkIcon,
  Refresh as RefreshIcon,
  PlayArrow as PlayIcon,
  LibraryMusic as LibraryIcon,
  Sync as SyncIcon,
} from '@mui/icons-material';
import { useJobTracker } from '../lib/useJobTracker';
import { Job } from '../repositories/JobRepository';

interface JobTrackerDrawerProps {
  open: boolean;
  onClose: () => void;
}

const JobStatusChip: React.FC<{ status: Job['status'] }> = ({ status }) => {
  const getChipProps = () => {
    switch (status) {
      case 'pending':
        return { color: 'default' as const, label: 'Pending' };
      case 'running':
        return { color: 'primary' as const, label: 'Running' };
      case 'completed':
        return { color: 'success' as const, label: 'Completed' };
      case 'failed':
        return { color: 'error' as const, label: 'Failed' };
      case 'cancelled':
        return { color: 'warning' as const, label: 'Cancelled' };
      default:
        return { color: 'default' as const, label: status };
    }
  };

  const props = getChipProps();
  return <Chip size="small" {...props} />;
};

const JobTypeIcon: React.FC<{ type: string }> = ({ type }) => {
  switch (type) {
    case 'library_scan':
    case 'full_library_scan':
      return <LibraryIcon fontSize="small" />;
    case 'playlist_sync':
      return <SyncIcon fontSize="small" />;
    default:
      return <WorkIcon fontSize="small" />;
  }
};

const JobItem: React.FC<{ job: Job; onCancel: (jobId: string) => void }> = ({ job, onCancel }) => {
  const formatDuration = (startTime?: string, endTime?: string) => {
    if (!startTime) return null;
    
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const durationMs = end.getTime() - start.getTime();
    const seconds = Math.floor(durationMs / 1000);
    
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  const canCancel = job.status === 'pending' || job.status === 'running';
  const isActive = job.status === 'pending' || job.status === 'running';
  const duration = formatDuration(job.started_at, job.completed_at);

  return (
    <ListItem
      sx={{
        border: 1,
        borderColor: isActive ? 'primary.main' : 'divider',
        borderRadius: 1,
        mb: 1,
        backgroundColor: isActive ? 'action.hover' : 'background.paper',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', mr: 2 }}>
        <JobTypeIcon type={job.type} />
      </Box>
      
      <ListItemText
        primary={
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 500 }}>
              {job.title}
            </Typography>
            <JobStatusChip status={job.status} />
          </Box>
        }
        secondary={
          <Box>
            {job.description && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                {job.description}
              </Typography>
            )}
            
            {job.progress_message && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                {job.progress_message}
              </Typography>
            )}

            {isActive && (
              <Box sx={{ mt: 1 }}>
                <LinearProgress 
                  variant="determinate" 
                  value={job.progress * 100} 
                  sx={{ height: 4, borderRadius: 2 }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  {(job.progress * 100).toFixed(1)}%
                </Typography>
              </Box>
            )}

            {job.error && (
              <Alert severity="error" sx={{ mt: 1 }}>
                <Typography variant="caption">{job.error}</Typography>
              </Alert>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
              <Typography variant="caption" color="text.secondary">
                {duration && `Duration: ${duration}`}
              </Typography>
              
              {canCancel && (
                <Tooltip title="Cancel job">
                  <IconButton 
                    size="small" 
                    color="error" 
                    onClick={() => onCancel(job.id)}
                  >
                    <CancelIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          </Box>
        }
      />
    </ListItem>
  );
};

const JobTrackerDrawer: React.FC<JobTrackerDrawerProps> = ({ open, onClose }) => {
  const {
    activeJobs,
    allJobs,
    loading,
    error,
    startLibraryScan,
    startFullLibraryScan,
    cancelJob,
    refreshJobs,
    refreshActiveJobs,
    clearError,
  } = useJobTracker();

  const [showAllJobs, setShowAllJobs] = useState(false);

  const handleStartLibraryScan = async () => {
    try {
      await startLibraryScan();
    } catch (err) {
      // Error is already handled by the hook
    }
  };

  const handleStartFullLibraryScan = async () => {
    try {
      await startFullLibraryScan();
    } catch (err) {
      // Error is already handled by the hook
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      await cancelJob(jobId);
    } catch (err) {
      // Error is already handled by the hook
    }
  };

  const handleToggleView = () => {
    if (!showAllJobs) {
      refreshJobs();
    }
    setShowAllJobs(!showAllJobs);
  };

  const jobsToShow = showAllJobs ? allJobs : activeJobs;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{
        '& .MuiDrawer-paper': {
          width: 400,
          maxWidth: '90vw',
        },
      }}
    >
      <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6" component="h2">
            Job Tracker
          </Typography>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>

        {/* Error Alert */}
        {error && (
          <Alert 
            severity="error" 
            onClose={clearError}
            sx={{ mb: 2 }}
          >
            {error}
          </Alert>
        )}

        {/* Action Buttons */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Start Operations
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<LibraryIcon />}
              onClick={handleStartLibraryScan}
              disabled={loading}
            >
              Library Scan
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<LibraryIcon />}
              onClick={handleStartFullLibraryScan}
              disabled={loading}
            >
              Full Scan
            </Button>
          </Box>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* View Toggle */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box>
            <Button
              size="small"
              variant={!showAllJobs ? 'contained' : 'text'}
              onClick={() => !showAllJobs || handleToggleView()}
            >
              Active ({activeJobs.length})
            </Button>
            <Button
              size="small"
              variant={showAllJobs ? 'contained' : 'text'}
              onClick={handleToggleView}
              sx={{ ml: 1 }}
            >
              All Jobs
            </Button>
          </Box>
          
          <IconButton 
            size="small" 
            onClick={showAllJobs ? refreshJobs : refreshActiveJobs}
            disabled={loading}
          >
            <RefreshIcon />
          </IconButton>
        </Box>

        {/* Jobs List */}
        <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
          {jobsToShow.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <WorkIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
              <Typography variant="body2" color="text.secondary">
                {showAllJobs ? 'No jobs found' : 'No active jobs'}
              </Typography>
            </Box>
          ) : (
            <List sx={{ p: 0 }}>
              {jobsToShow.map((job) => (
                <JobItem
                  key={job.id}
                  job={job}
                  onCancel={handleCancelJob}
                />
              ))}
            </List>
          )}
        </Box>
      </Box>
    </Drawer>
  );
};

export default JobTrackerDrawer;