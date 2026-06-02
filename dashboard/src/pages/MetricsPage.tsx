import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api/client';
import { Panel } from '../components/Panel';
import { EmptyBlock, LoadingBlock } from '../components/StatusBlock';
import type { Stats } from '../types';
import { formatBytes, formatNumber, formatPercent } from '../lib/format';

type MetricsPageProps = {
  refreshToken: number;
};

const chartColors = ['#2dd4bf', '#38bdf8', '#f59e0b', '#fb7185'];

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
      cache: [
        { name: 'Hits', value: stats.cacheHits },
        { name: 'Misses', value: stats.cacheMisses },
      ],
      io: [
        { name: 'Reads', value: stats.readOperations },
        { name: 'Writes', value: stats.writeOperations },
      ],
      pages: [
        { name: 'Metadata', value: stats.metadataPages },
        { name: 'Internal', value: stats.internalPages },
        { name: 'Leaf', value: stats.leafPages },
        { name: 'Overflow', value: stats.overflowPages },
      ],
    };
  }, [stats]);

  if (loading && !stats) return <LoadingBlock title="Loading metrics" />;
  if (error && !stats) return <EmptyBlock title="Metrics unavailable" message={error} />;
  if (!stats || !charts) return null;

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Cache Hit Ratio" eyebrow={formatPercent(stats.cacheHitRate)}>
        <div className="h-80">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={charts.cache} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110} paddingAngle={3}>
                {charts.cache.map((entry, index) => (
                  <Cell key={entry.name} fill={chartColors[index]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: '#10141d', border: '1px solid #263244', borderRadius: 8, color: '#e2e8f0' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Reads vs Writes" eyebrow="Page IO">
        <div className="h-80">
          <ResponsiveContainer>
            <BarChart data={charts.io}>
              <CartesianGrid stroke="#263244" vertical={false} />
              <XAxis dataKey="name" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ background: '#10141d', border: '1px solid #263244', borderRadius: 8, color: '#e2e8f0' }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {charts.io.map((entry, index) => (
                  <Cell key={entry.name} fill={chartColors[index]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Page Allocation" eyebrow={`${formatNumber(stats.pageCount)} pages`}>
        <div className="h-80">
          <ResponsiveContainer>
            <BarChart data={charts.pages}>
              <CartesianGrid stroke="#263244" vertical={false} />
              <XAxis dataKey="name" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#10141d', border: '1px solid #263244', borderRadius: 8, color: '#e2e8f0' }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {charts.pages.map((entry, index) => (
                  <Cell key={entry.name} fill={chartColors[index]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Indexed Records" eyebrow={`${formatBytes(stats.databaseSizeBytes)} file`}>
        <div className="grid h-80 content-center gap-4">
          <div className="rounded-md border border-line bg-ink/50 p-4">
            <p className="text-sm text-slate-500">Records</p>
            <p className="mt-2 text-4xl font-semibold text-slate-50">{formatNumber(stats.totalRecords)}</p>
          </div>
          <div className="rounded-md border border-line bg-ink/50 p-4">
            <p className="text-sm text-slate-500">Tree page utilization</p>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-mint" style={{ width: `${Math.min(100, stats.pageUtilization * 100)}%` }} />
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
