import type { ReactNode } from 'react';

type MetricCardProps = {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  tone?: 'blue' | 'orange' | 'aqua' | 'violet';
};

const tones = {
  blue: 'text-leaf bg-leaf/10',
  orange: 'text-internal bg-internal/10',
  aqua: 'text-meta bg-meta/10',
  violet: 'text-path bg-path/10',
};

export function MetricCard({ label, value, detail, icon, tone = 'blue' }: MetricCardProps) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink2">{label}</p>
          <div className="mt-2 truncate text-2xl font-semibold text-ink">{value}</div>
        </div>
        {icon ? <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-md ${tones[tone]}`}>{icon}</div> : null}
      </div>
      {detail ? <p className="mt-2 text-sm leading-5 text-muted">{detail}</p> : null}
    </section>
  );
}
