import type { Condition, Stage } from './types';

export const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export const dateShort = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const dateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';

export const shortHash = (h: string) => `${h.slice(0, 8)}…${h.slice(-6)}`;

export const distance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);

export const bytes =(n: number) => (n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

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

type Translate = (s: string, vars?: Record<string, string | number>) => string;

/** Readable sentence for an audit action, in the current interface language. */
export function describeAction(action: string, data: Record<string, unknown> | null, t: Translate): string {
  const d = data ?? {};
  const role = t(d.role === 'LANDLORD' ? 'landlord' : 'tenant');
  const which = t(d.type === 'MOVE_OUT' ? 'move-out' : 'move-in');
  const item = t(String(d.item ?? ''));
  const map: Record<string, [string, Record<string, string | number>?]> = {
    'lease.created': ['created the tenancy as {role}', { role }],
    'invitation.created': ['created an invite link for the {role}', { role }],
    'invitation.accepted': ['joined as {role}', { role }],
    'inspection.started': ['started the {which} inspection', { which }],
    'inspection.submitted': ['submitted the {which} inspection for review', { which }],
    'inspection.finalized': ['gave the final approval: the {which} inspection is agreed and locked', { which }],
    'item.approved': ['approved “{item}”', { item }],
    'item.disputed': ['sent back “{item}”', { item }],
    'item.revised': ['revised an item that was sent back'],
    'items.approved_all': ['approved {n} item(s)', { n: Number(d.count) }],
    'evidence.uploaded': [d.kind === 'INVOICE' ? 'uploaded an invoice' : 'uploaded a photo'],
    'evidence.removed': ['removed a photo'],
    'settlement.opened': ['opened the deposit settlement'],
    'deduction.proposed': ['proposed a deduction of {amount}', { amount: inr(Number(d.amount)) }],
    'deduction.revised': ['revised a deduction to {amount}', { amount: inr(Number(d.to)) }],
    'deduction.withdrawn': ['withdrew a {amount} deduction', { amount: inr(Number(d.amount)) }],
    'deduction.accepted': ['accepted a {amount} deduction', { amount: inr(Number(d.amount)) }],
    'deduction.disputed': ['disputed a {amount} deduction', { amount: inr(Number(d.amount)) }],
    'settlement.confirmed': ['confirmed the settlement'],
    'settlement.agreed': ['confirmed: settlement agreed, refund {amount}', { amount: inr(Number(d.refund)) }],
    'report.requested': ['generated a PDF report'],
    'property.pinned': ['pinned the property on the map'],
    'item.added': ['added “{item}” to the checklist', { item }],
    'item.removed': ['removed “{item}” from the checklist', { item }],
    'items.marked_good': ['marked {n} remaining item(s) as Good', { n: Number(d.count) }],
    'item.noted': ['recorded a disagreement on “{item}” (both views kept)', { item }],
  };
  const entry = map[action];
  return entry ? t(entry[0], entry[1]) : action;
}
