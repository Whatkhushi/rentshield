import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bath,
  BedDouble,
  Camera,
  Check,
  CheckCheck,
  ClipboardList,
  CookingPot,
  DoorOpen,
  Gauge,
  ImagePlus,
  Lock,
  MessageSquareWarning,
  Plus,
  Scale,
  Send,
  Sofa,
  Sparkles,
  ThumbsUp,
  Trash2,
  Trees,
  Undo2,
} from 'lucide-react';
import { api } from '../../lib/api';
import { currentPosition, isTouchDevice } from '../../lib/device';
import { CONDITIONS, conditionLabel, dateTime } from '../../lib/format';
import type { Condition, Inspection, InspectionType, Item, LeaseDetail, Room } from '../../lib/types';
import { CameraCapture } from '../../components/CameraCapture';
import { AuthedImage, PhotoTile } from '../../components/Photo';
import { Alert, Badge, Button, Card, EmptyState, Spinner, TextArea, cx, type Tone } from '../../components/ui';

const toneOf = (c: Condition | null): Tone => (CONDITIONS.find((x) => x.value === c)?.tone as Tone) ?? 'muted';

export function roomIcon(name: string) {
  const n = name.toLowerCase();
  if (/bed/.test(n)) return BedDouble;
  if (/kitchen/.test(n)) return CookingPot;
  if (/bath|toilet|wash/.test(n)) return Bath;
  if (/living|hall|drawing|dining|room/.test(n)) return Sofa;
  if (/balcony|terrace|garden/.test(n)) return Trees;
  return DoorOpen;
}

/** Tiny circular progress indicator. */
function Ring({ value, total, active }: { value: number; total: number; active?: boolean }) {
  const pct = total ? value / total : 0;
  const r = 9;
  const c = 2 * Math.PI * r;
  const done = value === total && total > 0;
  return (
    <svg viewBox="0 0 24 24" className="size-6 shrink-0 -rotate-90">
      <circle cx="12" cy="12" r={r} fill="none" strokeWidth="3" className={active ? 'stroke-white/15' : 'stroke-ink-100'} />
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        className={cx('transition-all', done ? 'stroke-ok-500' : active ? 'stroke-white' : 'stroke-ink-700')}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------

export default function InspectionTab({ lease, type }: { lease: LeaseDetail; type: InspectionType }) {
  const qc = useQueryClient();
  const summary = lease.inspections.find((i) => i.type === type);
  const moveIn = lease.inspections.find((i) => i.type === 'MOVE_IN');
  const start = useMutation({
    mutationFn: () => api(`/leases/${lease.id}/inspections`, { method: 'POST', body: { type } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lease', lease.id] }),
  });

  if (!summary) {
    const blocked = type === 'MOVE_OUT' && moveIn?.status !== 'FINALIZED';
    return (
      <EmptyState
        icon={<ClipboardList className="size-6" />}
        title={type === 'MOVE_IN' ? 'Start the move-in inspection' : 'Start the move-out inspection'}
        action={
          <div className="flex flex-col items-center gap-3">
            {start.error && <Alert>{(start.error as Error).message}</Alert>}
            <Button size="lg" disabled={blocked || start.isPending} onClick={() => start.mutate()}>
              {start.isPending ? 'Preparing checklist…' : 'Start inspection'}
            </Button>
          </div>
        }
      >
        {blocked
          ? 'Available once both of you have agreed the move-in inspection. Move-out is compared against it.'
          : type === 'MOVE_IN'
            ? `A checklist is created for each of the ${lease.property.rooms?.length} rooms. You can add or remove items. You record each item’s condition; the ${lease.myRole === 'TENANT' ? 'landlord' : 'tenant'} reviews it. Best done on the day you get the keys.`
            : 'Every agreed move-in item is copied over. Re-photograph each one from the same spot, so the two can be compared.'}
      </EmptyState>
    );
  }
  return <InspectionView id={summary.id} leaseId={lease.id} />;
}

// ---------------------------------------------------------------------------

type Mode = 'edit' | 'review' | 'wait' | 'locked';

function InspectionView({ id, leaseId }: { id: number; leaseId: number }) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['inspection', id],
    queryFn: () => api<{ inspection: Inspection }>(`/inspections/${id}`).then((r) => r.inspection),
  });
  const [roomId, setRoomId] = useState<number | 'all'>('all');

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['inspection', id] });
    qc.invalidateQueries({ queryKey: ['lease', leaseId] });
  };
  const submit = useMutation({ mutationFn: () => api(`/inspections/${id}/submit`, { method: 'POST' }), onSuccess: refresh });
  const approveAll = useMutation({ mutationFn: () => api(`/inspections/${id}/approve-all`, { method: 'POST' }), onSuccess: refresh });

  const byRoom = useMemo(() => {
    const m = new Map<number, Item[]>();
    data?.items.forEach((it) => m.set(it.roomId, [...(m.get(it.roomId) ?? []), it]));
    return m;
  }, [data]);

  if (isLoading) return <Spinner />;
  if (error || !data) return <Alert>{(error as Error)?.message ?? 'Not found'}</Alert>;

  const mode: Mode =
    data.status === 'FINALIZED' ? 'locked' : data.isAuthor ? (data.status === 'DRAFT' ? 'edit' : 'wait') : data.status === 'SUBMITTED' ? 'review' : 'wait';
  const items = data.items;
  const isResolved = (i: Item) => i.reviewStatus === 'APPROVED' || i.reviewStatus === 'NOTED';
  const counts = {
    total: items.length,
    checked: items.filter((i) => i.condition).length,
    resolved: items.filter(isResolved).length,
    disputed: items.filter((i) => i.reviewStatus === 'DISPUTED').length,
    noted: items.filter((i) => i.reviewStatus === 'NOTED').length,
    pending: items.filter((i) => i.reviewStatus === 'PENDING').length,
    photos: items.reduce((n, i) => n + i.evidence.length, 0),
    atProperty: items.flatMap((i) => i.evidence).filter((e) => e.check?.place === 'AT_PROPERTY').length,
  };
  const visibleRooms = data.rooms.filter((r) => roomId === 'all' || r.id === roomId);
  const otherName = data.myRole === 'TENANT' ? 'landlord' : 'tenant';
  const roomProgress = (its: Item[]) => (mode === 'edit' ? its.filter((i) => i.condition).length : its.filter(isResolved).length);

  return (
    <div className="space-y-6">
      <StatusBanner
        data={data}
        mode={mode}
        counts={counts}
        otherName={otherName}
        onSubmit={() => submit.mutate()}
        submitting={submit.isPending}
        onApproveAll={() => approveAll.mutate()}
        approving={approveAll.isPending}
      />
      {(submit.error || approveAll.error) && <Alert>{((submit.error || approveAll.error) as Error).message}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[230px_1fr]">
        {/* ---- Room navigation ---- */}
        <aside className="lg:sticky lg:top-32 lg:self-start">
          <div className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">
            <RoomButton active={roomId === 'all'} onClick={() => setRoomId('all')} label="All rooms" Icon={ClipboardList} done={mode === 'edit' ? counts.checked : counts.resolved} total={counts.total} />
            {data.rooms.map((r) => {
              const its = byRoom.get(r.id) ?? [];
              return (
                <RoomButton
                  key={r.id}
                  active={roomId === r.id}
                  onClick={() => setRoomId(r.id)}
                  label={r.name}
                  Icon={roomIcon(r.name)}
                  done={roomProgress(its)}
                  total={its.length}
                  warn={its.some((i) => i.reviewStatus === 'DISPUTED')}
                />
              );
            })}
          </div>
          <MeterReadings data={data} onSaved={refresh} />
        </aside>

        {/* ---- Items, grouped by room ---- */}
        <div className="space-y-10">
          {visibleRooms.map((room) => (
            <RoomSection key={room.id} room={room} items={byRoom.get(room.id) ?? []} inspection={data} mode={mode} onChanged={refresh} />
          ))}
        </div>
      </div>
    </div>
  );
}

function RoomButton({
  active,
  onClick,
  label,
  Icon,
  done,
  total,
  warn,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  Icon: typeof Sofa;
  done: number;
  total: number;
  warn?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
        active ? 'bg-ink-900 text-white shadow-md' : 'text-ink-600 hover:bg-white',
      )}
    >
      <Icon className={cx('size-4 shrink-0', active ? 'text-ok-500' : 'text-ink-400')} />
      <span className="flex-1 truncate font-medium">{label}</span>
      {warn && <span className="size-2 rounded-full bg-warn-500" title="Has disputed items" />}
      <span className={cx('font-mono text-[10px]', active ? 'text-ink-300' : 'text-ink-400')}>
        {done}/{total}
      </span>
      <Ring value={done} total={total} active={active} />
    </button>
  );
}

// ---------------------------------------------------------------------------

function StatusBanner({
  data,
  mode,
  counts,
  otherName,
  onSubmit,
  submitting,
  onApproveAll,
  approving,
}: {
  data: Inspection;
  mode: Mode;
  counts: { total: number; checked: number; resolved: number; disputed: number; noted: number; pending: number; photos: number; atProperty: number };
  otherName: string;
  onSubmit: () => void;
  submitting: boolean;
  onApproveAll: () => void;
  approving: boolean;
}) {
  const title = data.type === 'MOVE_IN' ? 'Move-in inspection' : 'Move-out inspection';
  const pct = (mode === 'edit' ? counts.checked : counts.resolved) / Math.max(1, counts.total);
  const remaining = counts.total - counts.checked;

  let headline = '';
  let sub: React.ReactNode = '';
  let action: React.ReactNode = null;
  if (mode === 'locked') {
    headline = 'Agreed by both of you and locked';
    sub = `Finalized ${dateTime(data.finalizedAt)}. Nobody can change this record any more.${counts.noted ? ` ${counts.noted} item(s) have both views recorded.` : ''}`;
  } else if (mode === 'edit') {
    headline = remaining ? `${remaining} item${remaining > 1 ? 's' : ''} left to check` : `All items checked. Send it to the ${otherName}`;
    sub = (
      <>
        Give every item a condition (use <strong>N/A</strong> or remove items that don’t exist). Photos are optional, but take them for anything not in
        good shape.
        {!data.otherPartyJoined && <span className="text-warn-700"> Invite the {otherName} before submitting.</span>}
      </>
    );
    action = (
      <Button variant="success" size="lg" disabled={remaining > 0 || !data.otherPartyJoined || submitting} onClick={onSubmit}>
        <Send className="size-4" /> {submitting ? 'Submitting…' : 'Submit for review'}
      </Button>
    );
  } else if (mode === 'review') {
    headline = `Review what the ${otherName} recorded`;
    sub = `${counts.pending} waiting for you. Approve what’s right. If something’s wrong, send it back, or record your disagreement if you won’t agree.`;
    action = counts.pending > 0 && (
      <Button variant="success" size="lg" disabled={approving} onClick={onApproveAll}>
        <CheckCheck className="size-4" /> {approving ? 'Approving…' : `Approve all ${counts.pending}`}
      </Button>
    );
  } else {
    headline =
      data.status === 'DRAFT'
        ? `The ${otherName} is still recording the items`
        : counts.disputed
          ? `${counts.disputed} item${counts.disputed > 1 ? 's' : ''} sent back to you. Revise below`
          : `Waiting for the ${otherName} to review`;
    sub = data.status === 'DRAFT' ? 'You’ll be able to review once they submit.' : `${counts.resolved} of ${counts.total} settled so far.`;
  }

  return (
    <Card className="overflow-hidden">
      <div className={cx('flex flex-wrap items-center justify-between gap-4 p-5', mode === 'locked' && 'bg-ok-50', mode === 'wait' && counts.disputed > 0 && 'bg-warn-50')}>
        <div className="flex items-start gap-3">
          <div className={cx('grid size-11 shrink-0 place-items-center rounded-xl text-white', mode === 'locked' ? 'bg-ok-600' : 'bg-ink-900')}>
            {mode === 'locked' ? <Lock className="size-5" /> : <ClipboardList className="size-5" />}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{title}</p>
            <p className="text-lg font-semibold tracking-tight text-ink-900">{headline}</p>
            <p className="mt-0.5 max-w-2xl text-sm text-ink-500">{sub}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-ink-50 px-5 py-2.5 text-xs text-ink-500">
        <span>
          <strong className="text-ink-800">{counts.checked}</strong>/{counts.total} checked
        </span>
        {data.status !== 'DRAFT' && (
          <span>
            <strong className="text-ink-800">{counts.resolved}</strong>/{counts.total} agreed
          </span>
        )}
        <span>
          <strong className="text-ink-800">{counts.photos}</strong> photos · <strong className="text-ok-700">{counts.atProperty}</strong> verified at the property
        </span>
        {counts.noted > 0 && <span className="text-ink-700">{counts.noted} disagreement(s) recorded</span>}
      </div>
      <div className="h-1 bg-ink-50">
        <div className={cx('h-full transition-all duration-500', mode === 'locked' ? 'bg-ok-500' : 'bg-ink-800')} style={{ width: `${pct * 100}%` }} />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function MeterReadings({ data, onSaved }: { data: Inspection; onSaved: () => void }) {
  const [v, setV] = useState({ electricityReading: data.electricityReading ?? '', waterReading: data.waterReading ?? '', gasReading: data.gasReading ?? '' });
  const editable = data.isAuthor && data.status === 'DRAFT';
  const save = useMutation({
    mutationFn: () => api(`/inspections/${data.id}`, { method: 'PATCH', body: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.trim() || null])) }),
    onSuccess: onSaved,
  });
  const dirty = v.electricityReading !== (data.electricityReading ?? '') || v.waterReading !== (data.waterReading ?? '') || v.gasReading !== (data.gasReading ?? '');

  return (
    <Card className="mt-4 hidden p-4 lg:block">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
        <Gauge className="size-4" /> Meter readings
      </p>
      <div className="mt-3 space-y-2">
        {(
          [
            ['electricityReading', 'Electricity (kWh)'],
            ['waterReading', 'Water'],
            ['gasReading', 'Gas'],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="block">
            <span className="text-xs text-ink-500">{label}</span>
            <input
              disabled={!editable}
              value={v[k]}
              placeholder={editable ? 'Reading' : '—'}
              onChange={(e) => setV({ ...v, [k]: e.target.value })}
              className="mt-0.5 block w-full rounded-lg border-0 px-2.5 py-1.5 font-mono text-sm ring-1 ring-ink-200 focus:ring-2 focus:ring-ink-700 disabled:bg-ink-50"
            />
          </label>
        ))}
        {editable && dirty && (
          <Button size="sm" className="w-full" onClick={() => save.mutate()} disabled={save.isPending}>
            Save readings
          </Button>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function RoomSection({ room, items, inspection, mode, onChanged }: { room: Room; items: Item[]; inspection: Inspection; mode: Mode; onChanged: () => void }) {
  const Icon = roomIcon(room.name);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const unchecked = items.filter((i) => !i.condition).length;
  const canShape = mode === 'edit' && inspection.type === 'MOVE_IN';

  const markGood = useMutation({ mutationFn: () => api(`/inspections/${inspection.id}/rooms/${room.id}/mark-good`, { method: 'POST' }), onSuccess: onChanged });
  const add = useMutation({
    mutationFn: () => api(`/inspections/${inspection.id}/items`, { method: 'POST', body: { roomId: room.id, name } }),
    onSuccess: () => {
      setName('');
      setAdding(false);
      onChanged();
    },
  });

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="grid size-9 place-items-center rounded-xl bg-white text-ink-700 shadow-sm ring-1 ring-ink-100">
          <Icon className="size-4.5" />
        </div>
        <h3 className="text-base font-bold tracking-tight text-ink-900">{room.name}</h3>
        <span className="text-xs text-ink-400">
          {items.filter((i) => i.condition).length}/{items.length} checked
        </span>
        <span className="h-px flex-1 bg-ink-100" />
        {mode === 'edit' && unchecked > 0 && (
          <Button size="sm" variant="secondary" disabled={markGood.isPending} onClick={() => markGood.mutate()} title="Sets Good on every item you haven’t checked yet">
            <Sparkles className="size-3.5" /> Mark remaining {unchecked} as Good
          </Button>
        )}
        {canShape && (
          <Button size="sm" variant="ghost" onClick={() => setAdding(!adding)}>
            <Plus className="size-3.5" /> Add item
          </Button>
        )}
      </div>

      {adding && (
        <form
          className="animate-rise mb-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length >= 2) add.mutate();
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Something else in the ${room.name.toLowerCase()}, e.g. Sofa, Study table, Geyser`}
            className="flex-1 rounded-xl border-0 px-3.5 py-2 text-sm ring-1 ring-ink-200 focus:ring-2 focus:ring-ink-700"
          />
          <Button size="sm" disabled={name.trim().length < 2 || add.isPending}>
            Add
          </Button>
        </form>
      )}
      {add.error && <p className="mb-2 text-sm text-red-600">{(add.error as Error).message}</p>}

      <div className="space-y-3">
        {items.map((it) => (
          <ItemCard key={it.id} item={it} inspection={inspection} mode={mode} canRemove={canShape && items.length > 0} onChanged={onChanged} />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

const STRIPE: Record<string, string> = {
  GOOD: 'before:bg-ok-500',
  FAIR: 'before:bg-ink-400',
  DAMAGED: 'before:bg-warn-500',
  MISSING: 'before:bg-red-500',
  NOT_APPLICABLE: 'before:bg-stone-300',
};

function ItemCard({ item, inspection, mode, canRemove, onChanged }: { item: Item; inspection: Inspection; mode: Mode; canRemove: boolean; onChanged: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState(false);
  const [notes, setNotes] = useState(item.notes ?? '');
  const [reviewing, setReviewing] = useState<null | 'DISPUTED' | 'NOTED'>(null);
  const [comment, setComment] = useState('');
  const [err, setErr] = useState('');

  const isRevising = inspection.isAuthor && inspection.status === 'SUBMITTED' && item.reviewStatus === 'DISPUTED';
  const editable = mode === 'edit' || isRevising;
  const isMoveOut = inspection.type === 'MOVE_OUT';
  const baselinePhoto = item.baselineItem?.evidence.find((e) => e.mimeType.startsWith('image/'));
  const touch = isTouchDevice();

  const done = () => {
    setErr('');
    onChanged();
  };
  const onError = (e: Error) => setErr(e.message);

  const update = useMutation({
    mutationFn: (body: { condition?: Condition; notes?: string | null }) => api(`/items/${item.id}`, { method: 'PATCH', body: { version: item.version, ...body } }),
    onSuccess: done,
    onError,
  });
  const upload = useMutation({
    mutationFn: async ({ files, withLocation }: { files: File[]; withLocation?: boolean }) => {
      const fd = new FormData();
      // In-app camera shots carry no EXIF, so send the phone's position with them.
      if (withLocation) {
        const p = await currentPosition();
        if (p) {
          fd.append('deviceLat', String(p.lat));
          fd.append('deviceLng', String(p.lng));
        }
      }
      files.forEach((f) => fd.append('files', f));
      return api(`/items/${item.id}/evidence`, { method: 'POST', body: fd });
    },
    onSuccess: done,
    onError,
  });
  const removePhoto = useMutation({ mutationFn: (evId: number) => api(`/evidence/${evId}`, { method: 'DELETE' }), onSuccess: done, onError });
  const removeItem = useMutation({ mutationFn: () => api(`/items/${item.id}`, { method: 'DELETE' }), onSuccess: done, onError });
  const review = useMutation({
    mutationFn: (body: { decision: 'APPROVED' | 'DISPUTED' | 'NOTED'; comment?: string }) =>
      api(`/items/${item.id}/review`, { method: 'POST', body: { version: item.version, ...body } }),
    onSuccess: () => {
      setReviewing(null);
      setComment('');
      done();
    },
    onError,
  });

  const statusBadge =
    inspection.status === 'DRAFT' ? null : item.reviewStatus === 'APPROVED' ? (
      <Badge tone="ok">
        <Check className="size-3" /> Agreed
      </Badge>
    ) : item.reviewStatus === 'NOTED' ? (
      <Badge tone="ink">
        <Scale className="size-3" /> Both views recorded
      </Badge>
    ) : item.reviewStatus === 'DISPUTED' ? (
      <Badge tone="warn">Sent back</Badge>
    ) : (
      <Badge tone="muted">Awaiting review</Badge>
    );

  return (
    <Card
      className={cx(
        'relative overflow-hidden p-4 pl-5 sm:p-5 sm:pl-6',
        'before:absolute before:inset-y-0 before:left-0 before:w-1',
        item.condition ? STRIPE[item.condition] : 'before:bg-ink-100',
        item.reviewStatus === 'DISPUTED' && 'ring-2 ring-warn-500/40',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold text-ink-900">{item.name}</h4>
          {isMoveOut && item.baselineItem && (
            <p className="mt-0.5 text-xs text-ink-500">
              At move-in: <Badge tone={toneOf(item.baselineItem.condition)}>{conditionLabel(item.baselineItem.condition)}</Badge>
              {item.baselineItem.notes && <span className="ml-1.5 italic">“{item.baselineItem.notes}”</span>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {mode !== 'edit' && item.condition && <Badge tone={toneOf(item.condition)}>{conditionLabel(item.condition)}</Badge>}
          {statusBadge}
          {canRemove && (
            <button
              onClick={() => confirm(`Remove “${item.name}” from the checklist?`) && removeItem.mutate()}
              className="rounded-lg p-1.5 text-ink-300 hover:bg-red-50 hover:text-red-600"
              title="Remove this item (it doesn’t exist in this flat)"
              aria-label={`Remove ${item.name}`}
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* The other side's comment */}
      {(item.reviewStatus === 'DISPUTED' || item.reviewStatus === 'NOTED') && item.reviewComment && (
        <div className={cx('mt-3 flex gap-2 rounded-xl p-3 text-sm', item.reviewStatus === 'NOTED' ? 'bg-ink-50 text-ink-700' : 'bg-warn-50 text-warn-700')}>
          {item.reviewStatus === 'NOTED' ? <Scale className="mt-0.5 size-4 shrink-0" /> : <MessageSquareWarning className="mt-0.5 size-4 shrink-0" />}
          <div>
            <p className="font-semibold">
              {item.reviewStatus === 'NOTED' ? 'Reviewer’s view (recorded alongside yours)' : inspection.isAuthor ? 'Sent back by the other party' : 'You sent this back'}
            </p>
            <p className="text-ink-700">{item.reviewComment}</p>
            {isRevising && <p className="mt-1 text-xs">Update the condition, notes or photos. It goes back for review automatically.</p>}
          </div>
        </div>
      )}

      {/* Condition */}
      {editable && (
        <div className="mt-4 inline-flex flex-wrap gap-1 rounded-xl bg-ink-50 p-1">
          {CONDITIONS.map((c) => {
            const on = item.condition === c.value;
            return (
              <button
                key={c.value}
                disabled={update.isPending}
                onClick={() => update.mutate({ condition: c.value })}
                className={cx(
                  'rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                  on
                    ? cx(
                        'shadow-sm',
                        c.tone === 'ok' && 'bg-ok-600 text-white',
                        c.tone === 'warn' && 'bg-warn-500 text-white',
                        c.tone === 'bad' && 'bg-red-600 text-white',
                        c.tone === 'ink' && 'bg-ink-800 text-white',
                        c.tone === 'muted' && 'bg-stone-500 text-white',
                      )
                    : 'text-ink-500 hover:bg-white hover:text-ink-900',
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Notes */}
      {editable ? (
        <div className="mt-3">
          <TextArea
            rows={2}
            placeholder={item.condition && item.condition !== 'GOOD' && item.condition !== 'NOT_APPLICABLE' ? 'Describe it: what, where, how big…' : 'Notes (optional)'}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== (item.notes ?? '') && update.mutate({ notes: notes.trim() || null })}
          />
        </div>
      ) : (
        item.notes && <p className="mt-3 text-sm text-ink-600">{item.notes}</p>
      )}

      {/* Photos */}
      {(item.evidence.length > 0 || editable || (isMoveOut && baselinePhoto)) && (
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {isMoveOut && baselinePhoto && (
            <div className="relative">
              <AuthedImage id={baselinePhoto.id} className="aspect-[4/3] w-full rounded-xl opacity-75 ring-1 ring-ink-100" />
              <span className="absolute inset-x-1.5 bottom-1.5 rounded-md bg-white/90 px-1.5 py-0.5 text-center text-[9px] font-bold tracking-wide text-ink-700">MOVE-IN</span>
            </div>
          )}
          {item.evidence.map((ev) => (
            <PhotoTile key={ev.id} ev={ev} property={inspection.property} onRemove={editable ? () => removePhoto.mutate(ev.id) : undefined} />
          ))}
          {editable && (
            <>
              {touch && (
                <button
                  onClick={() => setCamera(true)}
                  className="flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-ink-200 text-ink-500 transition-colors hover:border-ink-400 hover:bg-white hover:text-ink-900"
                >
                  <Camera className="size-5" />
                  <span className="text-[11px] font-semibold">{isMoveOut && baselinePhoto ? 'Retake' : 'Camera'}</span>
                </button>
              )}
              <button
                onClick={() => fileInput.current?.click()}
                disabled={upload.isPending}
                className="flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-ink-200 text-ink-500 transition-colors hover:border-ink-400 hover:bg-white hover:text-ink-900"
              >
                {upload.isPending ? <span className="size-5 animate-spin rounded-full border-2 border-ink-200 border-t-ink-700" /> : <ImagePlus className="size-5" />}
                <span className="text-[11px] font-semibold">{upload.isPending ? 'Checking…' : 'Add photos'}</span>
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                hidden
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length) upload.mutate({ files });
                  e.target.value = '';
                }}
              />
            </>
          )}
        </div>
      )}

      {err && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-red-600">
          <AlertTriangle className="size-4" /> {err}
        </p>
      )}

      {/* Reviewer */}
      {mode === 'review' && item.reviewStatus === 'PENDING' && (
        <div className="mt-4 border-t border-ink-50 pt-4">
          {reviewing ? (
            <div className="animate-rise space-y-2">
              <p className="text-xs text-ink-500">
                {reviewing === 'DISPUTED'
                  ? 'The item goes back to be corrected, then returns to you.'
                  : 'Your view is recorded next to theirs, and this item stops blocking the record from locking.'}
              </p>
              <TextArea
                rows={2}
                autoFocus
                placeholder={reviewing === 'DISPUTED' ? 'What’s wrong? e.g. “The crack is bigger than described”' : 'Your view, e.g. “The tap was replaced last month and was working”'}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setReviewing(null)}>
                  Cancel
                </Button>
                <Button size="sm" disabled={comment.trim().length < 3 || review.isPending} onClick={() => review.mutate({ decision: reviewing, comment })}>
                  {reviewing === 'DISPUTED' ? 'Send back' : 'Record my view'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setReviewing('NOTED')} title="Keep both views and move on">
                <Scale className="size-3.5" /> Record disagreement
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setReviewing('DISPUTED')}>
                <Undo2 className="size-3.5" /> Send back
              </Button>
              <Button variant="success" size="sm" disabled={review.isPending} onClick={() => review.mutate({ decision: 'APPROVED' })}>
                <ThumbsUp className="size-3.5" /> Approve
              </Button>
            </div>
          )}
        </div>
      )}

      {touch && (
        <CameraCapture
          open={camera}
          onClose={() => setCamera(false)}
          onCapture={(f) => upload.mutate({ files: [f], withLocation: true })}
          ghostEvidenceId={isMoveOut ? baselinePhoto?.id : null}
        />
      )}
    </Card>
  );
}
