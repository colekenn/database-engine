type StatusBlockProps = {
  title: string;
  message?: string;
};

export function LoadingBlock({ title = 'Loading' }: Partial<StatusBlockProps>) {
  return (
    <div className="grid min-h-48 place-items-center rounded-lg border border-line bg-surface shadow-card">
      <div className="flex items-center gap-3 text-sm text-ink2">
        <span className="h-3 w-3 animate-pulse rounded-full bg-leaf" />
        {title}
      </div>
    </div>
  );
}

export function EmptyBlock({ title, message }: StatusBlockProps) {
  return (
    <div className="grid min-h-40 place-items-center rounded-lg border border-dashed border-baseline bg-surface/60 px-4 py-8 text-center">
      <div>
        <p className="font-semibold text-ink">{title}</p>
        {message ? <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink2">{message}</p> : null}
      </div>
    </div>
  );
}
