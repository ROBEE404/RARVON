import type { ButtonHTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  children: ReactNode;
}

export default function Button({ variant = 'primary', className, children, ...rest }: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2.5 sm:min-h-0 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        variant === 'primary' && 'bg-ink text-paper hover:bg-workshop',
        variant === 'secondary' && 'border border-line bg-paper text-ink hover:border-ink',
        variant === 'ghost' && 'text-ink hover:bg-paper-dim',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
