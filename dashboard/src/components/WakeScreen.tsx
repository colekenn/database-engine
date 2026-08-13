// Full-screen gate shown on boot until the backend answers /health —
// covers the host's cold start so the first visit never looks broken.

type WakeScreenProps = {
  elapsed: number;
};

// A little B+ tree that lights up root -> internal -> leaves on a loop,
// echoing the search path animation in the tree visualizer.
function BootTree() {
  return (
    <svg viewBox="0 0 280 170" className="w-64 sm:w-72" aria-hidden="true">
      {/* edges */}
      <g stroke="#c3c2b7" strokeWidth="1.5" fill="none">
        <path d="M140 42 L75 78" className="boot-edge" style={{ animationDelay: '0.15s' }} />
        <path d="M140 42 L205 78" className="boot-edge" style={{ animationDelay: '0.15s' }} />
        <path d="M75 110 L35 138" className="boot-edge" style={{ animationDelay: '0.45s' }} />
        <path d="M75 110 L105 138" className="boot-edge" style={{ animationDelay: '0.45s' }} />
        <path d="M205 110 L175 138" className="boot-edge" style={{ animationDelay: '0.45s' }} />
        <path d="M205 110 L245 138" className="boot-edge" style={{ animationDelay: '0.45s' }} />
      </g>
      {/* root + internal (orange) */}
      <g>
        <rect x="112" y="14" width="56" height="28" rx="6" className="boot-node fill-internal/15 stroke-internal" strokeWidth="1.5" />
        <rect x="47" y="82" width="56" height="28" rx="6" className="boot-node fill-internal/15 stroke-internal" strokeWidth="1.5" style={{ animationDelay: '0.3s' }} />
        <rect x="177" y="82" width="56" height="28" rx="6" className="boot-node fill-internal/15 stroke-internal" strokeWidth="1.5" style={{ animationDelay: '0.3s' }} />
      </g>
      {/* leaves (blue) */}
      <g>
        {[13, 83, 153, 223].map((x, index) => (
          <rect
            key={x}
            x={x}
            y="138"
            width="44"
            height="24"
            rx="6"
            className="boot-node fill-leaf/15 stroke-leaf"
            strokeWidth="1.5"
            style={{ animationDelay: `${0.6 + index * 0.08}s` }}
          />
        ))}
      </g>
    </svg>
  );
}

export function WakeScreen({ elapsed }: WakeScreenProps) {
  return (
    <div className="grid min-h-screen place-items-center bg-paper px-6">
      <div className="text-center">
        <div className="flex justify-center">
          <BootTree />
        </div>
        <h1 className="mt-8 text-xl font-semibold text-ink sm:text-2xl">Starting the database engine</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-ink2">This can take up to a minute on first load.</p>
        <p className="mt-6 font-mono text-sm text-muted">
          {elapsed}s elapsed{elapsed > 60 ? ' — still trying, hang tight' : ''}
        </p>
      </div>
    </div>
  );
}
