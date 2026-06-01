import type { ReactNode } from 'react';

type MetricCardProps = {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  tone?: 'mint' | 'sky' | 'amber' | 'rose';
};

const tones = {
  mint: 'text-mint bg-mint/10 ring-mint/20',
  sky: 'text-skyline bg-skyline/10 ring-skyline/20',
  amber: 'text-amberline bg-amberline/10 ring-amberline/20',
  rose: 'text-rose-300 bg-rose-400/10 ring-rose-300/20',
};

export function MetricCard({ label, value, detail, icon, tone = 'sky' }: MetricCardProps) {
  return (
    <section className="rounded-lg border border-line bg-panel p-4 shadow-panel">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <div className="mt-3 truncate text-2xl font-semibold text-slate-50">{value}</div>
        </div>
        {icon ? (
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-md ring-1 ${tones[tone]}`}>
            {icon}
          </div>
        ) : null}
      </div>
      {detail ? <p className="mt-3 truncate text-sm text-slate-400">{detail}</p> : null}
    </section>
  );
}
