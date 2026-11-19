import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, ClipboardCheck, Copy, Link2, MapPin, Scale, Send } from 'lucide-react';
import { api } from '../../lib/api';
import { cityCentre } from '../../lib/device';
import { dateShort, inr } from '../../lib/format';
import type { Inspection, InspectionSummary, LeaseDetail } from '../../lib/types';
import { nextStep } from '../DashboardPage';
import { EvidenceMap, MapPicker } from '../../components/Maps';
import { Badge, Button, Card, Modal, cx } from '../../components/ui';

export function InspectionStatusBadge({ i }: { i?: InspectionSummary }) {
  if (!i) return <Badge tone="muted">Not started</Badge>;
  if (i.status === 'FINALIZED')
    return (
      <Badge tone="ok">
        <Check className="size-3" /> Agreed & locked
      </Badge>
    );
  if (i.status === 'SUBMITTED') return <Badge tone={i.disputed ? 'warn' : 'ink'}>{i.disputed ? `${i.disputed} disputed` : 'In review'}</Badge>;
  return <Badge tone="ink">Draft</Badge>;
}

function InvitePanel({ lease }: { lease: LeaseDetail }) {
  const [copied, setCopied] = useState(false);
  const other = lease.myRole === 'TENANT' ? 'landlord' : 'tenant';
  const invite = useMutation({
    mutationFn: () => api<{ url: string; expiresAt: string }>(`/leases/${lease.id}/invitations`, { method: 'POST' }),
  });

  const copy = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-br from-ok-50 to-white p-6">
        <div className="flex items-start gap-4">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-ok-600 text-white">
            <Send className="size-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-ink-900">Invite the {other}</h3>
            <p className="mt-1 text-sm text-ink-600">
              A record only one side made isn’t worth much. Send the {other} a link: they review your inspection in their browser, no app to install.
            </p>
            {!invite.data ? (
              <Button className="mt-4" onClick={() => invite.mutate()} disabled={invite.isPending}>
                <Link2 className="size-4" /> {invite.isPending ? 'Creating link…' : 'Create invite link'}
              </Button>
            ) : (
              <div className="animate-rise mt-4">
                <div className="flex items-center gap-2 rounded-xl bg-white p-1.5 pl-3 ring-1 ring-ink-200">
                  <span className="flex-1 truncate font-mono text-xs text-ink-600">{invite.data.url}</span>
                  <Button size="sm" onClick={() => copy(invite.data!.url)}>
                    {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-ink-500">
                  Single use · expires {dateShort(invite.data.expiresAt)} · share it on WhatsApp or email
                </p>
              </div>
            )}
            {invite.error && <p className="mt-2 text-sm text-red-600">{(invite.error as Error).message}</p>}
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Property pin + where each inspection photo was taken. */
function LocationCard({ lease }: { lease: LeaseDetail }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const p = lease.property;
  const pinned = p.latitude != null && p.longitude != null;
  const locked = lease.inspections.some((i) => i.status === 'FINALIZED');

  // Photos from both inspections, for the evidence map.
  const inspections = useQueries({
    queries: lease.inspections.map((i) => ({
      queryKey: ['inspection', i.id],
      queryFn: () => api<{ inspection: Inspection }>(`/inspections/${i.id}`).then((r) => r.inspection),
      enabled: pinned,
    })),
  });
  const photos = inspections
    .flatMap((q) => q.data?.items.flatMap((it) => it.evidence.map((e) => ({ e, label: `${it.name}${q.data?.type === 'MOVE_OUT' ? ' (move-out)' : ''}` }))) ?? [])
    .filter(({ e }) => e.latitude != null && e.longitude != null && e.check);
  const atProperty = photos.filter(({ e }) => e.check!.place === 'AT_PROPERTY').length;

  const save = useMutation({
    mutationFn: () => api(`/leases/${lease.id}/location`, { method: 'PATCH', body: { latitude: pin!.lat, longitude: pin!.lng } }),
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: ['lease', lease.id] });
      lease.inspections.forEach((i) => qc.invalidateQueries({ queryKey: ['inspection', i.id] }));
    },
  });

  return (
    <Card className="overflow-hidden">
      {pinned ? (
        <EvidenceMap
          className="h-56 rounded-none ring-0"
          property={{ lat: p.latitude!, lng: p.longitude! }}
          photos={photos.map(({ e, label }) => ({ id: e.id, lat: e.latitude!, lng: e.longitude!, label, ok: e.check!.place === 'AT_PROPERTY' }))}
        />
      ) : (
        <div className="bg-grid grid h-40 place-items-center bg-ink-50">
          <MapPin className="size-8 text-ink-300" />
        </div>
      )}
      <div className="p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Location</p>
        {pinned ? (
          <>
            <p className="mt-1 text-sm text-ink-700">
              {photos.length === 0 ? (
                'No located photos yet. Photos taken on a phone carry their GPS position.'
              ) : (
                <>
                  <strong className="text-ok-700">{atProperty}</strong> of {photos.length} located photos were taken at the property.
                </>
              )}
            </p>
            {photos.length > 0 && (
              <p className="mt-2 flex gap-3 text-xs text-ink-500">
                <span className="flex items-center gap-1">
                  <span className="size-2.5 rounded-full bg-ok-600" /> within 150 m
                </span>
                <span className="flex items-center gap-1">
                  <span className="size-2.5 rounded-full bg-amber-600" /> further away
                </span>
              </p>
            )}
          </>
        ) : (
          <p className="mt-1 text-sm text-ink-600">Pin the building so RentShield can check that photos were taken here.</p>
        )}
        {!locked && (
          <Button
            size="sm"
            variant="secondary"
            className="mt-3"
            onClick={() => {
              setPin(pinned ? { lat: p.latitude!, lng: p.longitude! } : null);
              setEditing(true);
            }}
          >
            <MapPin className="size-3.5" /> {pinned ? 'Move pin' : 'Pin the property'}
          </Button>
        )}
        {locked && pinned && <p className="mt-2 text-xs text-ink-400">Locked: an inspection was agreed with this location.</p>}
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title="Where is the property?" wide>
        <MapPicker value={pin} onChange={setPin} fallbackCenter={cityCentre(p.city)} className="h-96" />
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-ink-500">Click the building, or drag the pin. Locks once an inspection is agreed.</p>
          <Button disabled={!pin || save.isPending} onClick={() => save.mutate()}>
            Save location
          </Button>
        </div>
        {save.error && <p className="mt-2 text-sm text-red-600">{(save.error as Error).message}</p>}
      </Modal>
    </Card>
  );
}

export default function OverviewTab({ lease }: { lease: LeaseDetail }) {
  const moveIn = lease.inspections.find((i) => i.type === 'MOVE_IN');
  const moveOut = lease.inspections.find((i) => i.type === 'MOVE_OUT');
  const otherJoined = lease.myRole === 'TENANT' ? lease.landlord : lease.tenant;

  const action: Record<string, { to: string; label: string }> = {
    MOVE_IN: { to: 'move-in', label: moveIn ? 'Open move-in inspection' : 'Start move-in inspection' },
    LIVING: { to: 'move-out', label: 'Start move-out inspection' },
    MOVE_OUT: { to: 'move-out', label: 'Open move-out inspection' },
    SETTLEMENT: { to: 'settlement', label: 'Go to settlement' },
    SETTLED: { to: 'records', label: 'Download final report' },
  };
  const next = action[lease.stage];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {!otherJoined && <InvitePanel lease={lease} />}

        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Next step</p>
          <p className="mt-1 text-xl font-semibold tracking-tight text-ink-900">{nextStep(lease.stage, lease.myRole)}</p>
          {next && (
            <Link to={next.to}>
              <Button className="mt-4">
                {next.label} <ArrowRight className="size-4" />
              </Button>
            </Link>
          )}
          {!otherJoined && lease.stage === 'WAITING_FOR_PARTY' && (
            <Link to="move-in" className="mt-3 block text-sm text-ink-500 underline hover:text-ink-900">
              You can start documenting the move-in inspection while you wait
            </Link>
          )}
        </Card>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: ClipboardCheck, label: 'Move-in', to: 'move-in', i: moveIn },
            { icon: ClipboardCheck, label: 'Move-out', to: 'move-out', i: moveOut },
          ].map((x) => (
            <Link key={x.label} to={x.to} className="group">
              <Card className="h-full p-5 transition-shadow group-hover:shadow-md">
                <x.icon className="size-5 text-ink-500" />
                <p className="mt-3 font-semibold text-ink-900">{x.label} inspection</p>
                <div className="mt-2">
                  <InspectionStatusBadge i={x.i} />
                </div>
                {x.i && (
                  <div className="mt-4">
                    <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                      <div
                        className={cx('h-full rounded-full', x.i.status === 'FINALIZED' ? 'bg-ok-500' : 'bg-ink-800')}
                        style={{ width: `${((x.i.status === 'DRAFT' ? x.i.documented! : x.i.approved!) / Math.max(1, x.i.itemCount!)) * 100}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-ink-500">
                      {x.i.status === 'DRAFT' ? `${x.i.documented}/${x.i.itemCount} documented` : `${x.i.approved}/${x.i.itemCount} agreed`}
                    </p>
                  </div>
                )}
              </Card>
            </Link>
          ))}
          <Link to="settlement" className="group">
            <Card className="h-full p-5 transition-shadow group-hover:shadow-md">
              <Scale className="size-5 text-ink-500" />
              <p className="mt-3 font-semibold text-ink-900">Deposit settlement</p>
              <div className="mt-2">
                {lease.settlement ? (
                  <Badge tone={lease.settlement.status === 'AGREED' ? 'ok' : 'ink'}>{lease.settlement.status === 'AGREED' ? 'Agreed' : 'Open'}</Badge>
                ) : (
                  <Badge tone="muted">After move-out</Badge>
                )}
              </div>
              {lease.settlement?.finalRefund != null && (
                <p className="mt-4 text-sm text-ink-600">
                  Refund <strong className="text-ok-700">{inr(lease.settlement.finalRefund)}</strong>
                </p>
              )}
            </Card>
          </Link>
        </div>
      </div>

      <aside className="space-y-4">
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Tenancy details</p>
          <dl className="mt-3 space-y-2.5 text-sm">
            {[
              ['Start date', dateShort(lease.startDate)],
              ['Type', lease.property.propertyType.replace('_', ' ').toLowerCase()],
              ['Rooms', String(lease.property.rooms?.length ?? 0)],
              ['Deposit', `${(lease.securityDeposit / lease.monthlyRent).toFixed(1)} months’ rent`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-ink-500">{k}</dt>
                <dd className="text-right font-medium capitalize text-ink-900">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {lease.property.rooms?.map((r) => (
              <span key={r.id} className="rounded-lg bg-ink-50 px-2 py-1 text-xs text-ink-600">
                {r.name}
              </span>
            ))}
          </div>
        </Card>
        <LocationCard lease={lease} />
      </aside>
    </div>
  );
}
