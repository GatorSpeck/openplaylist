import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import PathSelector from './PathSelector';
import LogsPanel from './LogsPanel';
import DarkModeToggle from '../common/DarkModeToggle';
import JobsPanel from '../job/JobsPanel';
import axios from 'axios';

const TABS = [
  'Music Paths', 'Jobs', 'Playlist Sync', 'Database', 'Last.fm',
  'Plex', 'OpenAI', 'Redis', 'Spotify', 'YouTube Music', 'Logs', 'Theme',
];

// Tabs where the Save button is not applicable
const NO_SAVE_TABS = new Set(['Jobs', 'Database', 'Logs', 'Theme']);

const DEFAULT_PLAYLIST_SYNC_DEFAULTS = {
  enabled: false,
  services: {
    plex: false,
    spotify: false,
    youtube: false,
  },
};

const SpotifyConnectionPanel = () => {
  const [status, setStatus] = useState({
    loading: true,
    authenticated: false,
    error: null,
    user: null,
  });

  useEffect(() => {
    checkSpotifyStatus();
  }, []);

  const checkSpotifyStatus = async () => {
    setStatus(prev => ({ ...prev, loading: true }));
    try {
      const response = await axios.get('/api/spotify/status');
      setStatus({
        loading: false,
        authenticated: response.data.authenticated,
        error: response.data.error,
        user: response.data.user,
      });
    } catch (error) {
      console.error('Error checking Spotify status:', error);
      setStatus({
        loading: false,
        authenticated: false,
        error: error.response?.data?.detail || 'Failed to check Spotify status',
        user: null,
      });
    }
  };

  const handleConnect = () => {
    window.location.href = '/api/spotify/login';
  };

  const handleDisconnect = async () => {
    try {
      await axios.get('/api/spotify/logout');
      checkSpotifyStatus();
    } catch (error) {
      console.error('Error disconnecting from Spotify:', error);
      setStatus(prev => ({ ...prev, error: 'Failed to disconnect from Spotify' }));
    }
  };

  if (status.loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent dark:border-border-dark dark:border-t-accent" />
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-4 text-base font-semibold text-text dark:text-text-dark">Spotify Connection</h3>

      {status.error && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700/50 dark:bg-red-900/30 dark:text-red-300">
          {status.error}
        </div>
      )}

      {status.authenticated ? (
        <div className="mb-4 rounded border border-border bg-surface-subtle p-4 dark:border-border-dark dark:bg-surface-dark">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#1DB954] text-text-dark">
              {status.user?.images?.[0]?.url ? (
                <img src={status.user.images[0].url} alt={status.user?.display_name} className="h-full w-full object-cover" />
              ) : (
                <span className="text-sm font-bold">S</span>
              )}
            </div>
            <div>
              <div className="text-sm font-medium text-text dark:text-text-dark">
                {status.user?.display_name || 'Spotify User'}
              </div>
              <div className="text-xs text-text/60 dark:text-text-dark/60">{status.user?.email || ''}</div>
            </div>
          </div>
          <div className="mb-3 text-sm font-medium text-emerald-600 dark:text-emerald-400">Connected to Spotify</div>
          <button
            type="button"
            onClick={handleDisconnect}
            className="rounded border border-border px-3 py-1.5 text-sm text-text transition hover:bg-surface-muted dark:border-border-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <div className="mb-4 rounded border border-border p-6 text-center dark:border-border-dark">
          <p className="mb-4 text-sm text-text/80 dark:text-text-dark/80">
            Connect your Spotify account to enable playlist synchronization
          </p>
          <button
            type="button"
            onClick={handleConnect}
            className="inline-flex items-center gap-2 rounded bg-[#1DB954] px-4 py-2 text-sm font-medium text-text-dark transition hover:bg-[#1AA34A]"
          >
            Connect to Spotify
          </button>
        </div>
      )}

      <p className="text-xs text-text/60 dark:text-text-dark/60">
        Connecting to Spotify allows you to synchronize playlists between your local collection and Spotify.
      </p>
    </div>
  );
};

const YouTubeMusicConnectionPanel = () => {
  const [status, setStatus] = useState({
    loading: true,
    authenticated: false,
    error: null,
    user: null,
  });

  useEffect(() => {
    checkYouTubeMusicStatus();
  }, []);

  const checkYouTubeMusicStatus = async () => {
    setStatus(prev => ({ ...prev, loading: true }));
    try {
      const response = await axios.get('/api/youtube/status');
      setStatus({
        loading: false,
        authenticated: response.data.authenticated,
        error: response.data.error,
        user: response.data.user,
      });
    } catch (error) {
      console.error('Error checking YouTube Music status:', error);
      setStatus({
        loading: false,
        authenticated: false,
        error: error.response?.data?.detail || 'Failed to check YouTube Music status',
        user: null,
      });
    }
  };

  if (status.loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent dark:border-border-dark dark:border-t-accent" />
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-4 text-base font-semibold text-text dark:text-text-dark">YouTube Music Connection</h3>

      {status.error && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700/50 dark:bg-red-900/30 dark:text-red-300">
          {status.error}
        </div>
      )}

      {status.authenticated ? (
        <div className="mb-4 rounded border border-border bg-surface-subtle p-4 dark:border-border-dark dark:bg-surface-dark">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FF0000] text-text-dark">
              <span className="text-sm font-bold">YT</span>
            </div>
            <div>
              <div className="text-sm font-medium text-text dark:text-text-dark">YouTube Music User</div>
              <div className="text-xs text-text/60 dark:text-text-dark/60">
                Library Access: {status.user?.library_accessible ? 'Yes' : 'No'}
              </div>
              {status.user?.playlists_count !== undefined && (
                <div className="text-xs text-text/60 dark:text-text-dark/60">
                  Playlists: {status.user.playlists_count}
                </div>
              )}
            </div>
          </div>
          <div className="mb-3 text-sm font-medium text-emerald-600 dark:text-emerald-400">Connected to YouTube Music</div>
          <button
            type="button"
            onClick={checkYouTubeMusicStatus}
            className="rounded border border-border px-3 py-1.5 text-sm text-text transition hover:bg-surface-muted dark:border-border-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated"
          >
            Refresh Status
          </button>
        </div>
      ) : (
        <div className="mb-4 rounded border border-border p-6 text-center dark:border-border-dark">
          <p className="mb-2 text-sm text-text/80 dark:text-text-dark/80">
            YouTube Music requires OAuth credentials and authentication
          </p>
          <p className="mb-4 text-xs text-text/60 dark:text-text-dark/60">
            Please configure your OAuth credentials and ensure the oauth.json file is properly set up.
          </p>
          <button
            type="button"
            onClick={checkYouTubeMusicStatus}
            className="inline-flex items-center gap-2 rounded border border-[#FF0000] px-4 py-2 text-sm font-medium text-[#FF0000] transition hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            Check Status
          </button>
        </div>
      )}

      <p className="text-xs text-text/60 dark:text-text-dark/60">
        YouTube Music integration allows you to import playlists and synchronize with your YouTube Music library.
      </p>
    </div>
  );
};

const DatabaseMigrationsPanel = () => {
  const [migrationStatus, setMigrationStatus] = useState({
    loading: true,
    error: null,
    current_revision: null,
    head_revision: null,
    needs_upgrade: false,
    pending_count: 0,
    migrations: [],
    status: 'checking',
  });
  const [isUpgrading, setIsUpgrading] = useState(false);

  useEffect(() => {
    checkMigrationStatus();
  }, []);

  const checkMigrationStatus = async () => {
    setMigrationStatus(prev => ({ ...prev, loading: true, error: null }));
    try {
      const response = await axios.get('/api/settings/migrations/status');
      setMigrationStatus({ loading: false, error: response.data.error || null, ...response.data });
    } catch (error) {
      console.error('Failed to check migration status:', error);
      setMigrationStatus(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to check migration status: ' + (error.response?.data?.detail || error.message),
      }));
    }
  };

  const runMigrations = async () => {
    setIsUpgrading(true);
    try {
      const response = await axios.post('/api/settings/migrations/upgrade');
      if (response.data.success) {
        await checkMigrationStatus();
      }
    } catch (error) {
      console.error('Migration upgrade failed:', error);
      const errorMsg = error.response?.data?.detail?.error || error.response?.data?.detail || error.message;
      setMigrationStatus(prev => ({ ...prev, error: 'Migration failed: ' + errorMsg }));
    } finally {
      setIsUpgrading(false);
    }
  };

  const getStatusBadge = () => {
    if (migrationStatus.error) {
      return (
        <span className="inline-flex items-center rounded border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:border-red-700/50 dark:bg-red-900/30 dark:text-red-300">
          Error
        </span>
      );
    }
    if (migrationStatus.needs_upgrade) {
      return (
        <span className="inline-flex items-center rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-300">
          {migrationStatus.pending_count} pending
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-900/30 dark:text-emerald-300">
        Up to date
      </span>
    );
  };

  if (migrationStatus.loading) {
    return (
      <div className="flex items-center justify-center gap-3 p-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent dark:border-border-dark dark:border-t-accent" />
        <span className="text-sm text-text/70 dark:text-text-dark/70">Checking database migration status...</span>
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-4 text-base font-semibold text-text dark:text-text-dark">Database Migrations</h3>

      {migrationStatus.error && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700/50 dark:bg-red-900/30 dark:text-red-300">
          {migrationStatus.error}
        </div>
      )}

      <div className="mb-4 rounded border border-border bg-surface-subtle p-4 dark:border-border-dark dark:bg-surface-dark">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-text dark:text-text-dark">Migration Status</div>
            <div className="text-xs text-text/60 dark:text-text-dark/60">
              {migrationStatus.needs_upgrade
                ? `${migrationStatus.pending_count} pending migration(s)`
                : migrationStatus.error
                  ? 'Error'
                  : 'Up to date'}
            </div>
          </div>
          {getStatusBadge()}
        </div>

        <div className="my-3 border-t border-border dark:border-border-dark" />

        <div className="space-y-1 text-xs text-text/70 dark:text-text-dark/70">
          <div><strong>Current Revision:</strong> {migrationStatus.current_revision}</div>
          <div><strong>Latest Revision:</strong> {migrationStatus.head_revision}</div>
        </div>

        {migrationStatus.needs_upgrade && (
          <div className="mt-3">
            <div className="mb-3 rounded border border-sky-300 bg-sky-50 p-3 text-sm text-sky-700 dark:border-sky-700/50 dark:bg-sky-900/30 dark:text-sky-300">
              Your database has {migrationStatus.pending_count} pending migration(s).
              Click "Run Migrations" to update your database to the latest version.
            </div>
            <button
              type="button"
              onClick={runMigrations}
              disabled={isUpgrading}
              className="inline-flex items-center gap-2 rounded bg-accent px-3 py-1.5 text-sm font-medium text-text-dark transition hover:bg-accent/90 disabled:opacity-50"
            >
              {isUpgrading && (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border-dark border-t-text-dark" />
              )}
              {isUpgrading ? 'Running Migrations...' : 'Run Migrations'}
            </button>
          </div>
        )}

        <div className="mt-3">
          <button
            type="button"
            onClick={checkMigrationStatus}
            disabled={migrationStatus.loading}
            className="rounded border border-border px-3 py-1.5 text-sm text-text transition hover:bg-surface-muted disabled:opacity-50 dark:border-border-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated"
          >
            Refresh Status
          </button>
        </div>
      </div>

      {migrationStatus.migrations && migrationStatus.migrations.length > 0 && (
        <div className="mb-4 rounded border border-border bg-surface-subtle p-4 dark:border-border-dark dark:bg-surface-dark">
          <h4 className="mb-3 text-sm font-semibold text-text dark:text-text-dark">Recent Migrations</h4>
          <ul className="space-y-2">
            {migrationStatus.migrations.map((migration, index) => (
              <li key={index} className="flex items-start gap-2 text-xs">
                <code className="shrink-0 rounded bg-surface-muted px-1.5 py-0.5 font-mono text-text/80 dark:bg-surface-dark dark:text-text-dark/80">
                  {migration.revision}
                </code>
                {migration.is_current && (
                  <span className="shrink-0 rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-medium text-accent">
                    Current
                  </span>
                )}
                <span className="text-text/70 dark:text-text-dark/70">{migration.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-text/60 dark:text-text-dark/60">
        Database migrations update your database schema to match the latest application version.
        Always backup your database before running migrations in production.
      </p>
    </div>
  );
};

const PlaylistSyncDefaultsPanel = ({ settings, value, onChange, disabled }) => {
  const configuredByService = {
    plex: Boolean(settings.plexConfigured),
    spotify: Boolean(settings.spotifyConfigured),
    youtube: Boolean(settings.youtubeMusicConfigured),
  };

  const services = [
    {
      key: 'plex',
      title: 'Plex',
      description: 'Create a Plex sync target that matches the local playlist name.',
    },
    {
      key: 'spotify',
      title: 'Spotify',
      description: 'Create a Spotify sync target and let the first sync create or match the remote playlist by name.',
    },
    {
      key: 'youtube',
      title: 'YouTube Music',
      description: 'Create a YouTube Music sync target and let the first sync create or match the remote playlist by name.',
    },
  ];

  const handleEnabledChange = (enabled) => {
    onChange({
      ...value,
      enabled,
    });
  };

  const handleServiceChange = (service, enabled) => {
    onChange({
      ...value,
      services: {
        ...value.services,
        [service]: enabled,
      },
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-text dark:text-text-dark">Playlist Sync Defaults</h3>
        <p className="mt-1 text-sm text-text/75 dark:text-text-dark/75">
          Automatically enable playlist auto-sync for newly created playlists and seed sync targets for the selected services.
        </p>
      </div>

      <div className="rounded border border-border bg-surface-subtle p-4 dark:border-border-dark dark:bg-surface-dark">
        <label className="flex items-start gap-3 text-sm text-text dark:text-text-dark">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => handleEnabledChange(e.target.checked)}
            disabled={disabled}
            className="mt-0.5 h-4 w-4 rounded border border-border bg-surface text-accent focus:ring-accent disabled:cursor-not-allowed dark:border-border-dark dark:bg-surface-dark"
          />
          <span>
            <span className="block font-medium">Enable auto-sync by default for new playlists</span>
            <span className="mt-1 block text-xs text-text/65 dark:text-text-dark/65">
              New playlists will be marked auto-sync eligible and configured to sync to same-named playlists on the enabled services below.
            </span>
          </span>
        </label>
      </div>

      <div className="space-y-3">
        {services.map((service) => {
          const isConfigured = configuredByService[service.key];
          return (
            <label
              key={service.key}
              className={`flex items-start gap-3 rounded border p-4 text-sm ${isConfigured ? 'border-border bg-surface-subtle dark:border-border-dark dark:bg-surface-dark' : 'border-border bg-surface-subtle opacity-60 dark:border-border-dark dark:bg-surface-dark'}`}
            >
              <input
                type="checkbox"
                checked={Boolean(value.services?.[service.key])}
                onChange={(e) => handleServiceChange(service.key, e.target.checked)}
                disabled={disabled || !value.enabled || !isConfigured}
                className="mt-0.5 h-4 w-4 rounded border border-border bg-surface text-accent focus:ring-accent disabled:cursor-not-allowed dark:border-border-dark dark:bg-surface-dark"
              />
              <span>
                <span className="block font-medium text-text dark:text-text-dark">{service.title}</span>
                <span className="mt-1 block text-xs text-text/65 dark:text-text-dark/65">{service.description}</span>
                {!isConfigured && (
                  <span className="mt-2 block text-xs text-amber-700 dark:text-amber-300">
                    Configure {service.title} first before using it as a default sync target.
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
};

const SettingsModal = ({ open, onClose }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [indexPaths, setIndexPaths] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState({});
  const [lastFmUsername, setLastFmUsername] = useState('');
  const [playlistSyncDefaults, setPlaylistSyncDefaults] = useState(DEFAULT_PLAYLIST_SYNC_DEFAULTS);

  useEffect(() => {
    if (open) {
      loadSettings();
    }
  }, [open]);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const response = await axios.get('/api/settings/paths');
      setIndexPaths(response.data || []);
      const settingsResp = await axios.get('/api/settings');
      setSettings(settingsResp.data || {});
      setLastFmUsername(settingsResp.data?.lastFmUsername || '');
      setPlaylistSyncDefaults({
        ...DEFAULT_PLAYLIST_SYNC_DEFAULTS,
        ...(settingsResp.data?.playlistSyncDefaults || {}),
        services: {
          ...DEFAULT_PLAYLIST_SYNC_DEFAULTS.services,
          ...(settingsResp.data?.playlistSyncDefaults?.services || {}),
        },
      });
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        axios.post('/api/settings/paths', indexPaths),
        axios.post('/api/settings', {
          playlistSyncDefaults,
          lastFmUsername,
        }),
      ]);
      onClose();
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePathsChange = (paths) => {
    setIndexPaths(paths);
  };

  return (
    <Modal open={open} onClose={onClose} title="Settings" size="lg">
      {/* Tab bar — negative margins to break out of Modal's px-4 py-4 padding */}
      <div className="-mx-4 -mt-4 border-b border-border bg-surface-subtle px-3 py-2 dark:border-border-dark dark:bg-surface-dark">
        <div className="scrollbar-thin flex gap-1 overflow-x-auto pb-1">
          {TABS.map((tab, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveTab(idx)}
              className={`shrink-0 rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === idx
                  ? 'border-accent bg-accent text-text-dark shadow-sm dark:border-accent dark:bg-accent dark:text-text-dark'
                  : 'border-border bg-surface text-text/80 hover:bg-surface-muted hover:text-text dark:border-border-dark dark:bg-surface-dark dark:text-text-dark/80 dark:hover:bg-surface-dark-elevated dark:hover:text-text-dark'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="py-4">
        {activeTab === 0 && (
          <PathSelector paths={indexPaths} onChange={handlePathsChange} isLoading={isLoading} />
        )}
        {activeTab === 1 && <JobsPanel />}
        {activeTab === 2 && (
          <PlaylistSyncDefaultsPanel
            settings={settings}
            value={playlistSyncDefaults}
            onChange={setPlaylistSyncDefaults}
            disabled={isLoading}
          />
        )}
        {activeTab === 3 && <DatabaseMigrationsPanel />}
        {activeTab === 4 && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-text dark:text-text-dark">Last.fm Settings</h3>
            <p className="text-sm text-text/80 dark:text-text-dark/80">
              <strong>Last.fm API Configured:</strong>{settings.lastFmApiKeyConfigured ? ' Yes' : ' No'}
            </p>
            <div className="space-y-2 rounded border border-border bg-surface-subtle p-4 dark:border-border-dark dark:bg-surface-dark">
              <label htmlFor="lastfm-username" className="block text-sm font-medium text-text dark:text-text-dark">
                Last.fm Username
              </label>
              <input
                id="lastfm-username"
                type="text"
                value={lastFmUsername}
                onChange={(event) => setLastFmUsername(event.target.value)}
                placeholder="Configured Last.fm username"
                className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-border-dark dark:bg-surface-dark dark:text-text-dark"
              />
              <p className="text-xs text-text/60 dark:text-text-dark/60">
                Used to load recent tracks on the landing page.
              </p>
            </div>
          </div>
        )}
        {activeTab === 5 && (
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-text dark:text-text-dark">Plex Settings</h3>
            <p className="text-sm text-text/80 dark:text-text-dark/80">
              <strong>Plex Configured:</strong>{settings.plexConfigured ? ' Yes' : ' No'}
            </p>
          </div>
        )}
        {activeTab === 6 && (
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-text dark:text-text-dark">OpenAI Settings</h3>
            <p className="text-sm text-text/80 dark:text-text-dark/80">
              <strong>OpenAI API Configured:</strong>{settings.openAiApiKeyConfigured ? ' Yes' : ' No'}
            </p>
          </div>
        )}
        {activeTab === 7 && (
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-text dark:text-text-dark">Redis Settings</h3>
            <p className="text-sm text-text/80 dark:text-text-dark/80">
              <strong>Redis Configured:</strong>{settings.redisConfigured ? ' Yes' : ' No'}
            </p>
          </div>
        )}
        {activeTab === 8 && (
          <div>
            <p className="mb-4 text-sm text-text/80 dark:text-text-dark/80">
              <strong>Spotify API Configured:</strong>{settings.spotifyConfigured ? ' Yes' : ' No'}
            </p>
            <SpotifyConnectionPanel />
          </div>
        )}
        {activeTab === 9 && (
          <div>
            <p className="mb-4 text-sm text-text/80 dark:text-text-dark/80">
              <strong>YouTube Music API Configured:</strong>{settings.youtubeMusicConfigured ? ' Yes' : ' No'}
            </p>
            <YouTubeMusicConnectionPanel />
          </div>
        )}
        {activeTab === 10 && <LogsPanel />}
        {activeTab === 11 && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-text dark:text-text-dark">Appearance</h3>
            <div className="rounded border border-border bg-surface-subtle p-4 dark:border-border-dark dark:bg-surface-dark">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-text dark:text-text-dark">Theme Mode</div>
                  <div className="text-xs text-text/60 dark:text-text-dark/60">Choose between light and dark mode</div>
                </div>
                <DarkModeToggle />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer — negative margins to break out of Modal's padding */}
      <div className="-mx-4 -mb-4 flex justify-end gap-2 border-t border-border px-4 py-3 dark:border-border-dark">
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-border bg-surface-subtle px-4 py-1.5 text-sm font-medium text-text transition hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent/30 dark:border-border-dark dark:bg-surface-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated"
        >
          Close
        </button>
        {!NO_SAVE_TABS.has(TABS[activeTab]) && (
          <button
            type="button"
            onClick={saveSettings}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded bg-accent px-4 py-1.5 text-sm font-semibold text-text-dark shadow-sm transition hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/35 disabled:opacity-50"
          >
            {isLoading && (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border-dark border-t-text-dark" />
            )}
            Save
          </button>
        )}
      </div>
    </Modal>
  );
};

export default SettingsModal;