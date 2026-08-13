import type { ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
};

const variants = {
  primary: 'bg-leaf text-white hover:bg-[#256abf] focus-visible:ring-leaf',
  secondary: 'bg-white text-ink ring-1 ring-line hover:bg-paper focus-visible:ring-leaf',
  danger: 'bg-white text-danger ring-1 ring-line hover:bg-danger/5 focus-visible:ring-danger',
  ghost: 'bg-transparent text-ink2 hover:bg-black/5 focus-visible:ring-leaf',
};

export function Button({ children, variant = 'secondary', className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
