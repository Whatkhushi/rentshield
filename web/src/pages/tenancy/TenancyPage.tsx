import { Link, NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, MapPin } from 'lucide-react';
import { api } from '../../lib/api';
import { inr } from '../../lib/format';
import type { LeaseDetail } from '../../lib/types';
import { StageStepper } from '../../components/StageTrack';
import { Alert, Avatar, Spinner, cx } from '../../components/ui';
import OverviewTab from './OverviewTab';
import InspectionTab from './InspectionTab';
import CompareTab from './CompareTab';
import SettlementTab from './SettlementTab';
import RecordsTab from './RecordsTab';

export function useLease(id: number) {
  return useQuery({ queryKey: ['lease', id], queryFn: () => api<{ lease: LeaseDetail }>(`/leases/${id}`).then((r) => r.lease) });
}

export default function TenancyPage() {
  const id = Number(useParams().id);
  const { data: lease, isLoading, error } = useLease(id);

  if (isLoading) return <Spinner />;
  if (error || !lease) return <Alert>{error ? (error as Error).message : 'Tenancy not found'}</Alert>;

  const moveOut = lease.inspections.find((i) => i.type === 'MOVE_OUT');
  // Absolute paths: inside a "/*" route, relative links resolve against the
  // current URL, which would make "Overview" look active on every tab.
  const base = `/app/tenancy/${id}`;
  const tabs = [
    { to: base, label: 'Overview', end: true },
    { to: `${base}/move-in`, label: 'Move-in' },
    { to: `${base}/move-out`, label: 'Move-out' },
    { to: `${base}/compare`, label: 'Compare', disabled: !moveOut },
    { to: `${base}/settlement`, label: 'Settlement' },
    { to: `${base}/records`, label: 'Records' },
  ];

  return (
    <div className="animate-rise">
      <Link to="/app" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft className="size-4" /> All tenancies
      </Link>

      <header className="relative overflow-hidden rounded-3xl bg-ink-950 p-6 text-white sm:p-8">
        <div className="bg-grid absolute inset-0 opacity-[0.06] invert" />
        <div className="absolute -right-20 -top-20 size-72 rounded-full bg-ok-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-300">
              {lease.myRole === 'TENANT' ? 'You’re the tenant' : 'You’re the landlord'}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{lease.property.addressLine}</h1>
            <p className="mt-1 flex items-center gap-1 text-ink-300">
              <MapPin className="size-4" /> {lease.property.city}
            </p>
          </div>
          <div className="flex gap-6">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-ink-300">Deposit</p>
              <p className="text-2xl font-bold tabular-nums">{inr(lease.securityDeposit)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-ink-300">Rent</p>
              <p className="text-2xl font-bold tabular-nums">{inr(lease.monthlyRent)}</p>
            </div>
          </div>
        </div>
        <div className="relative mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          {(['tenant', 'landlord'] as const).map((r) => (
            <div key={r} className="flex items-center gap-2">
              <Avatar name={lease[r]?.name} size="sm" className="ring-2 ring-white/20" />
              <div className="leading-tight">
                <p className="text-[10px] uppercase tracking-wider text-ink-300">{r}</p>
                <p className="text-sm font-medium">{lease[r]?.name ?? <span className="text-ink-400">Not joined yet</span>}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="relative mt-6 border-t border-white/10 pt-4">
          <StageStepper stage={lease.stage} />
        </div>
      </header>

      <nav className="sticky top-[61px] z-30 -mx-4 mt-6 mb-6 overflow-x-auto bg-paper/90 px-4 backdrop-blur sm:mx-0 sm:px-0">
        <div className="flex gap-1 border-b border-ink-100">
          {tabs.map((t) =>
            t.disabled ? (
              <span key={t.label} className="cursor-not-allowed px-4 py-3 text-sm font-medium text-ink-300">
                {t.label}
              </span>
            ) : (
              <NavLink
                key={t.label}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  cx(
                    '-mb-px shrink-0 border-b-2 px-4 py-3 text-sm font-semibold transition-colors',
                    isActive ? 'border-ink-900 text-ink-900' : 'border-transparent text-ink-400 hover:text-ink-700',
                  )
                }
              >
                {t.label}
              </NavLink>
            ),
          )}
        </div>
      </nav>

      <Routes>
        <Route index element={<OverviewTab lease={lease} />} />
        <Route path="move-in" element={<InspectionTab lease={lease} type="MOVE_IN" />} />
        <Route path="move-out" element={<InspectionTab lease={lease} type="MOVE_OUT" />} />
        <Route path="compare" element={moveOut ? <CompareTab inspectionId={moveOut.id} /> : <Navigate to={base} />} />
        <Route path="settlement" element={<SettlementTab lease={lease} />} />
        <Route path="records" element={<RecordsTab lease={lease} />} />
      </Routes>
    </div>
  );
}
