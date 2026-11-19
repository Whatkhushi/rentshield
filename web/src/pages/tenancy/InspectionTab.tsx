import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Camera, Check, CheckCheck, ClipboardList, Gauge, ImagePlus, Lock, MessageSquareWarning, Send, ThumbsUp } from 'lucide-react';
import { api } from '../../lib/api';
import { CONDITIONS, conditionLabel, dateTime } from '../../lib/format';
import type { Condition, Inspection, InspectionType, Item, LeaseDetail } from '../../lib/types';
import { CameraCapture } from '../../components/CameraCapture';
import { AuthedImage, PhotoTile } from '../../components/Photo';
import { Alert, Badge, Button, Card, EmptyState, Spinner, TextArea, cx, type Tone } from '../../components/ui';

const toneOf = (c: Condition | null): Tone => (CONDITIONS.find((x) => x.value === c)?.tone as Tone) ?? 'muted';

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
          ? 'The move-in inspection has to be agreed by both of you first. Move-out is compared against it.'
          : type === 'MOVE_IN'
            ? `We’ll create a checklist for each of the ${lease.property.rooms?.length} rooms. You document; the ${lease.myRole === 'TENANT' ? 'landlord' : 'tenant'} reviews. Do it on the day you get the keys.`
            : 'Every move-in item is copied over. Re-photograph each one. The camera shows the move-in photo as a ghost so you can line up the same shot.'}
      </EmptyState>
    );
  }
  return <InspectionView id={summary.id} leaseId={lease.id} />;
}

// ---------------------------------------------------------------------------

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

  const mode: 'edit' | 'review' | 'wait' | 'locked' =
    data.status === 'FINALIZED' ? 'locked' : data.isAuthor ? (data.status === 'DRAFT' ? 'edit' : 'wait') : data.status === 'SUBMITTED' ? 'review' : 'wait';
  const items = data.items;
  const documented = items.filter((i) => i.condition).length;
  const approved = items.filter((i) => i.reviewStatus === 'APPROVED').length;
  const disputed = items.filter((i) => i.reviewStatus === 'DISPUTED').length;
  const pending = items.filter((i) => i.reviewStatus === 'PENDING').length;
  const photos = items.reduce((n, i) => n + i.evidence.length, 0);
  const visibleRooms = data.rooms.filter((r) => roomId === 'all' || r.id === roomId);
  const otherName = data.myRole === 'TENANT' ? 'landlord' : 'tenant';

  return (
    <div className="space-y-6">
      {/* ---- Status banner ---- */}
      <StatusBanner
        data={data}
        mode={mode}
        counts={{ documented, approved, disputed, pending, photos, total: items.length }}
        otherName={otherName}
        onSubmit={() => submit.mutate()}
        submitting={submit.isPending}
        onApproveAll={() => approveAll.mutate()}
        approving={approveAll.isPending}
      />
      {(submit.error || approveAll.error) && <Alert>{((submit.error || approveAll.error) as Error).message}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        {/* ---- Room nav ---- */}
        <aside className="lg:sticky lg:top-32 lg:self-start">
          <div className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">
            <RoomButton active={roomId === 'all'} onClick={() => setRoomId('all')} label="All rooms" done={documented} total={items.length} />
            {data.rooms.map((r) => {
              const its = byRoom.get(r.id) ?? [];
              const n = mode === 'edit' ? its.filter((i) => i.condition).length : its.filter((i) => i.reviewStatus === 'APPROVED').length;
              const hasDispute = its.some((i) => i.reviewStatus === 'DISPUTED');
              return <RoomButton key={r.id} active={roomId === r.id} onClick={() => setRoomId(r.id)} label={r.name} done={n} total={its.length} warn={hasDispute} />;
            })}
          </div>
          {data.isAuthor && <MeterReadings data={data} onSaved={refresh} />}
          {!data.isAuthor && (
            <Card className="mt-4 hidden p-4 text-sm lg:block">
              <p className="flex items-center gap-1.5 font-semibold text-ink-900">
                <Gauge className="size-4" /> Meter readings
              </p>
              <dl className="mt-2 space-y-1 text-ink-600">
                <div className="flex justify-between"><dt>Electricity</dt><dd className="font-mono">{data.electricityReading ?? '—'}</dd></div>
                <div className="flex justify-between"><dt>Water</dt><dd className="font-mono">{data.waterReading ?? '—'}</dd></div>
                <div className="flex justify-between"><dt>Gas</dt><dd className="font-mono">{data.gasReading ?? '—'}</dd></div>
              </dl>
            </Card>
          )}
        </aside>

        {/* ---- Items ---- */}
        <div className="space-y-8">
          {visibleRooms.map((room) => (
            <section key={room.id}>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-ink-500">
                {room.name}
                <span className="h-px flex-1 bg-ink-100" />
              </h3>
              <div className="space-y-3">
                {(byRoom.get(room.id) ?? []).map((it) => (
                  <ItemCard key={it.id} item={it} inspection={data} mode={mode} onChanged={refresh} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function RoomButton({ active, onClick, label, done, total, warn }: { active: boolean; onClick: () => void; label: string; done: number; total: number; warn?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'flex shrink-0 items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors',
        active ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-white',
      )}
    >
      <span className="flex items-center gap-1.5 font-medium">
        {warn && <span className="size-1.5 rounded-full bg-warn-500" />}
        {label}
      </span>
      <span className={cx('font-mono text-[11px]', active ? 'text-ink-300' : done === total ? 'text-ok-600' : 'text-ink-400')}>
        {done}/{total}
      </span>
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
  mode: 'edit' | 'review' | 'wait' | 'locked';
  counts: { documented: number; approved: number; disputed: number; pending: number; photos: number; total: number };
  otherName: string;
  onSubmit: () => void;
  submitting: boolean;
  onApproveAll: () => void;
  approving: boolean;
}) {
  const title = data.type === 'MOVE_IN' ? 'Move-in inspection' : 'Move-out inspection';
  const pct = (mode === 'edit' ? counts.documented : counts.approved) / Math.max(1, counts.total);

  let headline = '';
  let sub = '';
  let action: React.ReactNode = null;
  if (mode === 'locked') {
    headline = 'Agreed by both parties and locked';
    sub = `Finalized ${dateTime(data.finalizedAt)}. This record can no longer be changed by anyone.`;
  } else if (mode === 'edit') {
    headline = `Document every item, then send it to the ${otherName}`;
    sub = `${counts.documented} of ${counts.total} items have a condition · ${counts.photos} photos. Photos of anything less than “Good” matter most.`;
    action = (
      <Button variant="success" size="lg" disabled={counts.documented < counts.total || !data.otherPartyJoined || submitting} onClick={onSubmit}>
        <Send className="size-4" /> {submitting ? 'Submitting…' : `Submit for review`}
      </Button>
    );
    if (!data.otherPartyJoined) sub += ` Invite the ${otherName} before submitting.`;
  } else if (mode === 'review') {
    headline = `Review what the ${otherName} documented`;
    sub = `Approve items you agree with. Dispute anything that’s wrong, with a reason. ${counts.pending} waiting for you.`;
    action = counts.pending > 0 && (
      <Button variant="success" size="lg" disabled={approving} onClick={onApproveAll}>
        <CheckCheck className="size-4" /> {approving ? 'Approving…' : `Approve all ${counts.pending} remaining`}
      </Button>
    );
  } else {
    headline = data.status === 'DRAFT' ? `The ${otherName} is still documenting` : counts.disputed ? `${counts.disputed} item(s) disputed. Revise them below.` : `Waiting for the ${otherName} to review`;
    sub = data.status === 'DRAFT' ? 'You’ll be able to review once they submit.' : `${counts.approved} of ${counts.total} agreed so far.`;
  }

  return (
    <Card className={cx('overflow-hidden', mode === 'locked' && 'ring-ok-100')}>
      <div className={cx('flex flex-wrap items-center justify-between gap-4 p-5', mode === 'locked' ? 'bg-ok-50' : counts.disputed && mode === 'wait' ? 'bg-warn-50' : '')}>
        <div className="flex items-start gap-3">
          <div className={cx('grid size-10 shrink-0 place-items-center rounded-xl', mode === 'locked' ? 'bg-ok-600 text-white' : 'bg-ink-900 text-white')}>
            {mode === 'locked' ? <Lock className="size-5" /> : <ClipboardList className="size-5" />}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{title}</p>
            <p className="font-semibold text-ink-900">{headline}</p>
            <p className="mt-0.5 text-sm text-ink-500">{sub}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="h-1 bg-ink-50">
        <div className={cx('h-full transition-all', mode === 'locked' ? 'bg-ok-500' : 'bg-ink-800')} style={{ width: `${pct * 100}%` }} />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function MeterReadings({ data, onSaved }: { data: Inspection; onSaved: () => void }) {
  const [v, setV] = useState({ electricityReading: data.electricityReading ?? '', waterReading: data.waterReading ?? '', gasReading: data.gasReading ?? '' });
  const editable = data.status === 'DRAFT';
  const save = useMutation({
    mutationFn: () =>
      api(`/inspections/${data.id}`, {
        method: 'PATCH',
        body: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.trim() || null])),
      }),
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

function ItemCard({ item, inspection, mode, onChanged }: { item: Item; inspection: Inspection; mode: 'edit' | 'review' | 'wait' | 'locked'; onChanged: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState(false);
  const [notes, setNotes] = useState(item.notes ?? '');
  const [disputing, setDisputing] = useState(false);
  const [comment, setComment] = useState('');
  const [err, setErr] = useState('');

  const isRevising = inspection.isAuthor && inspection.status === 'SUBMITTED' && item.reviewStatus === 'DISPUTED';
  const editable = mode === 'edit' || isRevising;
  const isMoveOut = inspection.type === 'MOVE_OUT';
  const baselinePhoto = item.baselineItem?.evidence.find((e) => e.mimeType.startsWith('image/'));

  const onError = (e: Error) => setErr(e.message);
  const done = () => {
    setErr('');
    onChanged();
  };

  const update = useMutation({
    mutationFn: (body: { condition?: Condition; notes?: string | null }) => api(`/items/${item.id}`, { method: 'PATCH', body: { version: item.version, ...body } }),
    onSuccess: done,
    onError,
  });
  const upload = useMutation({
    mutationFn: (files: File[]) => {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      return api(`/items/${item.id}/evidence`, { method: 'POST', body: fd });
    },
    onSuccess: done,
    onError,
  });
  const remove = useMutation({ mutationFn: (evId: number) => api(`/evidence/${evId}`, { method: 'DELETE' }), onSuccess: done, onError });
  const review = useMutation({
    mutationFn: (body: { decision: 'APPROVED' | 'DISPUTED'; comment?: string }) => api(`/items/${item.id}/review`, { method: 'POST', body: { version: item.version, ...body } }),
    onSuccess: () => {
      setDisputing(false);
      setComment('');
      done();
    },
    onError,
  });

  return (
    <Card
      className={cx(
        'p-4 transition-shadow sm:p-5',
        item.reviewStatus === 'DISPUTED' && 'ring-2 ring-warn-500/40',
        item.reviewStatus === 'APPROVED' && mode !== 'edit' && 'ring-ok-100',
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
          {inspection.status !== 'DRAFT' && (
            <Badge tone={item.reviewStatus === 'APPROVED' ? 'ok' : item.reviewStatus === 'DISPUTED' ? 'warn' : 'muted'}>
              {item.reviewStatus === 'APPROVED' ? <><Check className="size-3" /> Agreed</> : item.reviewStatus === 'DISPUTED' ? 'Disputed' : 'Awaiting review'}
            </Badge>
          )}
        </div>
      </div>

      {/* Dispute reason, shown to both */}
      {item.reviewStatus === 'DISPUTED' && item.reviewComment && (
        <div className="mt-3 flex gap-2 rounded-xl bg-warn-50 p-3 text-sm text-warn-700">
          <MessageSquareWarning className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">{inspection.isAuthor ? 'Disputed by the other party' : 'You disputed this'}</p>
            <p className="text-ink-700">{item.reviewComment}</p>
            {isRevising && <p className="mt-1 text-xs">Update the condition, notes or photos below. It goes back for review automatically.</p>}
          </div>
        </div>
      )}

      {/* Condition selector */}
      {editable && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {CONDITIONS.map((c) => (
            <button
              key={c.value}
              disabled={update.isPending}
              onClick={() => update.mutate({ condition: c.value })}
              className={cx(
                'rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition-colors',
                item.condition === c.value
                  ? c.tone === 'ok'
                    ? 'bg-ok-600 text-white ring-ok-600'
                    : c.tone === 'warn'
                      ? 'bg-warn-500 text-white ring-warn-500'
                      : c.tone === 'bad'
                        ? 'bg-red-600 text-white ring-red-600'
                        : 'bg-ink-900 text-white ring-ink-900'
                  : 'bg-white text-ink-600 ring-ink-200 hover:ring-ink-400',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* Notes */}
      {editable ? (
        <div className="mt-3">
          <TextArea
            rows={2}
            placeholder={item.condition && item.condition !== 'GOOD' ? 'Describe it: what, where, how big…' : 'Notes (optional)'}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== (item.notes ?? '') && update.mutate({ notes: notes.trim() || null })}
          />
        </div>
      ) : (
        item.notes && <p className="mt-3 text-sm text-ink-600">{item.notes}</p>
      )}

      {/* Photos */}
      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
        {isMoveOut && baselinePhoto && (
          <div className="relative">
            <AuthedImage id={baselinePhoto.id} className="aspect-[4/3] w-full rounded-xl opacity-70 ring-1 ring-ink-100" />
            <span className="absolute inset-x-1.5 bottom-1.5 rounded-md bg-white/90 px-1.5 py-0.5 text-center text-[9px] font-semibold text-ink-700">MOVE-IN</span>
          </div>
        )}
        {item.evidence.map((ev) => (
          <PhotoTile key={ev.id} ev={ev} onRemove={editable && ev.uploadedById ? () => remove.mutate(ev.id) : undefined} />
        ))}
        {editable && (
          <>
            <button
              onClick={() => setCamera(true)}
              className="flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-ink-200 text-ink-500 transition-colors hover:border-ink-400 hover:bg-white hover:text-ink-900"
            >
              <Camera className="size-5" />
              <span className="text-[11px] font-semibold">{isMoveOut && baselinePhoto ? 'Retake' : 'Camera'}</span>
            </button>
            <button
              onClick={() => fileInput.current?.click()}
              disabled={upload.isPending}
              className="flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-ink-200 text-ink-500 transition-colors hover:border-ink-400 hover:bg-white hover:text-ink-900"
            >
              {upload.isPending ? <span className="size-5 animate-spin rounded-full border-2 border-ink-200 border-t-ink-700" /> : <ImagePlus className="size-5" />}
              <span className="text-[11px] font-semibold">{upload.isPending ? 'Hashing…' : 'Upload'}</span>
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length) upload.mutate(files);
                e.target.value = '';
              }}
            />
          </>
        )}
      </div>
      {!editable && item.evidence.length === 0 && !baselinePhoto && <p className="mt-1 text-xs text-ink-400">No photos.</p>}

      {err && <p className="mt-3 flex items-center gap-1.5 text-sm text-red-600"><AlertTriangle className="size-4" /> {err}</p>}

      {/* Reviewer actions */}
      {mode === 'review' && item.reviewStatus === 'PENDING' && (
        <div className="mt-4 border-t border-ink-50 pt-4">
          {disputing ? (
            <div className="space-y-2">
              <TextArea rows={2} autoFocus placeholder="What’s wrong? e.g. “The crack is bigger than described”" value={comment} onChange={(e) => setComment(e.target.value)} />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setDisputing(false)}>Cancel</Button>
                <Button size="sm" disabled={comment.trim().length < 3 || review.isPending} onClick={() => review.mutate({ decision: 'DISPUTED', comment })}>
                  Send dispute
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setDisputing(true)}>
                <MessageSquareWarning className="size-3.5" /> Dispute
              </Button>
              <Button variant="success" size="sm" disabled={review.isPending} onClick={() => review.mutate({ decision: 'APPROVED' })}>
                <ThumbsUp className="size-3.5" /> Approve
              </Button>
            </div>
          )}
        </div>
      )}

      <CameraCapture open={camera} onClose={() => setCamera(false)} onCapture={(f) => upload.mutate([f])} ghostEvidenceId={isMoveOut ? baselinePhoto?.id : null} />
    </Card>
  );
}
