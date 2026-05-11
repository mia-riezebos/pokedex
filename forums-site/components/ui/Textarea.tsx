import { forwardRef, TextareaHTMLAttributes } from 'react';
import clsx from 'clsx';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...rest }, ref) => (
    <textarea
      ref={ref}
      className={clsx(
        'w-full px-3 py-2 rounded bg-[var(--bg-elev-2)] border border-[var(--border)]',
        'text-[var(--fg)] placeholder:text-[var(--fg-subtle)] outline-none font-mono text-[13px]',
        'focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-glow)]',
        className,
      )}
      {...rest}
    />
  ),
);
Textarea.displayName = 'Textarea';
