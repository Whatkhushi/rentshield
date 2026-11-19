import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { Prisma, type Deduction, type Settlement } from '@prisma/client';
import { prisma } from '../../db.js';
import { accessFor, requireLease } from '../../lib/access.js';
import { appendAudit } from '../../lib/audit.js';
import { ApiError } from '../../lib/errors.js';
import { requireAuth, userId } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { INVOICE_TYPES, publicEvidence, recordEvidence, uploadErrors, uploader } from '../evidence/evidence.routes.js';

export const settlementsRouter = Router();
settlementsRouter.use(requireAuth);

type Tx = Prisma.TransactionClient;
const idParams = z.object({ id: z.coerce.number().int().positive() });

/** Money summary. A deduction only reduces the refund once the tenant accepts it. */
export function totals(s: Pick<Settlement, 'depositAmount'>, deductions: Pick<Deduction, 'amount' | 'status'>[]) {
  const sum = (st: string[]) => deductions.filter((d) => st.includes(d.status)).reduce((a, d) => a + d.amount, 0);
  const accepted = sum(['ACCEPTED']);
  const open = sum(['PROPOSED', 'DISPUTED']);
  return {
    deposit: s.depositAmount,
    accepted,
    open,
    proposedTotal: accepted + open,
    refundIfAllAccepted: s.depositAmount - accepted - open,
    refundSoFar: s.depositAmount - accepted,
    unresolvedCount: deductions.filter((d) => d.status === 'PROPOSED' || d.status === 'DISPUTED').length,
  };
}

async function loadSettlement(where: Prisma.SettlementWhereUniqueInput) {
  return prisma.settlement.findUnique({
    where,
    include: {
      deductions: {
        orderBy: { id: 'asc' },
        include: {
          evidence: { orderBy: { id: 'asc' } },
          item: {
            select: {
              id: true,
              name: true,
              condition: true,
              room: { select: { name: true } },
              evidence: { select: { id: true, sha256: true, mimeType: true }, orderBy: { id: 'asc' } },
              baselineItem: {
                select: { id: true, condition: true, evidence: { select: { id: true, sha256: true, mimeType: true }, orderBy: { id: 'asc' } } },
              },
            },
          },
        },
      },
    },
  });
}

function present(s: NonNullable<Awaited<ReturnType<typeof loadSettlement>>>) {
  return {
    ...s,
    deductions: s.deductions.map((d) => ({ ...d, evidence: d.evidence.map(publicEvidence) })),
    totals: totals(s, s.deductions),
  };
}

/** Settlement + lease + caller's role, with lease membership enforced. */
async function requireSettlement(id: number, me: number) {
  const s = await prisma.settlement.findUnique({ where: { id }, include: { lease: true } });
  if (!s) throw ApiError.notFound('Settlement');
  return { settlement: s, ...accessFor(s.lease, me) };
}

async function requireDeduction(id: number, me: number) {
  const d = await prisma.deduction.findUnique({ where: { id }, include: { settlement: { include: { lease: true } } } });
  if (!d) throw ApiError.notFound('Deduction');
  return { deduction: d, settlement: d.settlement, ...accessFor(d.settlement.lease, me) };
}

/** Lock the settlement row, check it's still open, and clear confirmations (any change needs re-confirming). */
async function lockOpen(tx: Tx, settlementId: number) {
  await tx.$queryRaw`SELECT id FROM "Settlement" WHERE id = ${settlementId} FOR UPDATE`;
  const s = await tx.settlement.findUniqueOrThrow({ where: { id: settlementId }, include: { deductions: true } });
  if (s.status !== 'OPEN') throw ApiError.conflict('SETTLED', 'This settlement has already been agreed');
  return s;
}

async function resetConfirmations(tx: Tx, settlementId: number) {
  await tx.settlement.update({ where: { id: settlementId }, data: { landlordConfirmedAt: null, tenantConfirmedAt: null } });
}

/** Total of everything still claimed must never exceed the deposit. Checked inside the lock. */
function assertWithinDeposit(deposit: number, deductions: Pick<Deduction, 'id' | 'amount' | 'status'>[], change: { id?: number; amount: number }) {
  const others = deductions.filter((d) => d.status !== 'WITHDRAWN' && d.id !== change.id).reduce((a, d) => a + d.amount, 0);
  if (others + change.amount > deposit) {
    throw ApiError.conflict('EXCEEDS_DEPOSIT', `Deductions would total ₹${others + change.amount}, more than the ₹${deposit} deposit`);
  }
}

// ---------- Open / read ----------

settlementsRouter.get('/leases/:id/settlement', validate({ params: idParams }), async (req, res) => {
  const { id } = res.locals.params as z.infer<typeof idParams>;
  const { role } = await requireLease(id, userId(req));
  const s = await loadSettlement({ leaseId: id });
  res.json({ settlement: s ? present(s) : null, myRole: role });
});

settlementsRouter.post('/leases/:id/settlement', validate({ params: idParams }), async (req, res) => {
  const { id } = res.locals.params as z.infer<typeof idParams>;
  const me = userId(req);
  const { role, lease } = await requireLease(id, me);
  if (role !== 'LANDLORD') throw ApiError.forbidden('The landlord opens the deposit settlement');

  const moveOut = await prisma.inspection.findUnique({ where: { leaseId_type: { leaseId: id, type: 'MOVE_OUT' } } });
  if (moveOut?.status !== 'FINALIZED') {
    throw ApiError.conflict('MOVE_OUT_NOT_FINAL', 'Both parties must agree the move-out inspection before settling the deposit');
  }
  try {
    const s = await prisma.$transaction(async (tx) => {
      const created = await tx.settlement.create({ data: { leaseId: id, depositAmount: lease.securityDeposit } });
      await appendAudit(tx, {
        leaseId: id,
        actorId: me,
        action: 'settlement.opened',
        entityType: 'Settlement',
        entityId: created.id,
        data: { deposit: lease.securityDeposit },
      });
      return created;
    });
    res.status(201).json({ settlement: present((await loadSettlement({ id: s.id }))!) });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw ApiError.conflict('SETTLEMENT_EXISTS', 'A settlement is already open for this tenancy');
    }
    throw err;
  }
});

// ---------- Landlord: propose / revise / withdraw ----------

const deductionBody = z.object({
  itemId: z.number().int().positive().nullable().optional(),
  reason: z.string().trim().min(5, 'Explain the deduction').max(500),
  amount: z.number().int().positive().max(100_000_000),
});

settlementsRouter.post('/settlements/:id/deductions', validate({ params: idParams, body: deductionBody }), async (req, res) => {
  const { id } = res.locals.params as z.infer<typeof idParams>;
  const body = res.locals.body as z.infer<typeof deductionBody>;
  const me = userId(req);
  const { role, lease } = await requireSettlement(id, me);
  if (role !== 'LANDLORD') throw ApiError.forbidden('Only the landlord proposes deductions');

  if (body.itemId) {
    // The linked item must be from THIS tenancy's move-out inspection.
    const ok = await prisma.inspectionItem.count({
      where: { id: body.itemId, inspection: { leaseId: lease.id, type: 'MOVE_OUT' } },
    });
    if (!ok) throw ApiError.badRequest('That item is not part of this tenancy’s move-out inspection');
  }

  const d = await prisma.$transaction(async (tx) => {
    const s = await lockOpen(tx, id);
    assertWithinDeposit(s.depositAmount, s.deductions, { amount: body.amount });
    const created = await tx.deduction.create({
      data: { settlementId: id, itemId: body.itemId ?? null, reason: body.reason, amount: body.amount },
    });
    await resetConfirmations(tx, id);
    await appendAudit(tx, {
      leaseId: lease.id,
      actorId: me,
      action: 'deduction.proposed',
      entityType: 'Deduction',
      entityId: created.id,
      data: { amount: body.amount, reason: body.reason, itemId: body.itemId ?? null },
    });
    return created;
  });
  res.status(201).json({ deduction: d });
});

settlementsRouter.post(
  '/deductions/:id/evidence',
  validate({ params: idParams }),
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = res.locals.params as z.infer<typeof idParams>;
    const { role, deduction, lease } = await requireDeduction(id, userId(req));
    if (role !== 'LANDLORD') throw ApiError.forbidden('Only the landlord attaches invoices');
    if (deduction.status !== 'PROPOSED' && deduction.status !== 'DISPUTED') throw ApiError.conflict('LOCKED', 'This deduction is closed');
    res.locals.access = { leaseId: lease.id };
    next();
  },
  uploader(INVOICE_TYPES),
  uploadErrors,
  async (req: Request, res: Response) => {
    const { id } = res.locals.params as z.infer<typeof idParams>;
    const rows = await recordEvidence({
      files: req.files as never,
      kind: 'INVOICE',
      leaseId: res.locals.access.leaseId,
      actorId: userId(req),
      deductionId: id,
    });
    res.status(201).json({ evidence: rows.map(publicEvidence) });
  },
);

const reviseBody = z.object({
  version: z.number().int().positive(),
  amount: z.number().int().positive().max(100_000_000).optional(),
  reason: z.string().trim().min(5).max(500).optional(),
  withdraw: z.boolean().optional(),
});

settlementsRouter.patch('/deductions/:id', validate({ params: idParams, body: reviseBody }), async (req, res) => {
  const { id } = res.locals.params as z.infer<typeof idParams>;
  const { version, withdraw, ...changes } = res.locals.body as z.infer<typeof reviseBody>;
  const me = userId(req);
  const { role, deduction, settlement, lease } = await requireDeduction(id, me);
  if (role !== 'LANDLORD') throw ApiError.forbidden('Only the landlord can change a deduction');
  if (deduction.status !== 'PROPOSED' && deduction.status !== 'DISPUTED') {
    throw ApiError.conflict('LOCKED', `A ${deduction.status.toLowerCase()} deduction can’t be changed`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const s = await lockOpen(tx, settlement.id);
    if (!withdraw) assertWithinDeposit(s.depositAmount, s.deductions, { id, amount: changes.amount ?? deduction.amount });
    const r = await tx.deduction.updateMany({
      where: { id, version },
      data: withdraw
        ? { status: 'WITHDRAWN', version: { increment: 1 } }
        : { ...changes, status: 'PROPOSED', version: { increment: 1 } },
    });
    if (r.count === 0) throw ApiError.conflict('STALE_VERSION', 'This deduction changed. Reload and try again.');
    await resetConfirmations(tx, settlement.id);
    await appendAudit(tx, {
      leaseId: lease.id,
      actorId: me,
      action: withdraw ? 'deduction.withdrawn' : 'deduction.revised',
      entityType: 'Deduction',
      entityId: id,
      data: withdraw ? { amount: deduction.amount } : { from: deduction.amount, to: changes.amount ?? deduction.amount, reason: changes.reason ?? null },
    });
    return tx.deduction.findUniqueOrThrow({ where: { id } });
  });
  res.json({ deduction: updated });
});

// ---------- Tenant: accept / dispute ----------

const respondBody = z
  .object({
    version: z.number().int().positive(),
    decision: z.enum(['ACCEPTED', 'DISPUTED']),
    comment: z.string().trim().max(1000).optional(),
  })
  .refine((b) => b.decision === 'ACCEPTED' || (b.comment && b.comment.length >= 3), {
    message: 'Say why you dispute this',
    path: ['comment'],
  });

settlementsRouter.post('/deductions/:id/respond', validate({ params: idParams, body: respondBody }), async (req, res) => {
  const { id } = res.locals.params as z.infer<typeof idParams>;
  const { version, decision, comment } = res.locals.body as z.infer<typeof respondBody>;
  const me = userId(req);
  const { role, deduction, settlement, lease } = await requireDeduction(id, me);
  if (role !== 'TENANT') throw ApiError.forbidden('Only the tenant responds to deductions');
  if (deduction.status !== 'PROPOSED') throw ApiError.conflict('NOT_PENDING', 'This deduction is not waiting for your response');

  const updated = await prisma.$transaction(async (tx) => {
    await lockOpen(tx, settlement.id);
    const r = await tx.deduction.updateMany({
      where: { id, version, status: 'PROPOSED' },
      data: { status: decision, tenantComment: comment ?? null, version: { increment: 1 } },
    });
    if (r.count === 0) throw ApiError.conflict('STALE_VERSION', 'The landlord changed this deduction. Reload to see the new version.');
    await resetConfirmations(tx, settlement.id);
    await appendAudit(tx, {
      leaseId: lease.id,
      actorId: me,
      action: decision === 'ACCEPTED' ? 'deduction.accepted' : 'deduction.disputed',
      entityType: 'Deduction',
      entityId: id,
      data: { amount: deduction.amount, comment: comment ?? null },
    });
    return tx.deduction.findUniqueOrThrow({ where: { id } });
  });
  res.json({ deduction: updated });
});

// ---------- Both: confirm final settlement ----------

settlementsRouter.post('/settlements/:id/confirm', validate({ params: idParams }), async (req, res) => {
  const { id } = res.locals.params as z.infer<typeof idParams>;
  const me = userId(req);
  const { role, lease } = await requireSettlement(id, me);

  const result = await prisma.$transaction(async (tx) => {
    const s = await lockOpen(tx, id);
    const t = totals(s, s.deductions);
    if (t.unresolvedCount > 0) {
      throw ApiError.conflict('UNRESOLVED', `${t.unresolvedCount} deduction(s) still need to be accepted, revised or withdrawn`);
    }
    const now = new Date();
    const landlordAt = role === 'LANDLORD' ? now : s.landlordConfirmedAt;
    const tenantAt = role === 'TENANT' ? now : s.tenantConfirmedAt;
    const agreed = Boolean(landlordAt && tenantAt);

    await tx.settlement.update({
      where: { id },
      data: {
        landlordConfirmedAt: landlordAt,
        tenantConfirmedAt: tenantAt,
        ...(agreed ? { status: 'AGREED', agreedAt: now, finalRefund: t.refundSoFar } : {}),
      },
    });
    await appendAudit(tx, {
      leaseId: lease.id,
      actorId: me,
      action: agreed ? 'settlement.agreed' : 'settlement.confirmed',
      entityType: 'Settlement',
      entityId: id,
      data: { role, deposit: t.deposit, deducted: t.accepted, refund: t.refundSoFar },
    });
    if (agreed) await tx.lease.update({ where: { id: lease.id }, data: { status: 'SETTLED' } });
    return { agreed };
  });
  res.json({ ...result, settlement: present((await loadSettlement({ id }))!) });
});
