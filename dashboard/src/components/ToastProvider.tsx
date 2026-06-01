import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

type Toast = {
  id: number;
  title: string;
  message?: string;
  variant: 'success' | 'error';
};

type ToastContextValue = {
  push: (toast: Omit<Toast, 'id'>) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 3600);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed right-4 top-4 z-50 grid w-[min(360px,calc(100vw-2rem))] gap-3">
        {toasts.map((toast) => (
          <div key={toast.id} className="rounded-lg border border-line bg-panel p-4 shadow-panel">
            <div className="flex gap-3">
              {toast.variant === 'success' ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-mint" />
              ) : (
                <XCircle className="mt-0.5 h-5 w-5 text-rose-300" />
              )}
              <div className="min-w-0">
                <p className="font-semibold text-slate-50">{toast.title}</p>
                {toast.message ? <p className="mt-1 text-sm text-slate-400">{toast.message}</p> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside ToastProvider');
  }
  return context;
}
