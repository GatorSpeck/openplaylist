import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Modal from '../common/Modal';

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
  const [scheduledTasks, setScheduledTasks] = useState([]);
  const [showCreateTask, setShowCreateTask] = useState(false);

  useEffect(() => {
    if (open && playlistId) {
      loadSettings();
      loadScheduledTasks();
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

  const loadScheduledTasks = async () => {
    try {
      const response = await axios.get('/api/scheduled-tasks/');
      const playlistSyncTasks = response.data.filter(task => 
        task.task_type === 'playlist_sync' && 
        task.enabled &&
        (
          !task.config.playlist_ids || 
          task.config.playlist_ids.length === 0 || 
          task.config.playlist_ids.includes(playlistId)
        )
      );
      setScheduledTasks(playlistSyncTasks);
    } catch (error) {
      console.error('Error loading scheduled tasks:', error);
      setScheduledTasks([]);
    }
  };

  const createScheduledTask = async () => {
    try {
      const taskData = {
        name: `Auto-sync ${playlistName}`,
        task_type: 'playlist_sync',
        cron_expression: settings.auto_sync_schedule || '0 2 * * *',
        enabled: true,
        config: {
          playlist_ids: [playlistId]
        }
      };
      
      await axios.post('/api/scheduled-tasks/', taskData);
      loadScheduledTasks(); // Refresh the list
      setShowCreateTask(false);
    } catch (error) {
      console.error('Error creating scheduled task:', error);
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
      <Modal open={open} onClose={onClose} title={`Auto-Sync Settings for "${playlistName}"`}>
        <div className="flex items-center justify-center py-8">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-accent dark:border-border-dark dark:border-t-accent" />
        </div>
      </Modal>
    );
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title={`Auto-Sync Settings for "${playlistName}"`}>
        <div className="pt-1">
          <p className="mb-3 text-sm text-text/75 dark:text-text-dark/75">
            Configure automatic synchronization for this playlist with external services.
          </p>

          <label className="mb-4 inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-text dark:text-text-dark">
            <input
              type="checkbox"
              checked={settings.auto_sync_enabled}
              onChange={(e) => setSettings(prev => ({ ...prev, auto_sync_enabled: e.target.checked }))}
              className="h-4 w-4 rounded border border-border text-accent focus:ring-accent dark:border-border-dark dark:bg-surface-dark"
            />
            Enable Auto-Sync
          </label>

          {settings.auto_sync_enabled && (
            <div className="mt-2">
              <h3 className="mb-2 text-base font-semibold text-text dark:text-text-dark">
                Sync Schedule (Cron Expression)
              </h3>
              
              <div className="mb-2">
                <p className="mb-2 text-sm text-text/75 dark:text-text-dark/75">
                  Choose a preset or enter a custom cron expression:
                </p>
                
                <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(CRON_PRESETS).map(([cron, label]) => (
                    <button
                      key={cron}
                      type="button"
                      className={`w-full rounded border px-3 py-1.5 text-xs font-medium transition ${settings.auto_sync_schedule === cron ? 'border-accent bg-accent text-text-dark' : 'border-border bg-surface text-text hover:bg-surface-subtle dark:border-border-dark dark:bg-surface-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated'}`}
                        onClick={() => handlePresetChange(cron)}
                      >
                        {label}
                    </button>
                  ))}
                </div>

                <label className="mb-1 block text-sm font-medium text-text dark:text-text-dark" htmlFor="custom-cron-expression">
                  Custom Cron Expression
                </label>
                <input
                  id="custom-cron-expression"
                  type="text"
                  placeholder="e.g., 0 */4 * * * (every 4 hours)"
                  value={customCron}
                  onChange={(e) => handleCronChange(e.target.value)}
                  className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text/60 dark:border-border-dark dark:bg-surface-dark dark:text-text-dark dark:placeholder:text-text-dark/60"
                />
                <p className="mt-1 text-xs text-text/70 dark:text-text-dark/70">
                  Format: minute hour day month day_of_week (times are in server timezone)
                </p>
              </div>

              {isValidating ? (
                <div className="mb-2 flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-accent dark:border-border-dark dark:border-t-accent" />
                  <p className="text-sm text-text dark:text-text-dark">Validating...</p>
                </div>
              ) : (
                <div className="mb-2">
                  {!cronValidation.valid ? (
                    <div className="mb-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
                      {cronValidation.error}
                    </div>
                  ) : (
                    <div className="mb-2 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200">
                      Valid cron expression
                    </div>
                  )}
                  
                  {cronValidation.next_runs && cronValidation.next_runs.length > 0 && (
                    <div className="rounded border border-border bg-surface-subtle p-3 dark:border-border-dark dark:bg-surface-dark">
                      <p className="mb-1 text-sm font-medium text-text dark:text-text-dark">
                        Next 5 sync times:
                        {cronValidation.timezone && (
                          <span className="text-xs font-normal text-text/70 dark:text-text-dark/70">
                            {' '}({cronValidation.timezone})
                          </span>
                        )}
                      </p>
                      {cronValidation.next_runs.map((time, index) => (
                        <p key={index} className="text-sm text-text/80 dark:text-text-dark/80">
                          {new Date(time).toLocaleString()}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="rounded border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-200">
                Auto-sync will use the configured sync targets for this playlist. 
                Make sure you have set up sync targets in the playlist sync configuration.
              </div>

              <div className="mt-3">
                <h3 className="mb-2 text-base font-semibold text-text dark:text-text-dark">
                  Scheduled Tasks
                </h3>
                
                {scheduledTasks.length > 0 ? (
                  <div>
                    <p className="mb-2 text-sm text-text/75 dark:text-text-dark/75">
                      This playlist will be synced by the following scheduled tasks:
                    </p>
                    {scheduledTasks.map((task) => (
                      <div key={task.id} className="mt-1 rounded border border-border bg-surface-subtle p-3 dark:border-border-dark dark:bg-surface-dark">
                        <p className="text-sm font-medium text-text dark:text-text-dark">
                          {task.name}
                        </p>
                        <p className="text-xs text-text/70 dark:text-text-dark/70">
                          Schedule: {task.cron_expression}
                        </p>
                        {task.next_run_at && (
                          <p className="text-xs text-text/70 dark:text-text-dark/70">
                            Next run: {new Date(task.next_run_at).toLocaleString()}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div>
                    <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                      No scheduled tasks are configured to sync this playlist. 
                      Auto-sync is enabled but won't run without a scheduled task.
                    </div>
                    <button
                      type="button"
                      className="rounded border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text transition hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50 dark:border-border-dark dark:bg-surface-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated"
                      onClick={() => setShowCreateTask(true)}
                      disabled={!settings.auto_sync_schedule}
                    >
                      Create Scheduled Task
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2 border-t border-border pt-3 dark:border-border-dark">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text transition hover:bg-surface-subtle dark:border-border-dark dark:bg-surface-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated"
            >
              Cancel
            </button>
            <button
              type="button"
          onClick={handleSave} 
              className="inline-flex items-center rounded bg-accent px-3 py-1.5 text-sm font-semibold text-text-dark transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              disabled={saving || (settings.auto_sync_enabled && !cronValidation.valid) || isValidating}
            >
              {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-text-dark/40 border-t-text-dark" /> : 'Save'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={showCreateTask} onClose={() => setShowCreateTask(false)} title="Create Scheduled Task">
        <p className="mb-4 text-sm text-text dark:text-text-dark">
          This will create a scheduled task to automatically sync "{playlistName}" using the schedule: <strong>{settings.auto_sync_schedule}</strong>
        </p>
        <div className="flex justify-end gap-2 border-t border-border pt-3 dark:border-border-dark">
          <button
            type="button"
            onClick={() => setShowCreateTask(false)}
            className="rounded border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text transition hover:bg-surface-subtle dark:border-border-dark dark:bg-surface-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={createScheduledTask}
            className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-text-dark transition hover:bg-accent-hover"
          >
            Create Task
          </button>
        </div>
      </Modal>
    </>
  );
};

export default PlaylistAutoSyncDialog;