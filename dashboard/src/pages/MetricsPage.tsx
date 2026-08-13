import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api/client';
import { Panel } from '../components/Panel';
import { EmptyBlock, LoadingBlock } from '../components/StatusBlock';
import type { Stats } from '../types';
import { formatBytes, formatNumber, formatPercent } from '../lib/format';

type MetricsPageProps = {
  refreshToken: number;
};

// Identity colors shared with the tree visualizer and overview page.
const pageTypeColors: Record<string, string> = {
  Leaf: '#2a78d6',
  Internal: '#eb6834',
  Metadata: '#1baf7a',
  Overflow: '#eda100',
};

const tooltipStyle = { background: '#ffffff', border: '1px solid #e1e0d9', borderRadius: 8, color: '#0b0b0b' };

function Meter({ ratio, label }: { ratio: number; label: string }) {
  return (
    <div>
      <div className="h-3 overflow-hidden rounded-full bg-[#cde2fb]">
        <div className="h-full rounded-full bg-leaf" style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }} />
      </div>
      <p className="mt-2 text-sm text-muted">{label}</p>
    </div>
  );
}

export function MetricsPage({ refreshToken }: MetricsPageProps) {
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

  const charts = useMemo(() => {
    if (!stats) return null;
    return {
      io: [
        { name: 'Disk reads', value: stats.readOperations },
        { name: 'Disk writes', value: stats.writeOperations },
      ],
      // Order matches the validated palette adjacency (blue, orange, aqua, yellow).
      pages: [
        { name: 'Leaf', value: stats.leafPages },
        { name: 'Internal', value: stats.internalPages },
        { name: 'Metadata', value: stats.metadataPages },
        { name: 'Overflow', value: stats.overflowPages },
      ],
    };
  }, [stats]);

  if (loading && !stats) return <LoadingBlock title="Loading metrics" />;
  if (error && !stats) return <EmptyBlock title="Metrics unavailable" message={error} />;
  if (!stats || !charts) return null;

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel
        title="Buffer pool cache"
        description="How often a page the engine needed was already in memory. High is good — a miss means a disk read."
      >
        <div className="grid h-80 content-center gap-6">
          <div>
            <p className="text-sm text-ink2">Cache hit rate</p>
            <p className="mt-1 text-5xl font-semibold text-ink">{formatPercent(stats.cacheHitRate)}</p>
          </div>
          <Meter
            ratio={stats.cacheHitRate}
            label={`${formatNumber(stats.cacheHits)} hits · ${formatNumber(stats.cacheMisses)} misses`}
          />
          <Meter
            ratio={stats.bufferCapacity > 0 ? stats.bufferResidentPages / stats.bufferCapacity : 0}
            label={`${stats.bufferResidentPages} of ${stats.bufferCapacity} cache slots holding a page`}
          />
        </div>
      </Panel>

      <Panel title="Disk traffic" description="Actual page reads and writes that reached the file — everything the cache absorbed isn't here.">
        <div className="h-80">
          <ResponsiveContainer>
            <BarChart data={charts.io} margin={{ top: 24, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="#e1e0d9" vertical={false} />
              <XAxis dataKey="name" stroke="#898781" tickLine={false} axisLine={{ stroke: '#c3c2b7' }} />
              <YAxis stroke="#898781" tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: 'rgba(11,11,11,0.04)' }} contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill="#2a78d6" maxBarSize={24} radius={[4, 4, 0, 0]}>
                <LabelList dataKey="value" position="top" formatter={(value: number) => formatNumber(value)} fill="#52514e" fontSize={12} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel
        title="Pages by role"
        description="Every 4 KB page in the file plays one role. Colors match the tree visualizer: blue leaves hold data, orange internals route lookups."
      >
        <div className="h-80">
          <ResponsiveContainer>
            <BarChart data={charts.pages} margin={{ top: 24, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="#e1e0d9" vertical={false} />
              <XAxis dataKey="name" stroke="#898781" tickLine={false} axisLine={{ stroke: '#c3c2b7' }} />
              <YAxis stroke="#898781" tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip cursor={{ fill: 'rgba(11,11,11,0.04)' }} contentStyle={tooltipStyle} />
              <Bar dataKey="value" maxBarSize={24} radius={[4, 4, 0, 0]}>
                {charts.pages.map((entry) => (
                  <Cell key={entry.name} fill={pageTypeColors[entry.name]} />
                ))}
                <LabelList dataKey="value" position="top" formatter={(value: number) => formatNumber(value)} fill="#52514e" fontSize={12} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Storage" description="How full the file is, and how tightly the tree is packing its pages.">
        <div className="grid h-80 content-center gap-6">
          <div>
            <p className="text-sm text-ink2">Database file</p>
            <p className="mt-1 text-4xl font-semibold text-ink">{formatBytes(stats.databaseSizeBytes)}</p>
            <p className="mt-1 text-sm text-muted">
              {formatNumber(stats.totalRecords)} records across {formatNumber(stats.pageCount)} pages
            </p>
          </div>
          <Meter
            ratio={stats.pageUtilization}
            label={`${formatPercent(stats.pageUtilization)} of tree-page space in use (${formatBytes(stats.treeUsedBytes)} of ${formatBytes(stats.treeAllocatedBytes)})`}
          />
        </div>
      </Panel>
    </div>
  );
}
