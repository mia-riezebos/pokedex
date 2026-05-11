import { forwardRef, ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const styles: Record<Variant, string> = {
  primary: 'bg-[var(--accent)] text-white hover:opacity-90',
  secondary: 'bg-[var(--bg-elev-2)] text-[var(--fg)] border border-[var(--border)] hover:bg-[var(--bg-elev-1)]',
  ghost: 'text-[var(--fg-muted)] hover:text-[var(--fg)]',
  danger: 'bg-[var(--danger)] text-white hover:opacity-90',
};

export const Button = forwardRef<HTMLButtonElement, Props>(({ variant = 'primary', className, ...rest }, ref) => (
  <button
    ref={ref}
    className={clsx('px-3 py-2 rounded text-sm font-medium transition disabled:opacity-50', styles[variant], className)}
    {...rest}
  />
));
Button.displayName = 'Button';
