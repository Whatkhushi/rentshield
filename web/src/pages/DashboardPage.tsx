import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Building2, CheckCircle2, Home, MapPin, Plus, Wallet } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { inr } from '../lib/format';
import { useT } from '../lib/i18n';
import type { LeaseSummary, Stage } from '../lib/types';
import { StageBar } from '../components/StageTrack';
import { EvidenceMap } from '../components/Maps';
import { Alert, Avatar, Badge, Button, Card, EmptyState, Spinner } from '../components/ui';

/** English sentence for the next step; translate at the call site with t(). */
export function nextStep(stage: Stage, role: 'LANDLORD' | 'TENANT'): string {
  switch (stage) {
    case 'WAITING_FOR_PARTY':
      return role === 'TENANT' ? 'Invite the landlord to join' : 'Invite the tenant to join';
    case 'MOVE_IN':
      return 'Complete and agree the move-in inspection';
    case 'LIVING':
      return 'Move-in record locked. Start move-out when you leave';
    case 'MOVE_OUT':
      return 'Complete and agree the move-out inspection';
    case 'SETTLEMENT':
      return 'Settle the deposit, deduction by deduction';
    case 'SETTLED':
      return 'Settled. Download the final report any time';
  }
}

export default function DashboardPage() {
  const { user } = useAuth();
  const t = useT();
  const { data, isLoading, error } = useQuery({
    queryKey: ['leases'],
    queryFn: () => api<{ leases: LeaseSummary[] }>('/leases'),
  });

  const leases = data?.leases ?? [];
  const active = leases.filter((l) => l.stage !== 'SETTLED');

  return (
    <div className="animate-rise">
      {/* Hero band: greeting, main action and the numbers at a glance */}
      <section className="keep-light relative mb-8 overflow-hidden rounded-3xl bg-gradient-to-br from-night via-[#1d2366] to-brand-700 p-6 text-snow shadow-xl shadow-brand-700/20 sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-brand-400/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 size-64 rounded-full bg-ok-500/15 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm text-snow/70">{t('Hi {name},', { name: user?.name.split(' ')[0] ?? '' })}</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">{t('Your tenancies')}</h1>
            <p className="mt-1 text-sm text-snow/70">{t('Every handover, inspection and deposit in one place.')}</p>
          </div>
          <Link
            to="/app/new"
            className="inline-flex items-center gap-2 rounded-xl bg-snow px-4 py-2.5 text-sm font-semibold text-night shadow-lg transition-transform hover:-translate-y-0.5"
          >
            <Plus className="size-4" /> {t('New tenancy')}
          </Link>
        </div>
        {leases.length > 0 && (
          <div className="relative mt-7 grid gap-3 sm:grid-cols-3">
            <HeroStat icon={<Home className="size-4" />} label={t('Active tenancies')} value={String(active.length)} />
            <HeroStat icon={<Wallet className="size-4" />} label={t('Deposits tracked')} value={inr(leases.reduce((a, l) => a + l.securityDeposit, 0))} />
            <HeroStat icon={<CheckCircle2 className="size-4" />} label={t('Settled')} value={String(leases.length - active.length)} />
          </div>
        )}
      </section>

      {isLoading && <Spinner label={t('Loading…')} />}
      {error && <Alert>{(error as Error).message}</Alert>}

      {data && leases.length === 0 && (
        <EmptyState
          icon={<Home className="size-6" />}
          title={t('No tenancies yet')}
          action={
            <Link to="/app/new">
              <Button>
                <Plus className="size-4" /> {t('Set up your first handover')}
              </Button>
            </Link>
          }
        >
          {t('Moving into a new place, or renting one out? Create the tenancy and invite the other party. If they already invited you, open the link they sent.')}
        </EmptyState>
      )}

      {leases.length > 0 && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {leases.map((l) => {
              const other = l.myRole === 'TENANT' ? l.landlord : l.tenant;
              return (
                <Link key={l.id} to={`/app/tenancy/${l.id}`} className="group">
                  <Card className="h-full overflow-hidden transition-all group-hover:-translate-y-1 group-hover:shadow-xl group-hover:ring-brand-200">
                    {/* Header: map of the property if pinned, otherwise a pattern */}
                    <div className="relative h-28">
                      {l.property.latitude != null && l.property.longitude != null ? (
                        <EvidenceMap
                          className="pointer-events-none size-full rounded-none ring-0"
                          interactive={false}
                          property={{ lat: l.property.latitude, lng: l.property.longitude }}
                          radius={0}
                        />
                      ) : (
                        <div className="grid size-full place-items-center bg-gradient-to-br from-ink-50 to-ink-100">
                          <Building2 className="size-8 text-ink-300" />
                        </div>
                      )}
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[401] h-10 bg-gradient-to-t from-white to-transparent" />
                      <Badge tone={l.myRole === 'TENANT' ? 'ink' : 'dark'} className="absolute right-3 top-3 z-[401] shadow-sm">
                        {l.myRole === 'TENANT' ? t('You rent') : t('You own')}
                      </Badge>
                    </div>
                    <div className="px-5 pt-1 pb-5">
                      <div>
                        <h3 className="font-semibold leading-snug text-ink-900">{l.property.addressLine}</h3>
                        <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-500">
                          <MapPin className="size-3.5" /> {l.property.city}
                        </p>
                      </div>

                      <div className="mt-5">
                        <StageBar stage={l.stage} />
                        <p className="mt-2 text-sm font-medium text-ink-700">{t(nextStep(l.stage, l.myRole))}</p>
                      </div>

                      <div className="mt-5 flex items-center justify-between border-t border-ink-50 pt-4">
                        <div className="flex items-center gap-2">
                          <Avatar name={other?.name} size="sm" />
                          <span className="text-sm text-ink-600">{other?.name ?? t('Waiting to join')}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] uppercase tracking-wider text-ink-400">{t('Deposit')}</p>
                          <p className="font-semibold tabular-nums text-ink-900">
                            {l.settlement?.finalRefund != null ? (
                              <>
                                {inr(l.settlement.finalRefund)} <span className="text-xs font-normal text-ok-700">{t('refunded')}</span>
                              </>
                            ) : (
                              inr(l.securityDeposit)
                            )}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="mt-2 ml-auto size-4 text-ink-300 transition-transform group-hover:translate-x-1 group-hover:text-ink-700" />
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function HeroStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-snow/10 p-4 ring-1 ring-snow/10 backdrop-blur-sm">
      <span className="grid size-9 place-items-center rounded-xl bg-snow/15 text-snow">{icon}</span>
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wider text-snow/60">{label}</p>
        <p className="text-xl font-bold tabular-nums tracking-tight">{value}</p>
      </div>
    </div>
  );
}
