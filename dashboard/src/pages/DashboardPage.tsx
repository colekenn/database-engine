import { useEffect, useState } from 'react';
import { ArrowRight, Database, Gauge, MemoryStick, Rows3, Server, Waypoints } from 'lucide-react';
import { api } from '../api/client';
import { MetricCard } from '../components/MetricCard';
import { EmptyBlock, LoadingBlock } from '../components/StatusBlock';
import type { Stats } from '../types';
import { formatBytes, formatNumber, formatPercent } from '../lib/format';

type DashboardPageProps = {
  refreshToken: number;
};

// The request pipeline, spelled out so a visitor gets the architecture at a glance.
const pipeline = [
  {
    icon: <Server className="h-5 w-5" />,
    title: 'REST API',
    text: 'A small HTTP server written in C++ parses each request — no frameworks, sockets up.',
  },
  {
    icon: <MemoryStick className="h-5 w-5" />,
    title: 'Buffer pool',
    text: 'An LRU cache keeps hot 4 KB pages in memory, so most reads never touch the disk.',
  },
  {
    icon: <Database className="h-5 w-5" />,
    title: 'B+ tree on disk',
    text: 'Keys live in sorted pages; leaf pages are chained together, which makes range scans fast.',
  },
];

// Page types with the same identity colors used everywhere else in the app.
const pageTypes = (stats: Stats) =>
  [
    ['Leaf', stats.leafPages, 'bg-leaf', 'hold the actual key-value data'],
    ['Internal', stats.internalPages, 'bg-internal', 'route lookups toward the right leaf'],
    ['Metadata', stats.metadataPages, 'bg-meta', 'file header: root pointer and free list'],
    ['Overflow', stats.overflowPages, 'bg-overflow', 'spill space for values too big for one page'],
  ] as Array<[string, number, string, string]>;

export function DashboardPage({ refreshToken }: DashboardPageProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .stats()
      .then((value) => {
        if (!cancelled) {
          setStats(value);
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  if (loading && !stats) return <LoadingBlock title="Loading database stats" />;
  if (error && !stats) return <EmptyBlock title="API unavailable" message={error} />;
  if (!stats) return null;

  const cacheTotal = stats.cacheHits + stats.cacheMisses;

  return (
    <div className="grid gap-6">
      {/* how a request flows through the engine */}
      <section className="rounded-lg border border-line bg-surface p-5 shadow-card">
        <h2 className="text-base font-semibold text-ink">How a request flows through the engine</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-start">
          {pipeline.map((step, index) => (
            <div key={step.title} className="contents">
              {index > 0 ? <ArrowRight className="mx-auto mt-3 hidden h-4 w-4 text-baseline md:block" /> : null}
              <div className="flex gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-leaf/10 text-leaf">{step.icon}</div>
                <div>
                  <p className="text-sm font-semibold text-ink">{step.title}</p>
                  <p className="mt-1 text-sm leading-5 text-ink2">{step.text}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Records stored"
          value={formatNumber(stats.totalRecords)}
          detail="key-value pairs indexed by the tree"
          icon={<Rows3 className="h-5 w-5" />}
          tone="blue"
        />
        <MetricCard
          label="On disk"
          value={formatBytes(stats.databaseSizeBytes)}
          detail={`${formatNumber(stats.pageCount)} pages × ${formatBytes(stats.pageSizeBytes)} each`}
          icon={<Database className="h-5 w-5" />}
          tone="aqua"
        />
        <MetricCard
          label="Tree height"
          value={stats.treeHeight}
          detail={`any key is found in ${stats.treeHeight} page read${stats.treeHeight === 1 ? '' : 's'} from the root`}
          icon={<Waypoints className="h-5 w-5" />}
          tone="orange"
        />
        <MetricCard
          label="Cache hit rate"
          value={formatPercent(stats.cacheHitRate)}
          detail={`${formatNumber(cacheTotal)} lookups served by the buffer pool`}
          icon={<Gauge className="h-5 w-5" />}
          tone="violet"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Buffer pool" value={`${stats.bufferResidentPages} / ${stats.bufferCapacity}`} detail="pages currently held in memory" tone="violet" />
        <MetricCard label="Page utilization" value={formatPercent(stats.pageUtilization)} detail={`${formatBytes(stats.treeUsedBytes)} of tree-page space in use`} tone="aqua" />
        <MetricCard label="Disk reads" value={formatNumber(stats.readOperations)} detail="pages fetched from the file (cache misses)" tone="blue" />
        <MetricCard label="Disk writes" value={formatNumber(stats.writeOperations)} detail="pages flushed back to the file" tone="orange" />
      </div>

      {/* page inventory with the shared identity colors */}
      <section className="rounded-lg border border-line bg-surface p-5 shadow-card">
        <h2 className="text-base font-semibold text-ink">What the file is made of</h2>
        <p className="mt-1 text-sm leading-5 text-ink2">
          The database file is an array of fixed 4 KB pages. Each plays one of four roles — the colors match the tree visualizer.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {pageTypes(stats).map(([label, value, color, blurb]) => (
            <div key={label} className="rounded-md border border-line bg-paper p-3">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
                <span className="text-sm font-medium text-ink">{label} pages</span>
              </div>
              <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
              <p className="mt-1 text-sm leading-5 text-muted">{blurb}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
