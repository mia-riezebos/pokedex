import { forwardRef, InputHTMLAttributes } from 'react';
import clsx from 'clsx';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input
      ref={ref}
      className={clsx(
        'w-full px-3 py-2 rounded bg-[var(--bg-elev-2)] border border-[var(--border)]',
        'text-[var(--fg)] placeholder:text-[var(--fg-subtle)] outline-none',
        'focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-glow)]',
        className,
      )}
      {...rest}
    />
  ),
);
Input.displayName = 'Input';
