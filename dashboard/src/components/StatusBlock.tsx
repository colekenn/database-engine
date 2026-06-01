type StatusBlockProps = {
  title: string;
  message?: string;
};

export function LoadingBlock({ title = 'Loading' }: Partial<StatusBlockProps>) {
  return (
    <div className="grid min-h-48 place-items-center rounded-lg border border-line bg-panel">
      <div className="flex items-center gap-3 text-sm text-slate-300">
        <span className="h-3 w-3 animate-pulse rounded-full bg-mint" />
        {title}
      </div>
    </div>
  );
}

export function EmptyBlock({ title, message }: StatusBlockProps) {
  return (
    <div className="grid min-h-40 place-items-center rounded-lg border border-dashed border-line bg-ink/30 px-4 text-center">
      <div>
        <p className="font-semibold text-slate-200">{title}</p>
        {message ? <p className="mt-2 text-sm text-slate-500">{message}</p> : null}
      </div>
    </div>
  );
}
