import { Link, NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Building2, ClipboardCheck, ClipboardList, Columns2, FileText, LayoutDashboard, Lock, MapPin, Scale, SearchX } from 'lucide-react';
import { api } from '../../lib/api';
import { inr } from '../../lib/format';
import { useT } from '../../lib/i18n';
import type { InspectionSummary, LeaseDetail } from '../../lib/types';
import { StageBar, StageStepper } from '../../components/StageTrack';
import { Avatar, Button, EmptyState, Spinner, cx } from '../../components/ui';
import OverviewTab from './OverviewTab';
import InspectionTab from './InspectionTab';
import CompareTab from './CompareTab';
import SettlementTab from './SettlementTab';
import RecordsTab from './RecordsTab';

export function useLease(id: number) {
  return useQuery({ queryKey: ['lease', id], queryFn: () => api<{ lease: LeaseDetail }>(`/leases/${id}`).then((r) => r.lease) });
}

/** Short status shown next to an inspection in the sidebar. */
function inspectionHint(i?: InspectionSummary): { text: string; tone: 'ok' | 'warn' | 'brand' | 'muted' } | null {
  if (!i) return null;
  if (i.status === 'FINALIZED') return { text: 'Locked', tone: 'ok' };
  if (i.status === 'SUBMITTED') return i.disputed ? { text: '{n} sent back', tone: 'warn' } : { text: 'In review', tone: 'brand' };
  return { text: 'Draft', tone: 'muted' };
}

const HINT_TONE: Record<string, string> = {
  ok: 'bg-ok-50 text-ok-700',
  warn: 'bg-warn-50 text-warn-700',
  brand: 'bg-brand-50 text-brand-700',
  muted: 'bg-ink-50 text-ink-500',
};

export default function TenancyPage() {
  const id = Number(useParams().id);
  const { data: lease, isLoading, error } = useLease(id);
  const t = useT();

  if (isLoading) return <Spinner />;
  if (error || !lease) {
    return (
      <EmptyState
        icon={<SearchX className="size-6" />}
        title={t('This tenancy isn’t in your account')}
        action={
          <Link to="/app">
            <Button>{t('Go to your tenancies')}</Button>
          </Link>
        }
      >
        {t('Each tenancy is visible only to its tenant and landlord. If you just switched accounts (for example between the demo tenant and landlord), this one belongs to the other account.')}
      </EmptyState>
    );
  }

  const moveIn = lease.inspections.find((i) => i.type === 'MOVE_IN');
  const moveOut = lease.inspections.find((i) => i.type === 'MOVE_OUT');
  // Absolute paths: inside a "/*" route, relative links resolve against the
  // current URL, which would make "Overview" look active on every tab.
  const base = `/app/tenancy/${id}`;
  const sections = [
    { to: base, label: 'Overview', icon: LayoutDashboard, end: true },
    { to: `${base}/move-in`, label: 'Move-in', icon: ClipboardList, hint: inspectionHint(moveIn), n: moveIn?.disputed },
    { to: `${base}/move-out`, label: 'Move-out', icon: ClipboardCheck, hint: inspectionHint(moveOut), n: moveOut?.disputed },
    { to: `${base}/compare`, label: 'Compare', icon: Columns2, disabled: !moveOut },
    {
      to: `${base}/settlement`,
      label: 'Settlement',
      icon: Scale,
      hint: lease.settlement ? { text: lease.settlement.status === 'AGREED' ? 'Agreed' : 'In progress', tone: lease.settlement.status === 'AGREED' ? 'ok' : 'brand' } : null,
    },
    { to: `${base}/records`, label: 'Records', icon: FileText },
  ] as const;

  return (
    <div className="animate-rise grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8">
      {/* ---------- Left sidebar (laptop and up) ---------- */}
      <aside className="hidden lg:block">
        <div className="sticky top-[84px] space-y-4">
          <Link to="/app" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
            <ArrowLeft className="size-4" /> {t('All tenancies')}
          </Link>

          <div className="rounded-2xl bg-white p-4 ring-1 ring-ink-100">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <Building2 className="size-4.5" />
              </span>
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-semibold leading-snug text-ink-900">{lease.property.addressLine}</p>
                <p className="mt-0.5 text-xs text-ink-500">{lease.property.city}</p>
              </div>
            </div>
            <div className="mt-4">
              <StageBar stage={lease.stage} />
            </div>
          </div>

          <nav className="space-y-1" aria-label={t('Tenancy sections')}>
            {sections.map((s) => {
              const Icon = s.icon;
              if ('disabled' in s && s.disabled) {
                return (
                  <span
                    key={s.label}
                    className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-300"
                    title={t('Available after the move-out inspection starts')}
                  >
                    <Icon className="size-4.5" />
                    <span className="flex-1">{t(s.label)}</span>
                    <Lock className="size-3.5" />
                  </span>
                );
              }
              const hint = 'hint' in s ? s.hint : null;
              return (
                <NavLink
                  key={s.label}
                  to={s.to}
                  end={'end' in s ? s.end : false}
                  className={({ isActive }) =>
                    cx(
                      'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
                      isActive ? 'bg-brand-600 text-snow shadow-md shadow-brand-600/25' : 'text-ink-600 hover:bg-white hover:text-ink-900',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className={cx('size-4.5', isActive ? 'text-snow' : 'text-ink-400 group-hover:text-brand-600')} />
                      <span className="flex-1">{t(s.label)}</span>
                      {hint && (
                        <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-semibold', isActive ? 'bg-snow/20 text-snow' : HINT_TONE[hint.tone])}>
                          {t(hint.text, { n: ('n' in s ? s.n : 0) ?? 0 })}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* ---------- Main column ---------- */}
      <div className="min-w-0">
        <Link to="/app" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900 lg:hidden">
          <ArrowLeft className="size-4" /> {t('All tenancies')}
        </Link>

        <header className="keep-light relative overflow-hidden rounded-3xl bg-gradient-to-br from-night via-[#1d2366] to-brand-700 p-6 text-snow shadow-xl shadow-brand-700/20 sm:p-8">
          <div className="absolute -right-20 -top-20 size-72 rounded-full bg-brand-400/25 blur-3xl" />
          <div className="absolute -bottom-24 left-1/4 size-60 rounded-full bg-ok-500/10 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-300">
                {lease.myRole === 'TENANT' ? t('You’re the tenant') : t('You’re the landlord')}
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{lease.property.addressLine}</h1>
              <p className="mt-1 flex items-center gap-1 text-ink-300">
                <MapPin className="size-4" /> {lease.property.city}
              </p>
            </div>
            <div className="flex gap-6">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-ink-300">{t('Deposit')}</p>
                <p className="text-2xl font-bold tabular-nums">{inr(lease.securityDeposit)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-ink-300">{t('Rent')}</p>
                <p className="text-2xl font-bold tabular-nums">{inr(lease.monthlyRent)}</p>
              </div>
            </div>
          </div>
          <div className="relative mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
            {(['tenant', 'landlord'] as const).map((r) => (
              <div key={r} className="flex items-center gap-2">
                <Avatar name={lease[r]?.name} size="sm" className="ring-2 ring-white/20" />
                <div className="leading-tight">
                  <p className="text-[10px] uppercase tracking-wider text-ink-300">{t(r === 'tenant' ? 'Tenant' : 'Landlord')}</p>
                  <p className="text-sm font-medium">{lease[r]?.name ?? <span className="text-ink-400">{t('Not joined yet')}</span>}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="relative mt-6 border-t border-white/10 pt-4">
            <StageStepper stage={lease.stage} />
          </div>
        </header>

        {/* Phones and tablets: the sections as horizontal tabs instead of the sidebar. */}
        <nav className="sticky top-[61px] z-30 -mx-4 mt-6 overflow-x-auto bg-paper/90 px-4 backdrop-blur sm:mx-0 sm:px-0 lg:hidden">
          <div className="flex gap-1 border-b border-ink-100">
            {sections.map((s) =>
              'disabled' in s && s.disabled ? (
                <span key={s.label} className="cursor-not-allowed px-4 py-3 text-sm font-medium text-ink-300" title={t('Available after the move-out inspection starts')}>
                  {t(s.label)}
                </span>
              ) : (
                <NavLink
                  key={s.label}
                  to={s.to}
                  end={'end' in s ? s.end : false}
                  className={({ isActive }) =>
                    cx(
                      '-mb-px shrink-0 border-b-2 px-4 py-3 text-sm font-semibold transition-colors',
                      isActive ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-400 hover:text-ink-700',
                    )
                  }
                >
                  {t(s.label)}
                </NavLink>
              ),
            )}
          </div>
        </nav>

        <div className="mt-6">
          <Routes>
            <Route index element={<OverviewTab lease={lease} />} />
            <Route path="move-in" element={<InspectionTab lease={lease} type="MOVE_IN" />} />
            <Route path="move-out" element={<InspectionTab lease={lease} type="MOVE_OUT" />} />
            <Route path="compare" element={moveOut ? <CompareTab inspectionId={moveOut.id} /> : <Navigate to={base} />} />
            <Route path="settlement" element={<SettlementTab lease={lease} />} />
            <Route path="records" element={<RecordsTab lease={lease} />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
