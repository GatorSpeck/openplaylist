import React, { useEffect, useState } from 'react';
import {
  Snackbar,
  Alert,
  AlertTitle,
  Box,
  Typography,
} from '@mui/material';
import { useJobTracker } from '../lib/useJobTracker';
import { Job } from '../repositories/JobRepository';

interface JobNotificationsProps {
  autoHideDuration?: number;
}

const JobNotifications: React.FC<JobNotificationsProps> = ({
  autoHideDuration = 6000,
}) => {
  const { activeJobs, allJobs } = useJobTracker();
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    job: Job;
    type: 'completed' | 'failed';
    timestamp: number;
  }>>([]);
  const [shownJobIds, setShownJobIds] = useState<Set<string>>(new Set());

  // Track job completions and failures
  useEffect(() => {
    const newNotifications: Array<{
      id: string;
      job: Job;
      type: 'completed' | 'failed';
      timestamp: number;
    }> = [];

    // Check recently completed/failed jobs
    allJobs.forEach((job) => {
      if ((job.status === 'completed' || job.status === 'failed') && 
          !shownJobIds.has(job.id)) {
        
        // Only show notifications for jobs completed in the last minute
        const completedAt = job.completed_at ? new Date(job.completed_at) : new Date();
        const timeSinceCompletion = Date.now() - completedAt.getTime();
        
        if (timeSinceCompletion < 60000) { // 1 minute
          newNotifications.push({
            id: `${job.id}-${job.status}`,
            job,
            type: job.status as 'completed' | 'failed',
            timestamp: Date.now(),
          });
        }
      }
    });

    if (newNotifications.length > 0) {
      setNotifications(prev => [...prev, ...newNotifications]);
      setShownJobIds(prev => new Set([...prev, ...newNotifications.map(n => n.job.id)]));
    }
  }, [allJobs, shownJobIds]);

  const handleCloseNotification = (notificationId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  };

  const formatJobResult = (job: Job): string => {
    if (job.status === 'failed' && job.error) {
      return job.error;
    }

    if (job.status === 'completed' && job.result) {
      // Format common result types
      if (typeof job.result === 'object') {
        if (job.result.added_count !== undefined && job.result.updated_count !== undefined) {
          return `Added ${job.result.added_count} files, updated ${job.result.updated_count} files`;
        }
        if (job.result.duration_seconds !== undefined) {
          const duration = Math.round(job.result.duration_seconds);
          return `Completed in ${duration}s`;
        }
      }
    }

    return job.status === 'completed' ? 'Operation completed successfully' : 'Operation failed';
  };

  return (
    <>
      {notifications.map((notification) => (
        <Snackbar
          key={notification.id}
          open={true}
          autoHideDuration={autoHideDuration}
          onClose={() => handleCloseNotification(notification.id)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          sx={{
            // Stack multiple notifications
            transform: `translateY(-${notifications.indexOf(notification) * 70}px)`,
          }}
        >
          <Alert
            onClose={() => handleCloseNotification(notification.id)}
            severity={notification.type === 'completed' ? 'success' : 'error'}
            sx={{ minWidth: 300 }}
          >
            <AlertTitle>
              {notification.job.title}
            </AlertTitle>
            <Typography variant="body2">
              {formatJobResult(notification.job)}
            </Typography>
          </Alert>
        </Snackbar>
      ))}
    </>
  );
};

export default JobNotifications;