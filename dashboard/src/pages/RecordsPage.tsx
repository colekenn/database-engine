import { FormEvent, useState } from 'react';
import { Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { Button } from '../components/Button';
import { Field, TextArea } from '../components/Input';
import { Panel } from '../components/Panel';
import { useToast } from '../components/ToastProvider';
import type { ApiRecord } from '../types';

type RecordsPageProps = {
  onChanged: () => void;
};

export function RecordsPage({ onChanged }: RecordsPageProps) {
  const { push } = useToast();
  const [insertKey, setInsertKey] = useState('');
  const [insertValue, setInsertValue] = useState('');
  const [searchKey, setSearchKey] = useState('');
  const [updateKey, setUpdateKey] = useState('');
  const [updateValue, setUpdateValue] = useState('');
  const [deleteKey, setDeleteKey] = useState('');
  const [result, setResult] = useState<ApiRecord | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(name: string, task: () => Promise<void>) {
    setBusy(name);
    try {
      await task();
    } catch (err) {
      const message = err instanceof ApiError || err instanceof Error ? err.message : 'Request failed';
      push({ title: 'Request failed', message, variant: 'error' });
    } finally {
      setBusy(null);
    }
  }

  function submitInsert(event: FormEvent) {
    event.preventDefault();
    void run('insert', async () => {
      const response = await api.insertRecord(insertKey.trim(), insertValue);
      setResult({ key: response.key, value: response.value });
      setInsertKey('');
      setInsertValue('');
      push({ title: response.inserted ? 'Record inserted' : 'Record updated', message: response.key, variant: 'success' });
      onChanged();
    });
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    void run('search', async () => {
      const response = await api.getRecord(searchKey.trim());
      setResult(response);
      push({ title: 'Record found', message: response.key, variant: 'success' });
    });
  }

  function submitUpdate(event: FormEvent) {
    event.preventDefault();
    void run('update', async () => {
      const response = await api.updateRecord(updateKey.trim(), updateValue);
      setResult({ key: response.key, value: response.value });
      push({ title: response.inserted ? 'Record inserted' : 'Record updated', message: response.key, variant: 'success' });
      onChanged();
    });
  }

  function submitDelete(event: FormEvent) {
    event.preventDefault();
    void run('delete', async () => {
      const response = await api.deleteRecord(deleteKey.trim());
      setResult(null);
      setDeleteKey('');
      push({ title: 'Record deleted', message: response.key, variant: 'success' });
      onChanged();
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="grid gap-6">
        <Panel
          title="Insert a record"
          eyebrow="POST /records"
          description="The key lands in sorted position inside a leaf page. When a leaf fills up it splits in two — that's how the tree grows."
        >
          <form className="grid gap-4" onSubmit={submitInsert}>
            <Field label="Key" placeholder="e.g. user:0500" value={insertKey} onChange={(event) => setInsertKey(event.target.value)} required />
            <TextArea label="Value" placeholder="anything — long values spill into overflow pages" value={insertValue} onChange={(event) => setInsertValue(event.target.value)} />
            <Button variant="primary" disabled={busy === 'insert'} icon={<Plus className="h-4 w-4" />}>
              Insert
            </Button>
          </form>
        </Panel>

        <div className="grid gap-6 lg:grid-cols-3">
          <Panel title="Search" eyebrow="GET /records/:key" description="Walks root → leaf, comparing keys at each level.">
            <form className="grid gap-4" onSubmit={submitSearch}>
              <Field label="Key" value={searchKey} onChange={(event) => setSearchKey(event.target.value)} required />
              <Button disabled={busy === 'search'} icon={<Search className="h-4 w-4" />}>
                Search
              </Button>
            </form>
          </Panel>

          <Panel title="Update" eyebrow="PUT /records/:key" description="Finds the key and rewrites its value in place.">
            <form className="grid gap-4" onSubmit={submitUpdate}>
              <Field label="Key" value={updateKey} onChange={(event) => setUpdateKey(event.target.value)} required />
              <TextArea label="Value" value={updateValue} onChange={(event) => setUpdateValue(event.target.value)} />
              <Button disabled={busy === 'update'} icon={<RefreshCw className="h-4 w-4" />}>
                Update
              </Button>
            </form>
          </Panel>

          <Panel title="Delete" eyebrow="DELETE /records/:key" description="Removes the key from its leaf page.">
            <form className="grid gap-4" onSubmit={submitDelete}>
              <Field label="Key" value={deleteKey} onChange={(event) => setDeleteKey(event.target.value)} required />
              <Button variant="danger" disabled={busy === 'delete'} icon={<Trash2 className="h-4 w-4" />}>
                Delete
              </Button>
            </form>
          </Panel>
        </div>
      </div>

      <Panel title="Engine response" eyebrow="JSON" description="The raw reply from the C++ server for your last operation.">
        {result ? (
          <pre className="max-h-[520px] overflow-auto rounded-md border border-line bg-paper p-4 text-sm leading-6 text-ink">
            {JSON.stringify(result, null, 2)}
          </pre>
        ) : (
          <div className="rounded-md border border-dashed border-baseline bg-paper p-4 text-sm text-muted">
            Run an operation and the response shows up here.
          </div>
        )}
      </Panel>
    </div>
  );
}
