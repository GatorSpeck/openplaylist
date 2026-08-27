import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
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

const STATUS_CLASSES = {
  success: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-900/30 dark:text-emerald-300',
  failed: 'border-red-300 bg-red-50 text-red-700 dark:border-red-700/50 dark:bg-red-900/30 dark:text-red-300',
  running: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-300',
};

const TaskStatusBadge = ({ status, lastError }) => {
  const classes = STATUS_CLASSES[status] ?? 'border-border bg-surface-subtle text-text/60 dark:border-border-dark dark:bg-surface-dark dark:text-text-dark/60';
  return (
    <span
      title={lastError || undefined}
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${classes}`}
    >
      {status || 'Pending'}
    </span>
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
  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylists, setSelectedPlaylists] = useState([]);

  useEffect(() => {
    if (isEditing && task) {
      setFormData({
        name: task.name || '',
        task_type: task.task_type || 'library_scan',
        cron_expression: task.cron_expression || '0 2 * * *',
        enabled: task.enabled !== undefined ? task.enabled : true,
        config: task.config || {},
      });
      const isPreset = Object.keys(CRON_PRESETS).includes(task.cron_expression || '');
      if (!isPreset) {
        setCustomCron(task.cron_expression || '');
      }
      if (task.task_type === 'playlist_sync' && task.config?.playlist_ids) {
        setSelectedPlaylists(task.config.playlist_ids);
      } else {
        setSelectedPlaylists([]);
      }
    } else {
      setFormData({ name: '', task_type: 'library_scan', cron_expression: '0 2 * * *', enabled: true, config: {} });
      setCustomCron('');
      setSelectedPlaylists([]);
    }
  }, [isEditing, task, open]);

  useEffect(() => {
    if (open) loadPlaylists();
  }, [open]);

  useEffect(() => {
    if (formData.cron_expression) validateCronExpression(formData.cron_expression);
  }, [formData.cron_expression]);

  const loadPlaylists = async () => {
    try {
      const response = await axios.get('/api/playlists/');
      setPlaylists(response.data || []);
    } catch (error) {
      console.error('Error loading playlists:', error);
      setPlaylists([]);
    }
  };

  const validateCronExpression = async (expression) => {
    if (!expression?.trim()) {
      setCronValidation({ valid: false, error: 'Cron expression is required', next_runs: [] });
      return;
    }
    setIsValidating(true);
    try {
      const response = await axios.post('/api/scheduled-tasks/validate-cron', { cron_expression: expression });
      setCronValidation(response.data);
    } catch (error) {
      console.error('Cron validation error:', error);
      setCronValidation({
        valid: false,
        error: error.response?.data?.detail || error.response?.data?.error || 'Failed to validate cron expression',
        next_runs: [],
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleChange = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

  const handleCronChange = (value) => {
    setCustomCron(value);
    handleChange('cron_expression', value);
  };

  const handlePresetChange = (preset) => {
    setCustomCron('');
    handleChange('cron_expression', preset);
  };

  const togglePlaylist = (id) => {
    setSelectedPlaylists(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = () => {
    if (!cronValidation.valid) return;
    let config = { ...formData.config };
    if (formData.task_type === 'playlist_sync') {
      if (selectedPlaylists.length > 0) {
        config.playlist_ids = selectedPlaylists;
      } else {
        delete config.playlist_ids;
      }
    } else {
      delete config.playlist_ids;
    }
    onSave({ ...formData, config });
  };

  const inputClass = 'w-full rounded border border-border bg-transparent px-3 py-2 text-sm text-text placeholder:text-text/50 focus:outline-none focus:ring-1 focus:ring-accent dark:border-border-dark dark:text-text-dark dark:placeholder:text-text-dark/50';
  const selectClass = 'w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent dark:border-border-dark dark:bg-surface-dark dark:text-text-dark';
  const labelClass = 'text-sm font-medium text-text dark:text-text-dark';
  const checkboxClass = 'h-4 w-4 rounded border border-border bg-surface text-accent focus:ring-accent dark:border-border-dark dark:bg-surface-dark';

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? 'Edit Task' : 'Create Scheduled Task'} size="lg">
      <div className="space-y-4">
        {/* Task Name */}
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Task Name *</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="Enter task name"
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Task Type */}
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Task Type</label>
            <select
              value={formData.task_type}
              onChange={(e) => handleChange('task_type', e.target.value)}
              className={selectClass}
            >
              <option value="library_scan" className="bg-surface text-text dark:bg-surface-dark dark:text-text-dark">Library Scan</option>
              <option value="playlist_sync" className="bg-surface text-text dark:bg-surface-dark dark:text-text-dark">Playlist Sync</option>
            </select>
          </div>

          {/* Enabled toggle */}
          <div className="flex items-end pb-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-text dark:text-text-dark">
              <input
                type="checkbox"
                checked={formData.enabled}
                onChange={(e) => handleChange('enabled', e.target.checked)}
                className={checkboxClass}
              />
              Enabled
            </label>
          </div>
        </div>

        {/* Playlist selector for playlist_sync */}
        {formData.task_type === 'playlist_sync' && (
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Playlists to Sync</label>
            <div className="max-h-40 overflow-y-auto rounded border border-border dark:border-border-dark">
              <label className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-2 hover:bg-surface-muted dark:border-border-dark dark:hover:bg-surface-dark-elevated">
                <input
                  type="checkbox"
                  checked={selectedPlaylists.length === 0}
                  onChange={() => setSelectedPlaylists([])}
                  className={checkboxClass}
                />
                <span className="text-sm italic text-text/70 dark:text-text-dark/70">All playlists with auto-sync enabled</span>
              </label>
              {playlists.map(playlist => (
                <label key={playlist.id} className="flex cursor-pointer items-center gap-2 border-b border-border/50 px-3 py-2 last:border-b-0 hover:bg-surface-muted dark:border-border-dark/50 dark:hover:bg-surface-dark-elevated">
                  <input
                    type="checkbox"
                    checked={selectedPlaylists.includes(playlist.id)}
                    onChange={() => togglePlaylist(playlist.id)}
                    className={checkboxClass}
                  />
                  <span className="text-sm text-text dark:text-text-dark">{playlist.name}</span>
                </label>
              ))}
            </div>
            <span className="text-xs text-text/60 dark:text-text-dark/60">
              {selectedPlaylists.length === 0
                ? 'Will sync all playlists that have auto-sync enabled in their settings'
                : `Will sync ${selectedPlaylists.length} selected playlist(s)`}
            </span>
          </div>
        )}

        {/* Cron Schedule */}
        <div className="flex flex-col gap-2">
          <label className={`${labelClass} text-base`}>Schedule (Cron Expression)</label>
          <p className="text-xs text-text/60 dark:text-text-dark/60">Choose a preset or enter a custom cron expression:</p>

          {/* Preset grid */}
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
            {Object.entries(CRON_PRESETS).map(([cron, label]) => (
              <button
                key={cron}
                type="button"
                onClick={() => handlePresetChange(cron)}
                className={`rounded border px-2 py-1.5 text-xs font-medium transition ${
                  formData.cron_expression === cron
                    ? 'border-accent bg-accent text-text-dark'
                    : 'border-border text-text hover:bg-surface-muted dark:border-border-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Custom cron */}
          <input
            type="text"
            value={customCron}
            onChange={(e) => handleCronChange(e.target.value)}
            placeholder="e.g., 0 */4 * * * (every 4 hours)"
            className={inputClass}
          />
          <span className="text-xs text-text/60 dark:text-text-dark/60">
            Format: minute hour day month day_of_week (times are in server timezone)
          </span>
        </div>

        {/* Validation result */}
        {isValidating ? (
          <div className="flex items-center gap-2 text-sm text-text/70 dark:text-text-dark/70">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-accent dark:border-border-dark dark:border-t-accent" />
            Validating...
          </div>
        ) : (
          <div>
            {!cronValidation.valid ? (
              <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700/50 dark:bg-red-900/30 dark:text-red-300">
                {cronValidation.error}
              </div>
            ) : (
              <div className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-900/30 dark:text-emerald-300">
                Valid cron expression
              </div>
            )}
            {cronValidation.next_runs && cronValidation.next_runs.length > 0 && (
              <div className="mt-2 rounded border border-border bg-surface-subtle p-3 dark:border-border-dark dark:bg-surface-dark">
                <p className="mb-1.5 text-xs font-medium text-text dark:text-text-dark">
                  Next 5 run times:
                  {cronValidation.timezone && (
                    <span className="ml-1 font-normal text-text/60 dark:text-text-dark/60">({cronValidation.timezone})</span>
                  )}
                </p>
                {cronValidation.next_runs.map((time, index) => (
                  <div key={index} className="text-xs text-text/70 dark:text-text-dark/70">
                    {new Date(time).toLocaleString()}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer buttons */}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border px-4 py-1.5 text-sm text-text transition hover:bg-surface-muted dark:border-border-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!cronValidation.valid || !formData.name.trim() || isValidating}
            className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-text-dark transition hover:bg-accent/90 disabled:opacity-50"
          >
            {isEditing ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

const ScheduledTasksPanel = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [runningTaskId, setRunningTaskId] = useState(null);

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
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    try {
      await axios.delete(`/api/scheduled-tasks/${taskId}`);
      loadTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  };

  const handleRunTaskNow = async (taskId) => {
    try {
      setRunningTaskId(taskId);
      await axios.post(`/api/scheduled-tasks/${taskId}/run`);
      loadTasks();
    } catch (error) {
      console.error('Error running task now:', error);
    } finally {
      setRunningTaskId(null);
    }
  };

  const formatDateTime = (dt) => dt ? new Date(dt).toLocaleString() : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent dark:border-border-dark dark:border-t-accent" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-text dark:text-text-dark">Scheduled Tasks</h3>
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="inline-flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-sm font-medium text-text-dark transition hover:bg-accent/90"
        >
          + Add Task
        </button>
      </div>

      <p className="mb-4 text-xs text-text/60 dark:text-text-dark/60">
        Schedule background tasks like library scanning and playlist synchronization using cron expressions.
        Playlist sync tasks can target specific playlists or all playlists with auto-sync enabled.
      </p>

      {tasks.length === 0 ? (
        <div className="rounded border border-border bg-surface-subtle p-6 text-center dark:border-border-dark dark:bg-surface-dark">
          <p className="mb-3 text-sm text-text/70 dark:text-text-dark/70">No scheduled tasks configured</p>
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="rounded border border-border px-4 py-1.5 text-sm text-text transition hover:bg-surface-muted dark:border-border-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated"
          >
            + Create First Task
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-border bg-surface dark:border-border-dark dark:bg-surface-dark">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-subtle text-xs font-medium text-text/70 dark:border-border-dark dark:bg-surface-dark dark:text-text-dark/70">
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Schedule</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Last Run</th>
                <th className="px-3 py-2 text-left">Next Run</th>
                <th className="px-3 py-2 text-left">Runs</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task, i) => (
                <tr
                  key={task.id}
                  className={`border-b border-border/50 last:border-b-0 dark:border-border-dark/50 ${i % 2 === 1 ? 'bg-row-alt dark:bg-surface-dark' : ''}`}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-text dark:text-text-dark">{task.name}</span>
                      {!task.enabled && (
                        <span className="rounded border border-border px-1 py-0.5 text-xs text-text/50 dark:border-border-dark dark:text-text-dark/50">Disabled</span>
                      )}
                    </div>
                    {task.task_type === 'playlist_sync' && task.config?.playlist_ids?.length > 0 && (
                      <div className="text-xs text-text/50 dark:text-text-dark/50">
                        Syncing {task.config.playlist_ids.length} specific playlist(s)
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-text/80 dark:text-text-dark/80">
                    {TASK_TYPE_LABELS[task.task_type] || task.task_type}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-mono text-xs text-text dark:text-text-dark">{task.cron_expression}</div>
                    <div className="text-xs text-text/50 dark:text-text-dark/50">
                      {CRON_PRESETS[task.cron_expression] || 'Custom schedule'}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <TaskStatusBadge status={task.last_run_status} lastError={task.last_error_message} />
                  </td>
                  <td className="px-3 py-2 text-xs text-text/70 dark:text-text-dark/70">
                    {formatDateTime(task.last_run_at) ?? 'Never'}
                  </td>
                  <td className="px-3 py-2 text-xs text-text/70 dark:text-text-dark/70">
                    {formatDateTime(task.next_run_at) ?? 'Not scheduled'}
                  </td>
                  <td className="px-3 py-2 text-xs text-text/70 dark:text-text-dark/70">
                    <div>{task.successful_runs}/{task.total_runs}</div>
                    {task.failed_runs > 0 && (
                      <div className="text-red-600 dark:text-red-400">({task.failed_runs} failed)</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      title="Run task now"
                      onClick={() => handleRunTaskNow(task.id)}
                      disabled={runningTaskId === task.id}
                      className="mr-1 rounded px-2 py-1 text-xs text-emerald-600/80 transition hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50 dark:text-emerald-400/80 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
                    >
                      {runningTaskId === task.id ? 'Running...' : 'Run Now'}
                    </button>
                    <button
                      type="button"
                      title="Edit task"
                      onClick={() => { setEditingTask(task); setFormOpen(true); }}
                      className="mr-1 rounded px-2 py-1 text-xs text-text/60 transition hover:bg-surface-muted hover:text-text dark:text-text-dark/60 dark:hover:bg-surface-dark-elevated dark:hover:text-text-dark"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      title="Delete task"
                      onClick={() => handleDeleteTask(task.id)}
                      className="rounded px-2 py-1 text-xs text-red-600/70 transition hover:bg-red-50 hover:text-red-700 dark:text-red-400/70 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TaskFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingTask(null); }}
        onSave={editingTask ? handleEditTask : handleCreateTask}
        task={editingTask}
        isEditing={!!editingTask}
      />
    </div>
  );
};

export default ScheduledTasksPanel;
