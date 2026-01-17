import React, { useState } from 'react';
import {
  Fab,
  Badge,
  Tooltip,
  Box,
} from '@mui/material';
import {
  Work as WorkIcon,
} from '@mui/icons-material';
import { useJobTracker } from '../../lib/useJobTracker';
import JobTrackerDrawer from './JobTrackerDrawer';

const JobTrackerFab: React.FC = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { activeJobs } = useJobTracker();

  const hasActiveJobs = activeJobs.length > 0;
  const activeJobCount = activeJobs.length;

  const handleOpenDrawer = () => {
    setDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
  };

  // Only show the FAB if there are active jobs or if the user has opened it before
  // For testing purposes, let's always show it initially
  // if (!hasActiveJobs && !drawerOpen) {
  //   return null;
  // }

  // Show always for now - you can uncomment the above condition later
  // if you want it to only appear when there are active jobs

  return (
    <>
      <Box
        sx={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          zIndex: 1200,
        }}
      >
        <Tooltip title={`${activeJobCount} active job${activeJobCount !== 1 ? 's' : ''}`}>
          <Badge 
            badgeContent={activeJobCount} 
            color="primary"
            max={99}
            invisible={!hasActiveJobs}
          >
            <Fab
              color={hasActiveJobs ? 'primary' : 'default'}
              size="medium"
              onClick={handleOpenDrawer}
              sx={{
                animation: hasActiveJobs ? 'pulse 2s infinite' : 'none',
                '@keyframes pulse': {
                  '0%': {
                    transform: 'scale(1)',
                  },
                  '50%': {
                    transform: 'scale(1.05)',
                  },
                  '100%': {
                    transform: 'scale(1)',
                  },
                },
              }}
            >
              <WorkIcon />
            </Fab>
          </Badge>
        </Tooltip>
      </Box>

      <JobTrackerDrawer
        open={drawerOpen}
        onClose={handleCloseDrawer}
      />
    </>
  );
};

export default JobTrackerFab;