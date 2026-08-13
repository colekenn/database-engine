import { useCallback, useEffect, useState } from 'react';
import { api } from './api/client';
import { Button } from './components/Button';
import { Operations } from './components/Operations';
import { StatsBar } from './components/StatsBar';
import { TreeView } from './components/TreeView';
import { WakeScreen } from './components/WakeScreen';
import type { Health, Stats } from './types';

const firstNames = ['Ada', 'Alan', 'Barbara', 'Claude', 'Donald', 'Edsger', 'Frances', 'Grace', 'John', 'Katherine', 'Ken', 'Leslie', 'Margaret', 'Niklaus', 'Radia', 'Tim'];
const lastNames = ['Allen', 'Dijkstra', 'Hamilton', 'Hopper', 'Johnson', 'Kernighan', 'Knuth', 'Lamport', 'Liskov', 'Lovelace', 'Perlman', 'Ritchie', 'Shannon', 'Thompson', 'Turing', 'Wirth'];
const cities = ['Austin', 'Berlin', 'Boston', 'Chicago', 'Denver', 'London', 'New York', 'Portland', 'Seattle', 'Tokyo', 'Toronto', 'Zurich'];

// Enough records to force the tree past a single page (a 4 KB leaf holds
// roughly 70 of these), so the view shows real splits and two levels.
const SEED_COUNT = 260;

function seedRecords(): Array<{ key: string; value: string }> {
  return Array.from({ length: SEED_COUNT }, (_, index) => ({
    key: `user:${String(index + 1).padStart(4, '0')}`,
    value: `${firstNames[index % firstNames.length]} ${lastNames[(index * 7) % lastNames.length]} · ${cities[(index * 3) % cities.length]}`,
  }));
}

export function App() {
  const [refreshToken, setRefreshToken] = useState(0);
  const [health, setHealth] = useState<Health | undefined>();
  const [stats, setStats] = useState<Stats | null>(null);
  const [booting, setBooting] = useState(true);
  const [bootElapsed, setBootElapsed] = useState(0);
  const [seeding, setSeeding] = useState(false);
  const [tracedKey, setTracedKey] = useState<string | null>(null);

  // Boot gate: poll /health until the backend answers (the host cold-starts).
  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    const timer = window.setInterval(() => {
      if (!cancelled) setBootElapsed(Math.round((Date.now() - startedAt) / 1000));
    }, 1000);

    async function poll() {
      for (;;) {
        try {
          const value = await api.health();
          if (cancelled) return;
          setHealth(value);
          setBooting(false);
          return;
        } catch {
          if (cancelled) return;
          await new Promise((resolve) => setTimeout(resolve, 2500));
        }
      }
    }

    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const refresh = useCallback(() => {
    setRefreshToken((value) => value + 1);
    api.health().then(setHealth).catch(() => setHealth(undefined));
    api.stats().then(setStats).catch(() => setStats(null));
  }, []);

  useEffect(() => {
    if (!booting) refresh();
  }, [booting, refresh]);

  const seed = useCallback(async () => {
    setSeeding(true);
    try {
      const records = seedRecords();
      const concurrency = 8;
      let cursor = 0;
      await Promise.all(
        Array.from({ length: concurrency }, async () => {
          for (;;) {
            const index = cursor;
            cursor += 1;
            if (index >= records.length) return;
            await api.insertRecord(records[index].key, records[index].value);
          }
        }),
      );
    } finally {
      setSeeding(false);
      refresh();
    }
  }, [refresh]);

  if (booting) return <WakeScreen elapsed={bootElapsed} />;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-lg font-semibold">B+ tree database engine</h1>
            <p className="mt-0.5 text-sm text-ink2">
              a disk-backed key-value store written from scratch in C++ — this page is a live view of its pages on disk
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2 text-sm text-ink2">
              <span className={`h-2 w-2 rounded-full ${health?.status === 'ok' ? 'bg-good' : 'bg-danger'}`} />
              {health?.status === 'ok' ? 'engine online' : 'engine offline'}
            </span>
            <Button variant="primary" onClick={() => void seed()} disabled={seeding}>
              {seeding ? 'inserting 260 records…' : 'load sample data'}
            </Button>
            <Button variant="ghost" onClick={refresh}>
              refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1400px] gap-4 px-4 py-4 sm:px-6">
        <StatsBar stats={stats} />
        <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
          <Operations onChanged={refresh} onTrace={setTracedKey} />
          <TreeView refreshToken={refreshToken} tracedKey={tracedKey} />
        </div>
      </main>
    </div>
  );
}
