import { useCallback, useEffect, useState } from 'react';
import { api } from './api/client';
import { Shell, type PageKey } from './components/Shell';
import { useToast } from './components/ToastProvider';
import { DashboardPage } from './pages/DashboardPage';
import { MetricsPage } from './pages/MetricsPage';
import { RangeQueryPage } from './pages/RangeQueryPage';
import { RecordsPage } from './pages/RecordsPage';
import { TreePage } from './pages/TreePage';
import type { Health } from './types';

export function App() {
  const { push } = useToast();
  const [page, setPage] = useState<PageKey>('dashboard');
  const [refreshToken, setRefreshToken] = useState(0);
  const [health, setHealth] = useState<Health | undefined>();

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

  useEffect(() => {
    refresh();
  }, [refresh]);

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
    <Shell activePage={page} onPageChange={setPage} health={health} onRefresh={refresh}>
      {activePage}
    </Shell>
  );
}
