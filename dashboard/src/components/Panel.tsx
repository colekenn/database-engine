import type { ReactNode } from 'react';

type PanelProps = {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Panel({ title, eyebrow, action, children, className = '' }: PanelProps) {
  return (
    <section className={`rounded-lg border border-line bg-panel shadow-panel ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{eyebrow}</p> : null}
          <h2 className="mt-1 text-base font-semibold text-slate-50">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
