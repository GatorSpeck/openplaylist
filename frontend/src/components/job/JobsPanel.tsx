import React, { useEffect } from 'react';
import { Box, Typography, Button, List, ListItem, ListItemText, 
         Chip, LinearProgress, Accordion, AccordionSummary, 
         AccordionDetails, Divider } from '@mui/material';
import { ExpandMore as ExpandMoreIcon, PlayArrow as PlayIcon, 
         CheckCircle as CheckCircleIcon, Error as ErrorIcon,
         Schedule as ScheduleIcon } from '@mui/icons-material';
import { useJobTracker } from '../../lib/useJobTracker';
import { JobRepository } from '../../repositories/JobRepository';

const JobsPanel: React.FC = () => {
  const { 
    activeJobs, 
    allJobs, 
    loading, 
    error, 
    startLibraryScan, 
    startFullLibraryScan,
    refreshJobs 
  } = useJobTracker();

  // Load job history when component mounts
  useEffect(() => {
    refreshJobs();
  }, [refreshJobs]);

  const handleStartLibraryScan = async () => {
    try {
      await startLibraryScan();
    } catch (error) {
      console.error('Failed to start library scan:', error);
    }
  };

  const handleStartFullLibraryScan = async () => {
    try {
      await startFullLibraryScan();
    } catch (error) {
      console.error('Failed to start full library scan:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <PlayIcon color="primary" />;
      case 'completed':
        return <CheckCircleIcon color="success" />;
      case 'failed':
        return <ErrorIcon color="error" />;
      default:
        return <ScheduleIcon color="action" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'primary';
      case 'completed':
        return 'success';
      case 'failed':
        return 'error';
      default:
        return 'default';
    }
  };

  // activeJobs already contains running jobs, allJobs contains job history
  const completedJobs = allJobs.filter(job => job.status === 'completed' || job.status === 'failed');

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Background Jobs
      </Typography>

      <Box mb={3}>
        <Typography variant="subtitle2" gutterBottom>
          Start New Tasks
        </Typography>
        <Box display="flex" gap={2} mb={2}>
          <Button
            variant="outlined"
            onClick={handleStartLibraryScan}
            disabled={loading}
            startIcon={<PlayIcon />}
          >
            Library Scan (Incremental)
          </Button>
          <Button
            variant="outlined"
            onClick={handleStartFullLibraryScan}
            disabled={loading}
            startIcon={<PlayIcon />}
          >
            Full Library Scan
          </Button>
        </Box>
      </Box>

      <Divider sx={{ mb: 2 }} />

      {error && (
        <Typography color="error" gutterBottom>
          Error: {error}
        </Typography>
      )}

      {/* Active Jobs */}
      {activeJobs.length > 0 && (
        <Box mb={3}>
          <Typography variant="subtitle2" gutterBottom>
            Running Jobs ({activeJobs.length})
          </Typography>
          <List>
            {activeJobs.map(job => (
              <ListItem key={job.id} sx={{ px: 0 }}>
                <Box width="100%">
                  <Box display="flex" alignItems="center" mb={1}>
                    {getStatusIcon(job.status)}
                    <ListItemText
                      primary={job.title || job.type}
                      secondary={job.progress_message || job.description}
                      sx={{ ml: 1 }}
                    />
                    <Chip 
                      label={job.status} 
                      size="small" 
                      color={getStatusColor(job.status) as any}
                    />
                  </Box>
                  {job.progress !== undefined && job.progress !== null && (
                    <LinearProgress 
                      variant="determinate" 
                      value={job.progress} 
                      sx={{ mb: 1 }}
                    />
                  )}
                  {job.progress !== undefined && job.progress !== null && (
                    <Typography variant="caption" color="textSecondary">
                      {Math.round(job.progress)}% complete
                    </Typography>
                  )}
                </Box>
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      {/* Job History */}
      {completedJobs.length > 0 && (
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">
              Job History ({completedJobs.length} recent jobs)
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <List>
              {completedJobs.slice(0, 10).map(job => (
                <ListItem key={job.id} sx={{ px: 0 }}>
                  <Box display="flex" alignItems="center" width="100%">
                    {getStatusIcon(job.status)}
                    <ListItemText
                      primary={job.title || job.type}
                      secondary={
                        <Box>
                          <Typography variant="body2" component="div">
                            {job.type} - {job.progress_message || job.description}
                          </Typography>
                          {job.created_at && (
                            <Typography variant="caption" color="textSecondary">
                              {new Date(job.created_at).toLocaleString()}
                            </Typography>
                          )}
                          {job.completed_at && (
                            <Typography variant="caption" color="textSecondary" display="block">
                              Completed: {new Date(job.completed_at).toLocaleString()}
                            </Typography>
                          )}
                        </Box>
                      }
                      sx={{ ml: 1 }}
                    />
                    <Chip 
                      label={job.status} 
                      size="small" 
                      color={getStatusColor(job.status) as any}
                    />
                  </Box>
                </ListItem>
              ))}
            </List>
          </AccordionDetails>
        </Accordion>
      )}

      {activeJobs.length === 0 && allJobs.length === 0 && !loading && (
        <Typography color="textSecondary" textAlign="center" py={3}>
          No jobs found. Start a library scan to see background tasks here.
        </Typography>
      )}
    </Box>
  );
};

export default JobsPanel;