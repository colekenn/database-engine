import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Search } from 'lucide-react';
import { api } from '../api/client';
import { Button } from '../components/Button';
import { Field } from '../components/Input';
import { Panel } from '../components/Panel';
import { EmptyBlock, LoadingBlock } from '../components/StatusBlock';
import { useToast } from '../components/ToastProvider';
import type { ApiRecord } from '../types';

const pageSize = 25;

type RangeQueryPageProps = {
  refreshToken: number;
};

export function RangeQueryPage({ refreshToken }: RangeQueryPageProps) {
  const { push } = useToast();
  const [startKey, setStartKey] = useState('');
  const [endKey, setEndKey] = useState('');
  const [records, setRecords] = useState<ApiRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasRun, setHasRun] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const response = await api.range(startKey.trim(), endKey.trim(), 500);
      setRecords(response.records);
      setPage(0);
      setHasRun(true);
    } catch (err) {
      push({ title: 'Range query failed', message: err instanceof Error ? err.message : 'Request failed', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void load();
  }

  useEffect(() => {
    if (hasRun) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  const pageCount = Math.max(1, Math.ceil(records.length / pageSize));
  const visibleRecords = useMemo(() => records.slice(page * pageSize, page * pageSize + pageSize), [records, page]);

  return (
    <div className="grid gap-6">
      <Panel title="Range Query" eyebrow="GET /range">
        <form className="grid gap-4 md:grid-cols-[1fr_1fr_auto]" onSubmit={submit}>
          <Field label="Start key" value={startKey} onChange={(event) => setStartKey(event.target.value)} />
          <Field label="End key" value={endKey} onChange={(event) => setEndKey(event.target.value)} />
          <div className="flex items-end">
            <Button variant="primary" disabled={loading} icon={<Search className="h-4 w-4" />} className="w-full md:w-auto">
              Run
            </Button>
          </div>
        </form>
      </Panel>

      {loading ? (
        <LoadingBlock title="Running range scan" />
      ) : records.length === 0 ? (
        <EmptyBlock title={hasRun ? 'No records matched' : 'No range query yet'} />
      ) : (
        <Panel
          title={`${records.length} Ordered Results`}
          eyebrow="Leaf scan"
          action={
            <div className="flex items-center gap-2">
              <Button variant="ghost" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} icon={<ArrowLeft className="h-4 w-4" />}>
                Prev
              </Button>
              <span className="text-sm text-slate-400">
                {page + 1} / {pageCount}
              </span>
              <Button variant="ghost" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} icon={<ArrowRight className="h-4 w-4" />}>
                Next
              </Button>
            </div>
          }
        >
          <div className="overflow-hidden rounded-md border border-line">
            <table className="min-w-full divide-y divide-line text-left text-sm">
              <thead className="bg-ink/70 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Key</th>
                  <th className="px-4 py-3 font-semibold">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-panel2/30">
                {visibleRecords.map((record) => (
                  <tr key={record.key} className="hover:bg-white/[0.03]">
                    <td className="max-w-[260px] truncate px-4 py-3 font-mono text-skyline">{record.key}</td>
                    <td className="max-w-[640px] truncate px-4 py-3 text-slate-300">{record.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
