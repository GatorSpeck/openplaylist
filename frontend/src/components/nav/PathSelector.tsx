import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import axios from 'axios';

const PathSelector = ({ paths, onChange, isLoading }) => {
  const [newPath, setNewPath] = useState('');
  const [pathError, setPathError] = useState('');
  const [browseDirOpen, setBrowseDirOpen] = useState(false);
  const [currentBrowsePath, setCurrentBrowsePath] = useState('');
  const [directories, setDirectories] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [pathHistory, setPathHistory] = useState([]);

  useEffect(() => {
    if (browseDirOpen) {
      fetchDirectories(currentBrowsePath);
    }
  }, [browseDirOpen, currentBrowsePath]);

  const fetchDirectories = async (path) => {
    setBrowseLoading(true);
    try {
      const response = await axios.get('/api/browse/directories', {
        params: { current_path: path },
      });
      setDirectories(response.data.directories || []);
      setCurrentBrowsePath(response.data.current_path || '');
      if (path && !pathHistory.includes(path)) {
        setPathHistory([...pathHistory, path]);
      }
    } catch (error) {
      console.error('Error fetching directories:', error);
    } finally {
      setBrowseLoading(false);
    }
  };

  const handleAddPath = () => {
    if (!newPath.trim()) {
      setPathError('Path cannot be empty');
      return;
    }
    if (paths.includes(newPath.trim())) {
      setPathError('Path already exists');
      return;
    }
    onChange([...paths, newPath.trim()]);
    setNewPath('');
    setPathError('');
  };

  const handleRemovePath = (indexToRemove) => {
    onChange(paths.filter((_, index) => index !== indexToRemove));
  };

  const handleBrowse = () => {
    setBrowseDirOpen(true);
    setCurrentBrowsePath('');
    setPathHistory([]);
  };

  const handleDirectoryClick = (dirPath) => {
    setCurrentBrowsePath(dirPath);
  };

  const handleParentDirectory = () => {
    if (!currentBrowsePath) return;
    const parts = currentBrowsePath.split('/');
    parts.pop();
    setCurrentBrowsePath(parts.join('/') || '/');
  };

  const handleSelectPath = () => {
    setNewPath(currentBrowsePath);
    setBrowseDirOpen(false);
  };

  // Build breadcrumb segments from current path
  const breadcrumbSegments = () => {
    if (!currentBrowsePath) return [];
    const parts = currentBrowsePath.split('/').filter(Boolean);
    const segments = [{ label: '/', path: '/' }];
    let built = '';
    parts.forEach((part) => {
      built = `${built}/${part}`;
      segments.push({ label: part, path: built });
    });
    return segments;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent dark:border-border-dark dark:border-t-accent" />
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-1 text-base font-semibold text-text dark:text-text-dark">Music Library Paths</h3>
      <p className="mb-4 text-sm text-text/60 dark:text-text-dark/60">
        Select directories to be scanned for music files
      </p>

      {/* Path list */}
      <div className="mb-4 overflow-hidden rounded border border-border dark:border-border-dark">
        {paths.length === 0 ? (
          <div className="px-3 py-2 text-sm text-text/50 dark:text-text-dark/50">
            No paths configured. Add a path below.
          </div>
        ) : (
          paths.map((path, index) => (
            <div
              key={index}
              className="flex items-center justify-between border-b border-border/50 px-3 py-2 last:border-b-0 dark:border-border-dark/50"
            >
              <span className="font-mono text-sm text-text dark:text-text-dark">{path}</span>
              <button
                type="button"
                aria-label="Remove path"
                onClick={() => handleRemovePath(index)}
                className="ml-2 shrink-0 rounded px-2 py-0.5 text-xs text-red-600/70 transition hover:bg-red-50 hover:text-red-700 dark:text-red-400/70 dark:hover:bg-red-900/20 dark:hover:text-red-400"
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add path row */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newPath}
          onChange={(e) => { setNewPath(e.target.value); setPathError(''); }}
          onKeyDown={(e) => e.key === 'Enter' && handleAddPath()}
          placeholder="Add directory path"
          className="min-w-0 flex-1 rounded border border-border bg-transparent px-3 py-2 text-sm text-text placeholder:text-text/50 focus:outline-none focus:ring-1 focus:ring-accent dark:border-border-dark dark:text-text-dark dark:placeholder:text-text-dark/50"
        />
        <button
          type="button"
          title="Browse directories"
          onClick={handleBrowse}
          className="shrink-0 rounded border border-border px-3 py-2 text-sm text-text transition hover:bg-surface-muted dark:border-border-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated"
        >
          Browse
        </button>
        <button
          type="button"
          onClick={handleAddPath}
          className="shrink-0 rounded bg-accent px-3 py-2 text-sm font-medium text-text-dark transition hover:bg-accent/90"
        >
          + Add
        </button>
      </div>
      {pathError && (
        <div className="mt-1.5 text-xs text-red-600 dark:text-red-400">{pathError}</div>
      )}

      {/* Directory browser dialog */}
      <Modal
        open={browseDirOpen}
        onClose={() => setBrowseDirOpen(false)}
        title="Browse Directories"
        size="lg"
      >
        {browseLoading ? (
          <div className="flex items-center justify-center p-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent dark:border-border-dark dark:border-t-accent" />
          </div>
        ) : (
          <div>
            {/* Breadcrumbs */}
            {currentBrowsePath && (
              <div className="mb-3 flex flex-wrap items-center gap-0.5 text-sm">
                {breadcrumbSegments().map((seg, i, arr) => (
                  <React.Fragment key={seg.path}>
                    <button
                      type="button"
                      onClick={() => handleDirectoryClick(seg.path)}
                      className="rounded px-1 py-0.5 text-accent underline-offset-2 hover:underline"
                    >
                      {seg.label}
                    </button>
                    {i < arr.length - 1 && (
                      <span className="text-text/40 dark:text-text-dark/40">/</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}

            {/* Current path display */}
            <div className="mb-3 rounded border border-border bg-surface-subtle px-3 py-2 text-sm text-text/80 dark:border-border-dark dark:bg-surface-dark dark:text-text-dark/80">
              <strong>Current Path:</strong> {currentBrowsePath || '/'}
            </div>

            {/* Parent directory button */}
            <button
              type="button"
              onClick={handleParentDirectory}
              disabled={currentBrowsePath === '/'}
              className="mb-3 rounded border border-border px-3 py-1.5 text-sm text-text transition hover:bg-surface-muted disabled:opacity-40 dark:border-border-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated"
            >
              ↑ Parent Directory
            </button>

            {/* Directory list */}
            <div className="max-h-[50vh] overflow-y-auto rounded border border-border dark:border-border-dark">
              {directories.length === 0 ? (
                <div className="px-3 py-3 text-sm text-text/50 dark:text-text-dark/50">
                  No directories found in this location
                </div>
              ) : (
                directories.map((dir, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleDirectoryClick(dir.path)}
                    className="flex w-full items-center gap-2 border-b border-border/50 px-3 py-2 text-left last:border-b-0 hover:bg-surface-muted dark:border-border-dark/50 dark:hover:bg-surface-dark-elevated"
                  >
                    <span className="shrink-0 text-amber-500">📁</span>
                    <div>
                      <div className="text-sm font-medium text-text dark:text-text-dark">{dir.name}</div>
                      <div className="text-xs text-text/50 dark:text-text-dark/50">{dir.path}</div>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Footer buttons */}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBrowseDirOpen(false)}
                className="rounded border border-border px-4 py-1.5 text-sm text-text transition hover:bg-surface-muted dark:border-border-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSelectPath}
                disabled={!currentBrowsePath}
                className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-text-dark transition hover:bg-accent/90 disabled:opacity-50"
              >
                Select This Directory
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default PathSelector;
