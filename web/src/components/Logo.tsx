import { Link } from 'react-router-dom';
import { cx } from './ui';

export function ShieldMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M16 2 4 7v8c0 7.5 5.1 13.6 12 15 6.9-1.4 12-7.5 12-15V7z" fill="currentColor" />
      <path d="m11 16 3.5 3.5L21 13" stroke="#34d399" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ light, to = '/' }: { light?: boolean; to?: string }) {
  return (
    <Link to={to} className={cx('flex items-center gap-2 text-[17px] font-bold tracking-tight', light ? 'text-white' : 'text-ink-900')}>
      <ShieldMark className={cx('size-7', light ? 'text-white/95' : 'text-brand-600')} />
      RentShield
    </Link>
  );
}
