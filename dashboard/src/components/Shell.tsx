import type { ReactNode } from 'react';
import { BarChart3, Database, GitBranch, LayoutDashboard, RefreshCw, Rows3, Search } from 'lucide-react';
import { Button } from './Button';
import type { Health } from '../types';

export type PageKey = 'dashboard' | 'records' | 'range' | 'tree' | 'metrics';

const navItems: Array<{ key: PageKey; label: string; icon: ReactNode }> = [
  { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { key: 'records', label: 'Records', icon: <Rows3 className="h-4 w-4" /> },
  { key: 'range', label: 'Range', icon: <Search className="h-4 w-4" /> },
  { key: 'tree', label: 'B+ Tree', icon: <GitBranch className="h-4 w-4" /> },
  { key: 'metrics', label: 'Metrics', icon: <BarChart3 className="h-4 w-4" /> },
];

type ShellProps = {
  activePage: PageKey;
  onPageChange: (page: PageKey) => void;
  health?: Health;
  onRefresh: () => void;
  children: ReactNode;
};

export function Shell({ activePage, onPageChange, health, onRefresh, children }: ShellProps) {
  return (
    <div className="min-h-screen bg-ink text-slate-100">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-line bg-panel/95 px-4 py-5 lg:block">
        <div className="flex items-center gap-3 px-2">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-mint/10 text-mint ring-1 ring-mint/20">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-50">MiniDB</p>
            <p className="text-xs text-slate-500">Storage engine console</p>
          </div>
        </div>

        <nav className="mt-8 grid gap-1">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => onPageChange(item.key)}
              className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition ${
                activePage === item.key
                  ? 'bg-skyline/10 text-skyline ring-1 ring-skyline/20'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="absolute bottom-5 left-4 right-4 rounded-lg border border-line bg-ink/50 p-4">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${health?.status === 'ok' ? 'bg-mint' : 'bg-amberline'}`} />
            <span className="text-sm font-medium text-slate-200">{health?.engine ?? 'MiniDB API'}</span>
          </div>
          <p className="mt-2 truncate text-xs text-slate-500">{health?.databasePath ?? 'Waiting for API'}</p>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-line bg-ink/90 backdrop-blur">
          <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Custom C++ Database Engine</p>
              <h1 className="truncate text-xl font-semibold text-slate-50 sm:text-2xl">MiniDB Dashboard</h1>
            </div>
            <div className="flex items-center gap-2">
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
                  activePage === item.key ? 'bg-skyline/10 text-skyline' : 'text-slate-400'
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
