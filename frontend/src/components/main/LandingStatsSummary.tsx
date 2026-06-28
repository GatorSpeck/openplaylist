import React from 'react';

interface LandingStatsSummaryProps {
  stats?: {
    trackCount?: number;
    artistCount?: number;
    albumCount?: number;
  } | null;
  loading?: boolean;
}

const StatCard = ({ label, value }: { label: string; value: string | number }) => (
  <div className="rounded-xl border border-border bg-surface px-4 py-4 shadow-sm dark:border-border-dark dark:bg-surface-dark">
    <div className="text-xs uppercase tracking-[0.18em] text-text/60 dark:text-text-dark/60">{label}</div>
    <div className="mt-2 text-2xl font-semibold text-text dark:text-text-dark">{value}</div>
  </div>
);

const LandingStatsSummary = ({ stats, loading = false }: LandingStatsSummaryProps) => {
  const trackCount = loading ? '—' : stats?.trackCount ?? 0;
  const artistCount = loading ? '—' : stats?.artistCount ?? 0;
  const albumCount = loading ? '—' : stats?.albumCount ?? 0;

  return (
    <section className="rounded-2xl border border-border bg-surface/95 p-5 shadow-sm backdrop-blur dark:border-border-dark dark:bg-surface-dark-elevated">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-text dark:text-text-dark">Library at a glance</h2>
          <p className="mt-1 text-sm text-text/70 dark:text-text-dark/70">Core collection counts from your library.</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="Tracks" value={trackCount} />
        <StatCard label="Artists" value={artistCount} />
        <StatCard label="Albums" value={albumCount} />
      </div>
    </section>
  );
};

export default LandingStatsSummary;