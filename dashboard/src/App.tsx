import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api/client';
import { Shell, type PageKey } from './components/Shell';
import { useToast } from './components/ToastProvider';
import { WakeScreen } from './components/WakeScreen';
import { DashboardPage } from './pages/DashboardPage';
import { MetricsPage } from './pages/MetricsPage';
import { RangeQueryPage } from './pages/RangeQueryPage';
import { RecordsPage } from './pages/RecordsPage';
import { TreePage } from './pages/TreePage';
import type { Health } from './types';

const firstNames = ['Ada', 'Alan', 'Barbara', 'Claude', 'Donald', 'Edsger', 'Frances', 'Grace', 'John', 'Katherine', 'Ken', 'Leslie', 'Margaret', 'Niklaus', 'Radia', 'Tim'];
const lastNames = ['Allen', 'Dijkstra', 'Hamilton', 'Hopper', 'Johnson', 'Kernighan', 'Knuth', 'Lamport', 'Liskov', 'Lovelace', 'Perlman', 'Ritchie', 'Shannon', 'Thompson', 'Turing', 'Wirth'];
const cities = ['Austin', 'Berlin', 'Boston', 'Chicago', 'Denver', 'London', 'New York', 'Portland', 'Seattle', 'Tokyo', 'Toronto', 'Zurich'];

// Enough records to force the tree past a single page (a 4 KB leaf holds
// roughly 70 of these), so the visualizer shows real splits and two levels.
const SEED_COUNT = 260;

function seedRecords(): Array<{ key: string; value: string }> {
  return Array.from({ length: SEED_COUNT }, (_, index) => ({
    key: `user:${String(index + 1).padStart(4, '0')}`,
    value: `${firstNames[index % firstNames.length]} ${lastNames[(index * 7) % lastNames.length]} · ${cities[(index * 3) % cities.length]}`,
  }));
}

const pageKeys: PageKey[] = ['dashboard', 'records', 'range', 'tree', 'metrics'];

function pageFromHash(): PageKey {
  const hash = window.location.hash.replace('#', '');
  return (pageKeys as string[]).includes(hash) ? (hash as PageKey) : 'dashboard';
}

export function App() {
  const { push } = useToast();
  const [page, setPageState] = useState<PageKey>(pageFromHash);

  // Keep the active tab in the URL hash so pages are linkable.
  const setPage = useCallback((next: PageKey) => {
    window.location.hash = next;
    setPageState(next);
  }, []);

  useEffect(() => {
    const onHashChange = () => setPageState(pageFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  const [refreshToken, setRefreshToken] = useState(0);
  const [health, setHealth] = useState<Health | undefined>();
  const [booting, setBooting] = useState(true);
  const [bootElapsed, setBootElapsed] = useState(0);
  const [seeding, setSeeding] = useState(false);
  const seedingRef = useRef(false);

  // Boot gate: poll /health until the backend answers. The free-tier host
  // sleeps when idle, so the first request can take ~30-60s to succeed.
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
    api
      .health()
      .then(setHealth)
      .catch((err: Error) => {
        setHealth(undefined);
        push({ title: 'API unavailable', message: err.message, variant: 'error' });
      });
  }, [push]);

  const seed = useCallback(async () => {
    if (seedingRef.current) return;
    seedingRef.current = true;
    setSeeding(true);
    push({ title: 'Loading sample data', message: `Inserting ${SEED_COUNT} records…`, variant: 'success' });
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
      push({ title: 'Sample data loaded', message: `${SEED_COUNT} records inserted — check the tree visualizer`, variant: 'success' });
      setPage('tree');
    } catch (err) {
      push({ title: 'Seeding stopped', message: err instanceof Error ? err.message : 'Request failed', variant: 'error' });
    } finally {
      seedingRef.current = false;
      setSeeding(false);
      refresh();
    }
  }, [push, refresh]);

  if (booting) return <WakeScreen elapsed={bootElapsed} />;

  const activePage = (() => {
    switch (page) {
      case 'records':
        return <RecordsPage onChanged={refresh} />;
      case 'range':
        return <RangeQueryPage refreshToken={refreshToken} />;
      case 'tree':
        return <TreePage refreshToken={refreshToken} />;
      case 'metrics':
        return <MetricsPage refreshToken={refreshToken} />;
      default:
        return <DashboardPage refreshToken={refreshToken} />;
    }
  })();

  return (
    <Shell activePage={page} onPageChange={setPage} health={health} onRefresh={refresh} onSeed={() => void seed()} seeding={seeding}>
      {activePage}
    </Shell>
  );
}
