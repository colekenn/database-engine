import type { ReactNode } from 'react';
import { BarChart3, Database, GitBranch, LayoutDashboard, RefreshCw, Rows3, Search, Sprout } from 'lucide-react';
import { Button } from './Button';
import type { Health } from '../types';

export type PageKey = 'dashboard' | 'records' | 'range' | 'tree' | 'metrics';

const navItems: Array<{ key: PageKey; label: string; icon: ReactNode }> = [
  { key: 'dashboard', label: 'Overview', icon: <LayoutDashboard className="h-4 w-4" /> },
  { key: 'records', label: 'Records', icon: <Rows3 className="h-4 w-4" /> },
  { key: 'range', label: 'Range scan', icon: <Search className="h-4 w-4" /> },
  { key: 'tree', label: 'Tree visualizer', icon: <GitBranch className="h-4 w-4" /> },
  { key: 'metrics', label: 'Metrics', icon: <BarChart3 className="h-4 w-4" /> },
];

// One-sentence explainer per page, shown in the header so every screen says
// what it demonstrates without the visitor needing any database background.
const pageIntro: Record<PageKey, { title: string; blurb: string }> = {
  dashboard: {
    title: 'Overview',
    blurb: 'Live stats from the engine: what is on disk, the shape of the index, and how the cache is doing.',
  },
  records: {
    title: 'Records',
    blurb: 'Every button here is a real HTTP call into the C++ engine. Insert a few keys, then open the tree visualizer to watch the structure change.',
  },
  range: {
    title: 'Range scan',
    blurb: 'Scans walk the linked leaf pages in sorted order instead of checking every record — the main reason databases use B+ trees.',
  },
  tree: {
    title: 'Tree visualizer',
    blurb: 'The actual pages of the B+ tree, read live from disk. Search for a key to highlight the path the engine takes from root to leaf.',
  },
  metrics: {
    title: 'Metrics',
    blurb: 'Buffer pool and page-level counters reported straight from the engine.',
  },
};

type ShellProps = {
  activePage: PageKey;
  onPageChange: (page: PageKey) => void;
  health?: Health;
  onRefresh: () => void;
  onSeed: () => void;
  seeding: boolean;
  children: ReactNode;
};

export function Shell({ activePage, onPageChange, health, onRefresh, onSeed, seeding, children }: ShellProps) {
  const intro = pageIntro[activePage];

  return (
    <div className="min-h-screen bg-paper text-ink">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-line bg-surface px-4 py-5 lg:block">
        <div className="flex items-center gap-3 px-2">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-leaf/10 text-leaf">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight text-ink">B+ Tree Database Engine</p>
            <p className="mt-0.5 text-xs text-muted">built from scratch in C++</p>
          </div>
        </div>

        <nav className="mt-8 grid gap-1">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => onPageChange(item.key)}
              className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition ${
                activePage === item.key ? 'bg-leaf/10 text-leaf' : 'text-ink2 hover:bg-black/5 hover:text-ink'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="absolute bottom-5 left-4 right-4 rounded-lg border border-line bg-paper p-4">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${health?.status === 'ok' ? 'bg-good' : 'bg-danger'}`} />
            <span className="text-sm font-medium text-ink">{health?.status === 'ok' ? 'Engine online' : 'Engine offline'}</span>
          </div>
          <p className="mt-2 truncate text-xs text-muted">
            {health ? `${health.records} records · ${health.databasePath}` : 'Reconnecting…'}
          </p>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
          <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold text-ink sm:text-2xl">{intro.title}</h1>
              <p className="mt-0.5 max-w-2xl text-sm leading-5 text-ink2">{intro.blurb}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="primary" onClick={onSeed} disabled={seeding} icon={<Sprout className="h-4 w-4" />}>
                {seeding ? 'Loading…' : 'Load sample data'}
              </Button>
              <Button variant="ghost" onClick={onRefresh} icon={<RefreshCw className="h-4 w-4" />}>
                Refresh
              </Button>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto border-t border-line px-4 py-2 lg:hidden">
            {navItems.map((item) => (
              <button
                key={item.key}
                onClick={() => onPageChange(item.key)}
                className={`flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium ${
                  activePage === item.key ? 'bg-leaf/10 text-leaf' : 'text-ink2'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
