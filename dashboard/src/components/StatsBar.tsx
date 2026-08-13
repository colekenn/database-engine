import type { Stats } from '../types';
import { formatBytes, formatNumber, formatPercent } from '../lib/format';

type StatsBarProps = {
  stats: Stats | null;
};

// One line of engine counters. The page-type counts use the same colors as
// the tree view.
export function StatsBar({ stats }: StatsBarProps) {
  if (!stats) {
    return <div className="rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-muted">loading stats…</div>;
  }

  const items: Array<[string, string]> = [
    ['records', formatNumber(stats.totalRecords)],
    ['file', formatBytes(stats.databaseSizeBytes)],
    ['tree height', String(stats.treeHeight)],
    ['cache hit rate', formatPercent(stats.cacheHitRate)],
    ['disk reads', formatNumber(stats.readOperations)],
    ['disk writes', formatNumber(stats.writeOperations)],
  ];

  const pages: Array<[string, number, string]> = [
    ['leaf', stats.leafPages, 'bg-leaf'],
    ['internal', stats.internalPages, 'bg-internal'],
    ['meta', stats.metadataPages, 'bg-meta'],
    ['overflow', stats.overflowPages, 'bg-overflow'],
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-md border border-line bg-surface px-4 py-2.5 text-sm">
      {items.map(([label, value]) => (
        <span key={label} className="text-ink2">
          {label} <span className="font-semibold text-ink">{value}</span>
        </span>
      ))}
      <span className="flex items-center gap-3">
        {pages.map(([label, value, color]) => (
          <span key={label} className="flex items-center gap-1.5 text-ink2">
            <span className={`h-2 w-2 rounded-full ${color}`} />
            {value} {label}
          </span>
        ))}
      </span>
    </div>
  );
}
