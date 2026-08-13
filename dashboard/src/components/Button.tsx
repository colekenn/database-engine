import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
};

const variants = {
  primary: 'bg-leaf text-white hover:bg-[#256abf] focus-visible:ring-leaf',
  secondary: 'bg-white text-ink ring-1 ring-line hover:bg-paper focus-visible:ring-leaf',
  danger: 'bg-danger text-white hover:bg-[#b83434] focus-visible:ring-danger',
  ghost: 'bg-transparent text-ink2 hover:bg-black/5 focus-visible:ring-leaf',
};

export function Button({ children, icon, variant = 'secondary', className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${variants[variant]} ${className}`}
      {...props}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}
