import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';

export default function DarkModeToggle() {
  const { mode, toggleMode } = useTheme();
  const isDark = mode === 'dark';

  return (
    <button
      type="button"
      onClick={toggleMode}
      className="rounded-md border border-black/15 bg-surface-subtle px-3 py-2 text-xs font-semibold text-text shadow-sm transition hover:bg-surface-muted dark:border-white/20 dark:bg-surface-dark-elevated dark:text-text-dark dark:hover:bg-surface-dark"
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
    >
      {isDark ? 'Light Mode' : 'Dark Mode'}
    </button>
  );
}
