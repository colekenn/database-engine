import type { ReactNode } from 'react';

type PanelProps = {
  title: string;
  eyebrow?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Panel({ title, eyebrow, description, action, children, className = '' }: PanelProps) {
  return (
    <section className={`rounded-lg border border-line bg-surface shadow-card ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          {eyebrow ? <p className="font-mono text-xs text-muted">{eyebrow}</p> : null}
          <h2 className="mt-0.5 text-base font-semibold text-ink">{title}</h2>
          {description ? <p className="mt-1 text-sm leading-5 text-ink2">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
