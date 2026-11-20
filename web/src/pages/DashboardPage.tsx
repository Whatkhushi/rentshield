import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Building2, Home, MapPin, Plus } from 'lucide-react';
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
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-500">{t('Hi {name},', { name: user?.name.split(' ')[0] ?? '' })}</p>
          <h1 className="text-3xl font-bold tracking-tight">{t('Your tenancies')}</h1>
        </div>
        <Link to="/app/new">
          <Button>
            <Plus className="size-4" /> {t('New tenancy')}
          </Button>
        </Link>
      </div>

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
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Stat label={t('Active tenancies')} value={String(active.length)} />
            <Stat label={t('Deposits tracked')} value={inr(leases.reduce((a, l) => a + l.securityDeposit, 0))} />
            <Stat label={t('Settled')} value={String(leases.length - active.length)} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {leases.map((l) => {
              const other = l.myRole === 'TENANT' ? l.landlord : l.tenant;
              return (
                <Link key={l.id} to={`/app/tenancy/${l.id}`} className="group">
                  <Card className="h-full overflow-hidden transition-all group-hover:-translate-y-0.5 group-hover:shadow-lg">
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-ink-400">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight">{value}</p>
    </Card>
  );
}
