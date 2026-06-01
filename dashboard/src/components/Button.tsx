import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
};

const variants = {
  primary: 'bg-mint text-ink hover:bg-teal-300 focus-visible:ring-mint',
  secondary: 'bg-panel2 text-slate-100 ring-1 ring-line hover:bg-slate-800 focus-visible:ring-skyline',
  danger: 'bg-rose-500 text-white hover:bg-rose-400 focus-visible:ring-rose-300',
  ghost: 'bg-transparent text-slate-300 hover:bg-white/5 focus-visible:ring-skyline',
};

export function Button({ children, icon, variant = 'secondary', className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-ink ${variants[variant]} ${className}`}
      {...props}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}
