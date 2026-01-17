import { useState, useEffect, useCallback } from 'react';
import jobRepository, { Job } from '../repositories/JobRepository';

interface UseJobTrackerReturn {
  activeJobs: Job[];
  allJobs: Job[];
  loading: boolean;
  error: string | null;
  startLibraryScan: () => Promise<string>;
  startFullLibraryScan: () => Promise<string>;
  syncPlaylist: (playlistId: number, forcePush?: boolean) => Promise<string>;
  cancelJob: (jobId: string) => Promise<void>;
  refreshJobs: () => Promise<void>;
  refreshActiveJobs: () => Promise<void>;
  clearError: () => void;
}

export const useJobTracker = (
  pollInterval = 2000,
  autoRefresh = true
): UseJobTrackerReturn => {
  const [activeJobs, setActiveJobs] = useState<Job[]>([]);
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshActiveJobs = useCallback(async () => {
    try {
      const jobs = await jobRepository.getActiveJobs();
      setActiveJobs(jobs);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch active jobs:', err);
      if (err.response?.status !== 404) {
        setError(err.message || 'Failed to fetch active jobs');
      }
    }
  }, []);

  const refreshJobs = useCallback(async (limit = 20) => {
    try {
      setLoading(true);
      const jobs = await jobRepository.listJobs({ limit });
      setAllJobs(jobs);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch jobs:', err);
      setError(err.message || 'Failed to fetch jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  const startLibraryScan = useCallback(async (): Promise<string> => {
    try {
      setLoading(true);
      const result = await jobRepository.startLibraryScan();
      await refreshActiveJobs();
      setError(null);
      return result.job_id;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to start library scan';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [refreshActiveJobs]);

  const startFullLibraryScan = useCallback(async (): Promise<string> => {
    try {
      setLoading(true);
      const result = await jobRepository.startFullLibraryScan();
      await refreshActiveJobs();
      setError(null);
      return result.job_id;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to start full library scan';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [refreshActiveJobs]);

  const syncPlaylist = useCallback(async (playlistId: number, forcePush = false): Promise<string> => {
    try {
      setLoading(true);
      const result = await jobRepository.syncPlaylist(playlistId, forcePush);
      await refreshActiveJobs();
      setError(null);
      return result.job_id;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to start playlist sync';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [refreshActiveJobs]);

  const cancelJob = useCallback(async (jobId: string): Promise<void> => {
    try {
      await jobRepository.cancelJob(jobId);
      await refreshActiveJobs();
      setError(null);
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to cancel job';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [refreshActiveJobs]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Auto-refresh active jobs
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      if (activeJobs.length > 0) {
        refreshActiveJobs();
      }
    }, pollInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, activeJobs.length, pollInterval, refreshActiveJobs]);

  // Initial load of active jobs
  useEffect(() => {
    refreshActiveJobs();
  }, [refreshActiveJobs]);

  return {
    activeJobs,
    allJobs,
    loading,
    error,
    startLibraryScan,
    startFullLibraryScan,
    syncPlaylist,
    cancelJob,
    refreshJobs,
    refreshActiveJobs,
    clearError,
  };
};