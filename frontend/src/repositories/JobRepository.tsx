import axios from 'axios';

export interface Job {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  title: string;
  description: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  progress: number;
  progress_message: string;
  result?: any;
  error?: string;
  metadata: Record<string, any>;
}

export interface JobSubmission {
  type: string;
  title?: string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface JobUpdate {
  status?: Job['status'];
  progress?: number;
  progress_message?: string;
  result?: any;
  error?: string;
}

export class JobRepository {
  private baseUrl = '/api/jobs';

  async createJob(submission: JobSubmission): Promise<Job> {
    const response = await axios.post(this.baseUrl, submission);
    return response.data;
  }

  async getJob(jobId: string): Promise<Job> {
    const response = await axios.get(`${this.baseUrl}/${jobId}`);
    return response.data;
  }

  async listJobs(options: {
    status?: string;
    type?: string;
    limit?: number;
  } = {}): Promise<Job[]> {
    const params = new URLSearchParams();
    if (options.status) params.append('status', options.status);
    if (options.type) params.append('type', options.type);
    if (options.limit) params.append('limit', options.limit.toString());

    const response = await axios.get(`${this.baseUrl}?${params}`);
    return response.data;
  }

  async getActiveJobs(): Promise<Job[]> {
    const response = await axios.get(`${this.baseUrl}/active`);
    return response.data;
  }

  async updateJob(jobId: string, update: JobUpdate): Promise<Job> {
    const response = await axios.patch(`${this.baseUrl}/${jobId}`, update);
    return response.data;
  }

  async cancelJob(jobId: string): Promise<void> {
    await axios.delete(`${this.baseUrl}/${jobId}`);
  }

  async cleanupJobs(): Promise<void> {
    await axios.post(`${this.baseUrl}/cleanup`);
  }

  // Operation endpoints
  async startLibraryScan(): Promise<{ message: string; job_id: string }> {
    const response = await axios.post('/api/scan');
    return response.data;
  }

  async startFullLibraryScan(): Promise<{ message: string; job_id: string }> {
    const response = await axios.post('/api/full-scan');
    return response.data;
  }

  async syncPlaylist(playlistId: number, forcePush = false): Promise<{ message: string; job_id: string }> {
    const response = await axios.post(`/api/playlists/${playlistId}/sync?force_push=${forcePush}`);
    return response.data;
  }
}

// Create a singleton instance
const jobRepository = new JobRepository();
export default jobRepository;