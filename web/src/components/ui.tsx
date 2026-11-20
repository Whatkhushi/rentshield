import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'light';
const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-snow hover:bg-brand-700 shadow-sm shadow-brand-600/25 disabled:bg-brand-600/40 disabled:shadow-none',
  secondary: 'bg-white text-ink-800 ring-1 ring-ink-200 hover:bg-ink-50 hover:ring-ink-300',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
  danger: 'bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50',
  success: 'bg-ok-600 text-white hover:bg-ok-700 shadow-sm disabled:bg-ok-600/40',
  light: 'bg-snow/10 text-snow ring-1 ring-snow/20 hover:bg-snow/20',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100',
        size === 'sm' && 'px-3 py-1.5 text-xs',
        size === 'md' && 'px-4 py-2.5 text-sm',
        size === 'lg' && 'px-6 py-3.5 text-base',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-2xl bg-white shadow-[0_1px_3px_rgb(20_27_48/0.06),0_8px_24px_-12px_rgb(20_27_48/0.08)] ring-1 ring-ink-100', className)}>{children}</div>;
}

const tones = {
  ok: 'bg-ok-50 text-ok-700 ring-ok-100',
  warn: 'bg-warn-50 text-warn-700 ring-warn-100',
  bad: 'bg-red-50 text-red-700 ring-red-100',
  ink: 'bg-ink-50 text-ink-700 ring-ink-100',
  muted: 'bg-stone-100 text-stone-500 ring-stone-200',
  dark: 'bg-brand-600 text-snow ring-brand-600',
  brand: 'bg-brand-50 text-brand-700 ring-brand-100',
};
export type Tone = keyof typeof tones;

export function Badge({ tone = 'ink', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1', tones[tone], className)}>
      {children}
    </span>
  );
}

const inputCls =
  'block w-full rounded-xl border-0 bg-white px-3.5 py-2.5 text-sm text-ink-900 ring-1 ring-ink-200 placeholder:text-ink-300 focus:ring-2 focus:ring-ink-700 focus:outline-none';

export function Field({ label, hint, error, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-800">{label}</span>
      <input className={cx(inputCls, error && 'ring-red-400')} {...props} />
      {hint && !error && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function TextArea({ label, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-sm font-medium text-ink-800">{label}</span>}
      <textarea className={cx(inputCls, 'min-h-20 resize-y')} {...props} />
    </label>
  );
}

export function Alert({ children, tone = 'bad' }: { children: ReactNode; tone?: 'bad' | 'ok' | 'ink' | 'warn' }) {
  return <div className={cx('rounded-xl px-4 py-3 text-sm ring-1', tones[tone])}>{children}</div>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-400" role="status">
      <span className="size-4 animate-spin rounded-full border-2 border-ink-200 border-t-ink-700" />
      {label ?? 'Loading…'}
    </div>
  );
}

export function Avatar({ name, size = 'md', className }: { name: string | null | undefined; size?: 'sm' | 'md'; className?: string }) {
  const initials = (name ?? '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className={cx(
        'grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 font-semibold text-snow',
        size === 'sm' ? 'size-7 text-[10px]' : 'size-10 text-sm',
        !name && 'from-stone-200 to-stone-300 text-stone-500',
        className,
      )}
    >
      {name ? initials : '?'}
    </span>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  // Portal to <body> so the dialog is never trapped under a parent's stacking context.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-night/60 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        className={cx('animate-rise max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl', wide ? 'max-w-4xl' : 'max-w-lg')}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-100 bg-white/95 px-5 py-3.5 backdrop-blur">
          <h2 className="font-semibold text-ink-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-50 hover:text-ink-900" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-white/50 px-6 py-14 text-center ring-1 ring-ink-100">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-white text-ink-700 shadow-sm ring-1 ring-ink-100">{icon}</div>
      <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
      {children && <p className="mt-1 max-w-md text-sm text-ink-500">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SectionTitle({ children, sub, action }: { children: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-ink-900">{children}</h2>
        {sub && <p className="mt-0.5 text-sm text-ink-500">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
