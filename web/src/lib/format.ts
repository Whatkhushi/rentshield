import type { Condition, Stage } from './types';

export const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export const dateShort = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const dateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';

export const shortHash = (h: string) => `${h.slice(0, 8)}…${h.slice(-6)}`;

export const bytes = (n: number) => (n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export const CONDITIONS: { value: Condition; label: string; tone: string }[] = [
  { value: 'GOOD', label: 'Good', tone: 'ok' },
  { value: 'FAIR', label: 'Fair', tone: 'ink' },
  { value: 'DAMAGED', label: 'Damaged', tone: 'warn' },
  { value: 'MISSING', label: 'Missing', tone: 'bad' },
  { value: 'NOT_APPLICABLE', label: 'N/A', tone: 'muted' },
];

export const conditionLabel = (c: Condition | null) => CONDITIONS.find((x) => x.value === c)?.label ?? 'Not recorded';

export const STAGES: { key: Stage; label: string }[] = [
  { key: 'WAITING_FOR_PARTY', label: 'Invite' },
  { key: 'MOVE_IN', label: 'Move-in' },
  { key: 'LIVING', label: 'Living' },
  { key: 'MOVE_OUT', label: 'Move-out' },
  { key: 'SETTLEMENT', label: 'Settlement' },
  { key: 'SETTLED', label: 'Settled' },
];

export const stageIndex = (s: Stage) => STAGES.findIndex((x) => x.key === s);

export const PROPERTY_TYPES = [
  { value: 'APARTMENT', label: 'Apartment / flat' },
  { value: 'INDEPENDENT_HOUSE', label: 'Independent house' },
  { value: 'ROOM', label: 'Single room' },
  { value: 'PG', label: 'PG / shared' },
] as const;

/** Readable sentence for an audit action. */
export function describeAction(action: string, data: Record<string, unknown> | null): string {
  const d = data ?? {};
  const map: Record<string, string> = {
    'lease.created': `created the tenancy as ${String(d.role ?? '').toLowerCase()}`,
    'invitation.created': `created an invite link for the ${String(d.role ?? '').toLowerCase()}`,
    'invitation.accepted': `joined as ${String(d.role ?? '').toLowerCase()}`,
    'inspection.started': `started the ${d.type === 'MOVE_OUT' ? 'move-out' : 'move-in'} inspection`,
    'inspection.submitted': `submitted the ${d.type === 'MOVE_OUT' ? 'move-out' : 'move-in'} inspection for review`,
    'inspection.finalized': `gave the final approval: the ${d.type === 'MOVE_OUT' ? 'move-out' : 'move-in'} inspection is agreed and locked`,
    'item.approved': `approved “${d.item}”`,
    'item.disputed': `disputed “${d.item}”`,
    'item.revised': 'revised a disputed item',
    'items.approved_all': `approved ${d.count} item(s)`,
    'evidence.uploaded': `uploaded a ${d.kind === 'INVOICE' ? 'invoice' : 'photo'}`,
    'evidence.removed': 'removed a photo',
    'settlement.opened': 'opened the deposit settlement',
    'deduction.proposed': `proposed a deduction of ${inr(Number(d.amount))}`,
    'deduction.revised': `revised a deduction to ${inr(Number(d.to))}`,
    'deduction.withdrawn': `withdrew a ${inr(Number(d.amount))} deduction`,
    'deduction.accepted': `accepted a ${inr(Number(d.amount))} deduction`,
    'deduction.disputed': `disputed a ${inr(Number(d.amount))} deduction`,
    'settlement.confirmed': 'confirmed the settlement',
    'settlement.agreed': `confirmed — settlement agreed, refund ${inr(Number(d.refund))}`,
    'report.requested': 'generated a PDF report',
  };
  return map[action] ?? action;
}
