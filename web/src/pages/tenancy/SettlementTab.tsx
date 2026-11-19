import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, FilePlus2, Handshake, Info, MessageSquareWarning, Pencil, Plus, Receipt, Scale, ThumbsUp, Undo2 } from 'lucide-react';
import { api } from '../../lib/api';
import { conditionLabel, dateTime, inr } from '../../lib/format';
import type { Deduction, Inspection, LeaseDetail, Settlement } from '../../lib/types';
import { AuthedImage, PhotoTile } from '../../components/Photo';
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, Spinner, TextArea, cx, type Tone } from '../../components/ui';

const statusTone: Record<Deduction['status'], Tone> = { PROPOSED: 'ink', ACCEPTED: 'ok', DISPUTED: 'warn', WITHDRAWN: 'muted' };
const statusLabel: Record<Deduction['status'], string> = { PROPOSED: 'Awaiting tenant', ACCEPTED: 'Accepted', DISPUTED: 'Disputed', WITHDRAWN: 'Withdrawn' };

export default function SettlementTab({ lease }: { lease: LeaseDetail }) {
  const qc = useQueryClient();
  const key = ['settlement', lease.id];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => api<{ settlement: Settlement | null; myRole: 'LANDLORD' | 'TENANT' }>(`/leases/${lease.id}/settlement`),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ['lease', lease.id] });
  };
  const open = useMutation({ mutationFn: () => api(`/leases/${lease.id}/settlement`, { method: 'POST' }), onSuccess: refresh });

  if (isLoading) return <Spinner />;
  const s = data?.settlement;
  const isLandlord = lease.myRole === 'LANDLORD';
  const moveOut = lease.inspections.find((i) => i.type === 'MOVE_OUT');

  if (!s) {
    const ready = moveOut?.status === 'FINALIZED';
    return (
      <EmptyState
        icon={<Scale className="size-6" />}
        title="Deposit settlement"
        action={
          isLandlord && ready ? (
            <div className="flex flex-col items-center gap-2">
              {open.error && <Alert>{(open.error as Error).message}</Alert>}
              <Button size="lg" onClick={() => open.mutate()} disabled={open.isPending}>
                Open settlement for {inr(lease.securityDeposit)}
              </Button>
            </div>
          ) : undefined
        }
      >
        {!ready
          ? 'Settlement opens after both of you agree the move-out inspection, so every deduction can point at agreed evidence.'
          : isLandlord
            ? 'Propose any deductions item by item, each with a reason and evidence. The tenant accepts or disputes each one.'
            : 'Waiting for the landlord to open the settlement.'}
      </EmptyState>
    );
  }

  const t = s.totals;
  const agreed = s.status === 'AGREED';
  const myConfirmed = isLandlord ? s.landlordConfirmedAt : s.tenantConfirmedAt;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        {agreed && (
          <div className="animate-rise flex items-center gap-4 rounded-2xl bg-ok-600 p-5 text-white">
            <Handshake className="size-8 shrink-0" />
            <div>
              <p className="text-lg font-semibold">Settlement agreed: {inr(s.finalRefund!)} to be refunded</p>
              <p className="text-sm text-ok-100">Both parties confirmed on {dateTime(s.agreedAt)}. Download the full record from Records.</p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Deductions</h2>
          {isLandlord && !agreed && <AddDeduction settlement={s} leaseId={lease.id} onDone={refresh} />}
        </div>

        {s.deductions.length === 0 && (
          <EmptyState icon={<Receipt className="size-6" />} title="No deductions proposed">
            {isLandlord ? 'If nothing needs deducting, both of you can confirm and the full deposit is refunded.' : 'The landlord hasn’t proposed any deductions.'}
          </EmptyState>
        )}

        {s.deductions.map((d) => (
          <DeductionCard key={d.id} d={d} isLandlord={isLandlord} locked={agreed} onDone={refresh} />
        ))}
      </div>

      {/* ---- Money summary ---- */}
      <aside className="lg:sticky lg:top-32 lg:self-start">
        <Card className="overflow-hidden">
          <div className="bg-ink-950 p-5 text-white">
            <p className="text-xs uppercase tracking-wider text-ink-300">{agreed ? 'Final refund' : 'Refund if everything open is accepted'}</p>
            <p className="mt-1 text-4xl font-extrabold tabular-nums tracking-tight">{inr(agreed ? s.finalRefund! : t.refundIfAllAccepted)}</p>
          </div>
          <dl className="space-y-2.5 p-5 text-sm">
            <Line k="Security deposit" v={inr(t.deposit)} />
            <Line k="Accepted deductions" v={`− ${inr(t.accepted)}`} tone="text-red-700" />
            {t.open > 0 && <Line k={`Still open (${t.unresolvedCount})`} v={`− ${inr(t.open)}`} tone="text-warn-700" />}
            <div className="border-t border-ink-100 pt-2.5">
              <Line k="Refund so far" v={inr(t.refundSoFar)} bold />
            </div>
          </dl>
          <div className="space-y-2 border-t border-ink-100 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Confirmation</p>
            {(
              [
                ['Landlord', s.landlordConfirmedAt],
                ['Tenant', s.tenantConfirmedAt],
              ] as const
            ).map(([who, at]) => (
              <p key={who} className="flex items-center gap-2 text-sm">
                {at ? <CheckCircle2 className="size-4 text-ok-600" /> : <Circle className="size-4 text-ink-200" />}
                <span className="font-medium">{who}</span>
                <span className="ml-auto text-xs text-ink-400">{at ? dateTime(at) : 'pending'}</span>
              </p>
            ))}
            {!agreed && <ConfirmButton settlement={s} disabled={t.unresolvedCount > 0 || Boolean(myConfirmed)} confirmed={Boolean(myConfirmed)} onDone={refresh} />}
            {!agreed && t.unresolvedCount > 0 && <p className="text-xs text-ink-500">Every deduction must be accepted or withdrawn before confirming.</p>}
          </div>
        </Card>
      </aside>
    </div>
  );
}

function Line({ k, v, tone, bold }: { k: string; v: string; tone?: string; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className={cx('text-ink-500', bold && 'font-semibold text-ink-900')}>{k}</dt>
      <dd className={cx('tabular-nums', tone ?? 'text-ink-900', bold && 'font-bold')}>{v}</dd>
    </div>
  );
}

function ConfirmButton({ settlement, disabled, confirmed, onDone }: { settlement: Settlement; disabled: boolean; confirmed: boolean; onDone: () => void }) {
  const confirm = useMutation({ mutationFn: () => api(`/settlements/${settlement.id}/confirm`, { method: 'POST' }), onSuccess: onDone });
  return (
    <>
      <Button variant="success" className="mt-2 w-full" disabled={disabled || confirm.isPending} onClick={() => confirm.mutate()}>
        <Handshake className="size-4" /> {confirmed ? 'You confirmed. Waiting for the other party' : 'Confirm final settlement'}
      </Button>
      {confirm.error && <p className="text-xs text-red-600">{(confirm.error as Error).message}</p>}
    </>
  );
}

// ---------------------------------------------------------------------------

function DeductionCard({ d, isLandlord, locked, onDone }: { d: Deduction; isLandlord: boolean; locked: boolean; onDone: () => void }) {
  const [mode, setMode] = useState<'none' | 'dispute' | 'revise'>('none');
  const [comment, setComment] = useState('');
  const [amount, setAmount] = useState(String(d.amount));
  const [reason, setReason] = useState(d.reason);
  const invoiceInput = useRef<HTMLInputElement>(null);
  const after = d.item?.evidence.find((e) => e.mimeType.startsWith('image/'));
  const before = d.item?.baselineItem?.evidence.find((e) => e.mimeType.startsWith('image/'));

  const ok = () => {
    setMode('none');
    onDone();
  };
  const respond = useMutation({
    mutationFn: (body: { decision: 'ACCEPTED' | 'DISPUTED'; comment?: string }) => api(`/deductions/${d.id}/respond`, { method: 'POST', body: { version: d.version, ...body } }),
    onSuccess: ok,
  });
  const revise = useMutation({
    mutationFn: (body: { amount?: number; reason?: string; withdraw?: boolean }) => api(`/deductions/${d.id}`, { method: 'PATCH', body: { version: d.version, ...body } }),
    onSuccess: ok,
  });
  const attach = useMutation({
    mutationFn: (files: File[]) => {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      return api(`/deductions/${d.id}/evidence`, { method: 'POST', body: fd });
    },
    onSuccess: onDone,
  });
  const err = (respond.error || revise.error || attach.error) as Error | null;
  const open = d.status === 'PROPOSED' || d.status === 'DISPUTED';

  return (
    <Card className={cx('p-5', d.status === 'WITHDRAWN' && 'opacity-60', d.status === 'DISPUTED' && 'ring-2 ring-warn-500/30')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={cx('text-2xl font-bold tabular-nums', d.status === 'WITHDRAWN' && 'line-through')}>{inr(d.amount)}</p>
          <p className="mt-0.5 text-ink-700">{d.reason}</p>
        </div>
        <Badge tone={statusTone[d.status]}>{statusLabel[d.status]}</Badge>
      </div>

      {d.item && (
        <div className="mt-4 rounded-xl bg-ink-50 p-3">
          <p className="text-xs font-semibold text-ink-500">
            Linked evidence · {d.item.room.name} / {d.item.name} · {conditionLabel(d.item.baselineItem?.condition ?? null)} → {conditionLabel(d.item.condition)}
          </p>
          <div className="mt-2 grid max-w-md grid-cols-2 gap-2">
            {[
              ['Move-in', before],
              ['Move-out', after],
            ].map(([label, ev]) => (
              <div key={label as string} className="relative">
                {ev ? <AuthedImage id={(ev as { id: number }).id} className="aspect-[4/3] w-full rounded-lg" /> : <div className="grid aspect-[4/3] place-items-center rounded-lg bg-stone-100 text-xs text-stone-400">No photo</div>}
                <span className="absolute left-1.5 top-1.5 rounded bg-ink-950/70 px-1.5 py-0.5 text-[9px] font-semibold text-white">{label as string}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(d.evidence.length > 0 || (isLandlord && open && !locked)) && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold text-ink-500">Invoices & bills</p>
          <div className="flex flex-wrap gap-2">
            {d.evidence.map((e) => (
              <PhotoTile key={e.id} ev={e} size="sm" />
            ))}
            {isLandlord && open && !locked && (
              <>
                <button onClick={() => invoiceInput.current?.click()} className="grid size-16 place-items-center rounded-xl border-2 border-dashed border-ink-200 text-ink-400 hover:border-ink-400 hover:text-ink-800" title="Attach invoice">
                  {attach.isPending ? <span className="size-4 animate-spin rounded-full border-2 border-ink-200 border-t-ink-700" /> : <FilePlus2 className="size-5" />}
                </button>
                <input ref={invoiceInput} type="file" hidden multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) attach.mutate(f); e.target.value = ''; }} />
              </>
            )}
          </div>
          {d.evidence.length === 0 && !isLandlord && <p className="text-xs text-ink-400">No invoice attached.</p>}
        </div>
      )}

      {d.tenantComment && (
        <div className="mt-4 flex gap-2 rounded-xl bg-warn-50 p-3 text-sm">
          <MessageSquareWarning className="mt-0.5 size-4 shrink-0 text-warn-700" />
          <div>
            <p className="font-semibold text-warn-700">Tenant’s response</p>
            <p className="text-ink-700">{d.tenantComment}</p>
          </div>
        </div>
      )}

      {err && <p className="mt-3 text-sm text-red-600">{err.message}</p>}

      {!locked && (
        <div className="mt-4 border-t border-ink-50 pt-4">
          {/* Tenant actions */}
          {!isLandlord && d.status === 'PROPOSED' && mode === 'none' && (
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setMode('dispute')}><MessageSquareWarning className="size-3.5" /> Dispute</Button>
              <Button variant="success" size="sm" disabled={respond.isPending} onClick={() => respond.mutate({ decision: 'ACCEPTED' })}><ThumbsUp className="size-3.5" /> Accept</Button>
            </div>
          )}
          {mode === 'dispute' && (
            <div className="space-y-2">
              <TextArea rows={2} autoFocus placeholder="Why? e.g. “This was already damaged at move-in, see the photo”" value={comment} onChange={(e) => setComment(e.target.value)} />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setMode('none')}>Cancel</Button>
                <Button size="sm" disabled={comment.trim().length < 3 || respond.isPending} onClick={() => respond.mutate({ decision: 'DISPUTED', comment })}>Send dispute</Button>
              </div>
            </div>
          )}

          {/* Landlord actions */}
          {isLandlord && open && mode === 'none' && (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" disabled={revise.isPending} onClick={() => revise.mutate({ withdraw: true })}><Undo2 className="size-3.5" /> Withdraw</Button>
              <Button variant="secondary" size="sm" onClick={() => setMode('revise')}><Pencil className="size-3.5" /> Revise</Button>
            </div>
          )}
          {mode === 'revise' && (
            <div className="space-y-3">
              <Field label="Amount (₹)" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
              <TextArea label="Reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setMode('none')}>Cancel</Button>
                <Button size="sm" disabled={revise.isPending || Number(amount) <= 0} onClick={() => revise.mutate({ amount: Number(amount), reason })}>Send revised deduction</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------

function AddDeduction({ settlement, leaseId, onDone }: { settlement: Settlement; leaseId: number; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ itemId: '', reason: '', amount: '' });
  const remaining = settlement.depositAmount - settlement.deductions.filter((d) => d.status !== 'WITHDRAWN').reduce((a, d) => a + d.amount, 0);

  // Items from the move-out inspection, changed ones first.
  const moveOutId = useQuery({
    queryKey: ['lease', leaseId],
    queryFn: () => api<{ lease: LeaseDetail }>(`/leases/${leaseId}`).then((r) => r.lease),
    select: (l) => l.inspections.find((i) => i.type === 'MOVE_OUT')?.id,
  }).data;
  const items = useQuery({
    queryKey: ['inspection', moveOutId],
    enabled: Boolean(moveOutId) && open,
    queryFn: () => api<{ inspection: Inspection }>(`/inspections/${moveOutId}`).then((r) => r.inspection),
  }).data;

  const add = useMutation({
    mutationFn: () => api(`/settlements/${settlement.id}/deductions`, { method: 'POST', body: { itemId: form.itemId ? Number(form.itemId) : null, reason: form.reason, amount: Number(form.amount) } }),
    onSuccess: () => {
      setOpen(false);
      setForm({ itemId: '', reason: '', amount: '' });
      onDone();
    },
  });

  const rooms = new Map(items?.rooms.map((r) => [r.id, r.name]));
  const sorted = [...(items?.items ?? [])].sort((a, b) => Number(b.condition !== b.baselineItem?.condition) - Number(a.condition !== a.baselineItem?.condition));

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Propose deduction
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Propose a deduction">
        <div className="space-y-4">
          <div className="flex gap-2 rounded-xl bg-ink-50 p-3 text-xs text-ink-600">
            <Info className="mt-0.5 size-4 shrink-0" />
            Link the deduction to the inspection item it’s about, so the tenant sees the move-in and move-out evidence side by side. Up to {inr(remaining)} remains.
          </div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-800">Inspection item</span>
            <select value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })} className="block w-full rounded-xl border-0 px-3.5 py-2.5 text-sm ring-1 ring-ink-200 focus:ring-2 focus:ring-ink-700">
              <option value="">Not linked to a specific item</option>
              {sorted.map((it) => (
                <option key={it.id} value={it.id}>
                  {rooms.get(it.roomId)} / {it.name}: {conditionLabel(it.baselineItem?.condition ?? null)} → {conditionLabel(it.condition)}
                  {it.condition !== it.baselineItem?.condition ? '  (changed)' : ''}
                </option>
              ))}
            </select>
          </label>
          <TextArea label="Reason" rows={3} placeholder="Repainting the bedroom wall: stain about 40 cm wide, not present at move-in" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          <Field label="Amount (₹)" type="number" min={1} max={remaining} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          {add.error && <Alert>{(add.error as Error).message}</Alert>}
          <Button className="w-full" disabled={form.reason.trim().length < 5 || Number(form.amount) <= 0 || add.isPending} onClick={() => add.mutate()}>
            {add.isPending ? 'Sending…' : 'Send to tenant'}
          </Button>
          <p className="text-center text-xs text-ink-400">You can attach repair invoices after creating it.</p>
        </div>
      </Modal>
    </>
  );
}
