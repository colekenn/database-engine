import { useEffect, useState } from 'react';
import { Activity, Database, FileStack, Gauge, Layers3, MousePointerClick, Rows3, Waypoints } from 'lucide-react';
import { api } from '../api/client';
import { MetricCard } from '../components/MetricCard';
import { EmptyBlock, LoadingBlock } from '../components/StatusBlock';
import type { Stats } from '../types';
import { formatBytes, formatNumber, formatPercent } from '../lib/format';

type DashboardPageProps = {
  refreshToken: number;
};

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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total records" value={formatNumber(stats.totalRecords)} detail="Indexed key-value pairs" icon={<Rows3 className="h-5 w-5" />} tone="mint" />
        <MetricCard label="Database size" value={formatBytes(stats.databaseSizeBytes)} detail={`${formatNumber(stats.pageCount)} pages`} icon={<Database className="h-5 w-5" />} />
        <MetricCard label="Tree height" value={stats.treeHeight} detail={`${formatNumber(stats.internalPages)} internal / ${formatNumber(stats.leafPages)} leaf`} icon={<Waypoints className="h-5 w-5" />} tone="amber" />
        <MetricCard label="Page utilization" value={formatPercent(stats.pageUtilization)} detail={`${formatBytes(stats.treeUsedBytes)} used in tree pages`} icon={<Gauge className="h-5 w-5" />} tone="mint" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Cache hit rate" value={formatPercent(stats.cacheHitRate)} detail={`${formatNumber(cacheTotal)} cache lookups`} icon={<MousePointerClick className="h-5 w-5" />} tone="mint" />
        <MetricCard label="Cache miss rate" value={formatPercent(stats.cacheMissRate)} detail={`${formatNumber(stats.cacheMisses)} page loads`} icon={<Activity className="h-5 w-5" />} tone="rose" />
        <MetricCard label="Read operations" value={formatNumber(stats.readOperations)} detail="Page manager reads" icon={<Layers3 className="h-5 w-5" />} />
        <MetricCard label="Write operations" value={formatNumber(stats.writeOperations)} detail="Page manager writes" icon={<FileStack className="h-5 w-5" />} tone="amber" />
      </div>

      <section className="grid gap-4 rounded-lg border border-line bg-panel p-5 shadow-panel xl:grid-cols-[1fr_1.3fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Page inventory</p>
          <h2 className="mt-2 text-lg font-semibold text-slate-50">Allocated storage</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          {([
            ['Metadata', stats.metadataPages, 'bg-slate-400'],
            ['Internal', stats.internalPages, 'bg-skyline'],
            ['Leaf', stats.leafPages, 'bg-mint'],
            ['Overflow', stats.overflowPages, 'bg-amberline'],
          ] as Array<[string, number, string]>).map(([label, value, color]) => (
            <div key={label} className="rounded-md border border-line bg-ink/40 p-3">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
                <span className="text-sm text-slate-400">{label}</span>
              </div>
              <p className="mt-3 text-2xl font-semibold text-slate-50">{value}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
