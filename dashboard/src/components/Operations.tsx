import { FormEvent, useState } from 'react';
import { api } from '../api/client';
import { Button } from './Button';
import { Field, TextArea } from './Input';
import type { ApiRecord } from '../types';

type OperationsProps = {
  onChanged: () => void;
  onTrace: (key: string) => void;
};

// All the write/read operations against the engine, with the raw response
// shown inline. "get" also traces the lookup path in the tree view.
export function Operations({ onChanged, onTrace }: OperationsProps) {
  const [insertKey, setInsertKey] = useState('');
  const [insertValue, setInsertValue] = useState('');
  const [lookupKey, setLookupKey] = useState('');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [tookMs, setTookMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rangeRecords, setRangeRecords] = useState<ApiRecord[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(task: () => Promise<unknown>, options?: { changed?: boolean }) {
    setBusy(true);
    setError(null);
    const startedAt = performance.now();
    try {
      const result = await task();
      setTookMs(Math.max(1, Math.round(performance.now() - startedAt)));
      setResponse(JSON.stringify(result, null, 2));
      if (options?.changed) onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'request failed');
    } finally {
      setBusy(false);
    }
  }

  function submitInsert(event: FormEvent) {
    event.preventDefault();
    void run(() => api.insertRecord(insertKey.trim(), insertValue), { changed: true });
  }

  function submitGet(event: FormEvent) {
    event.preventDefault();
    const key = lookupKey.trim();
    onTrace(key);
    void run(() => api.getRecord(key));
  }

  function submitDelete() {
    void run(() => api.deleteRecord(lookupKey.trim()), { changed: true });
  }

  // Pick a real key at random and look it up — zero-typing way to see a
  // lookup walk the tree.
  function traceRandom() {
    void run(async () => {
      const { records } = await api.range('', '', 200);
      if (records.length === 0) throw new Error('no records yet — load the sample data first');
      const key = records[Math.floor(Math.random() * records.length)].key;
      setLookupKey(key);
      onTrace(key);
      return api.getRecord(key);
    });
  }

  function submitRange(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const result = await api.range(rangeStart.trim(), rangeEnd.trim(), 200);
      setRangeRecords(result.records);
      return { count: result.count };
    });
  }

  return (
    <div className="grid content-start gap-4">
      <section className="rounded-md border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">insert</h2>
        <form className="mt-3 grid gap-3" onSubmit={submitInsert}>
          <Field label="key" placeholder="anything — try your name" value={insertKey} onChange={(event) => setInsertKey(event.target.value)} required />
          <TextArea
            label="value"
            className="min-h-16"
            placeholder="anything else"
            value={insertValue}
            onChange={(event) => setInsertValue(event.target.value)}
          />
          <Button variant="primary" disabled={busy}>
            insert
          </Button>
        </form>
      </section>

      <section className="rounded-md border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">get / delete</h2>
        <p className="mt-1 text-xs text-muted">get also highlights the lookup path in the tree</p>
        <form className="mt-3 grid gap-3" onSubmit={submitGet}>
          <Field label="key" placeholder="e.g. user:0142" value={lookupKey} onChange={(event) => setLookupKey(event.target.value)} required />
          <div className="flex gap-2">
            <Button variant="secondary" disabled={busy} className="flex-1">
              get
            </Button>
            <Button variant="danger" type="button" disabled={busy} onClick={submitDelete} className="flex-1">
              delete
            </Button>
          </div>
          <Button variant="ghost" type="button" disabled={busy} onClick={traceRandom}>
            or trace a random key
          </Button>
        </form>
      </section>

      <section className="rounded-md border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">range scan</h2>
        <p className="mt-1 text-xs text-muted">walks the linked leaves in sorted order — blank for full scan</p>
        <form className="mt-3 grid gap-3" onSubmit={submitRange}>
          <div className="grid grid-cols-2 gap-2">
            <Field label="start" value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} />
            <Field label="end" value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} />
          </div>
          <Button variant="secondary" disabled={busy}>
            scan
          </Button>
        </form>
        {rangeRecords ? (
          <div className="mt-3 max-h-56 overflow-auto rounded border border-line bg-paper">
            {rangeRecords.length === 0 ? (
              <p className="p-3 text-xs text-muted">no records in range</p>
            ) : (
              <table className="w-full text-left font-mono text-xs">
                <tbody>
                  {rangeRecords.map((record) => (
                    <tr key={record.key} className="border-b border-line last:border-0">
                      <td className="px-3 py-1.5 text-leaf">{record.key}</td>
                      <td className="max-w-40 truncate px-3 py-1.5 text-ink2">{record.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : null}
      </section>

      {error ? <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p> : null}

      {response ? (
        <section className="rounded-md border border-line bg-surface p-4">
          <h2 className="flex items-baseline justify-between text-sm font-semibold text-ink">
            last response
            {tookMs !== null ? <span className="font-mono text-xs font-normal text-muted">{tookMs} ms round trip</span> : null}
          </h2>
          <pre className="mt-2 max-h-40 overflow-auto rounded border border-line bg-paper p-3 font-mono text-xs leading-5 text-ink2">{response}</pre>
        </section>
      ) : null}
    </div>
  );
}
