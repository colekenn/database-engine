import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
};

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
};

export function Field({ label, className = '', ...props }: FieldProps) {
  return (
    <label className="grid gap-2 text-sm text-slate-300">
      <span className="font-medium">{label}</span>
      <input
        className={`h-11 rounded-md border border-line bg-ink/60 px-3 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-skyline focus:ring-2 focus:ring-skyline/20 ${className}`}
        {...props}
      />
    </label>
  );
}

export function TextArea({ label, className = '', ...props }: TextAreaProps) {
  return (
    <label className="grid gap-2 text-sm text-slate-300">
      <span className="font-medium">{label}</span>
      <textarea
        className={`min-h-28 resize-y rounded-md border border-line bg-ink/60 px-3 py-3 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-skyline focus:ring-2 focus:ring-skyline/20 ${className}`}
        {...props}
      />
    </label>
  );
}
