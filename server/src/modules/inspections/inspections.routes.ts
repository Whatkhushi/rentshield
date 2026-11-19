import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { requireInspection, requireItem, requireLease } from '../../lib/access.js';
import { appendAudit } from '../../lib/audit.js';
import { checklistFor } from '../../lib/checklists.js';
import { ApiError } from '../../lib/errors.js';
import { sha256 } from '../../lib/tokens.js';
import { requireAuth, userId } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

export const inspectionsRouter = Router();
inspectionsRouter.use(requireAuth);

const idParams = z.object({ id: z.coerce.number().int().positive() });

const evidenceSelect = {
  select: { id: true, kind: true, originalName: true, mimeType: true, sizeBytes: true, sha256: true, uploadedAt: true, uploadedById: true },
  orderBy: { id: 'asc' as const },
};

// ---------- Start an inspection ----------

const startBody = z.object({ type: z.enum(['MOVE_IN', 'MOVE_OUT']) });

inspectionsRouter.post('/leases/:id/inspections', validate({ params: idParams, body: startBody }), async (req, res) => {
  const { id: leaseId } = res.locals.params as z.infer<typeof idParams>;
  const { type } = res.locals.body as z.infer<typeof startBody>;
  const me = userId(req);
  await requireLease(leaseId, me);

  const rooms = await prisma.room.findMany({
    where: { property: { leases: { some: { id: leaseId } } } },
    orderBy: { sortOrder: 'asc' },
  });

  try {
    const inspection = await prisma.$transaction(async (tx) => {
      let items: Prisma.InspectionItemCreateManyInspectionInput[];

      if (type === 'MOVE_IN') {
        items = rooms.flatMap((room) => checklistFor(room.name).map((name, i) => ({ roomId: room.id, name, sortOrder: i })));
      } else {
        // Move-out reuses the agreed move-in items so they can be compared 1:1.
        const moveIn = await tx.inspection.findUnique({
          where: { leaseId_type: { leaseId, type: 'MOVE_IN' } },
          include: { items: true },
        });
        if (!moveIn || moveIn.status !== 'FINALIZED') {
          throw ApiError.conflict('MOVE_IN_NOT_FINAL', 'The move-in inspection must be agreed by both parties first');
        }
        items = moveIn.items.map((it) => ({ roomId: it.roomId, name: it.name, sortOrder: it.sortOrder, baselineItemId: it.id }));
        await tx.lease.update({ where: { id: leaseId }, data: { status: 'MOVED_OUT' } });
      }

      const created = await tx.inspection.create({
        data: { leaseId, type, authorId: me, items: { createMany: { data: items } } },
      });
      await appendAudit(tx, {
        leaseId,
        actorId: me,
        action: 'inspection.started',
        entityType: 'Inspection',
        entityId: created.id,
        data: { type, items: items.length },
      });
      return created;
    });
    res.status(201).json({ inspection });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw ApiError.conflict('INSPECTION_EXISTS', `A ${type === 'MOVE_IN' ? 'move-in' : 'move-out'} inspection already exists`);
    }
    throw err;
  }
});

// ---------- Read ----------

async function loadInspection(id: number) {
  return prisma.inspection.findUniqueOrThrow({
    where: { id },
    include: {
      items: {
        orderBy: [{ roomId: 'asc' }, { sortOrder: 'asc' }],
        include: {
          evidence: evidenceSelect,
          baselineItem: { include: { evidence: evidenceSelect } },
        },
      },
      lease: { include: { property: { include: { rooms: { orderBy: { sortOrder: 'asc' } } } } } },
    },
  });
}

inspectionsRouter.get('/inspections/:id', validate({ params: idParams }), async (req, res) => {
  const { id } = res.locals.params as z.infer<typeof idParams>;
  const me = userId(req);
  const { role, otherPartyId } = await requireInspection(id, me);
  const { lease, ...inspection } = await loadInspection(id);
  res.json({
    inspection: {
      ...inspection,
      rooms: lease.property.rooms,
      myRole: role,
      isAuthor: inspection.authorId === me,
      otherPartyJoined: otherPartyId !== null,
    },
  });
});

/** Move-out vs move-in, item by item. */
inspectionsRouter.get('/inspections/:id/comparison', validate({ params: idParams }), async (req, res) => {
  const { id } = res.locals.params as z.infer<typeof idParams>;
  const { inspection } = await requireInspection(id, userId(req));
  if (inspection.type !== 'MOVE_OUT') throw ApiError.badRequest('Comparison is only available for the move-out inspection');
  const full = await loadInspection(id);
  const rooms = new Map(full.lease.property.rooms.map((r) => [r.id, r.name]));
  res.json({
    pairs: full.items.map((it) => ({
      room: rooms.get(it.roomId),
      name: it.name,
      changed: it.baselineItem ? it.condition !== it.baselineItem.condition : false,
      moveIn: it.baselineItem && {
        itemId: it.baselineItem.id,
        condition: it.baselineItem.condition,
        notes: it.baselineItem.notes,
        evidence: it.baselineItem.evidence,
      },
      moveOut: { itemId: it.id, condition: it.condition, notes: it.notes, evidence: it.evidence, reviewStatus: it.reviewStatus },
    })),
  });
});

// ---------- Author edits ----------

const meterBody = z.object({
  electricityReading: z.string().trim().max(40).nullable().optional(),
  waterReading: z.string().trim().max(40).nullable().optional(),
  gasReading: z.string().trim().max(40).nullable().optional(),
  generalNotes: z.string().trim().max(2000).nullable().optional(),
});

inspectionsRouter.patch('/inspections/:id', validate({ params: idParams, body: meterBody }), async (req, res) => {
  const { id } = res.locals.params as z.infer<typeof idParams>;
  const me = userId(req);
  const { inspection } = await requireInspection(id, me);
  if (inspection.authorId !== me) throw ApiError.forbidden('Only the person documenting this inspection can edit it');
  if (inspection.status !== 'DRAFT') throw ApiError.conflict('LOCKED', 'Meter readings are locked after submission');
  const updated = await prisma.inspection.update({ where: { id }, data: res.locals.body as z.infer<typeof meterBody> });
  res.json({ inspection: updated });
});

const itemBody = z.object({
  version: z.number().int().positive(),
  condition: z.enum(['GOOD', 'FAIR', 'DAMAGED', 'MISSING', 'NOT_APPLICABLE']).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

/** Editable while drafting, or after submission if the reviewer disputed it. */
export function itemEditable(inspection: { status: string }, item: { reviewStatus: string }) {
  return inspection.status === 'DRAFT' || (inspection.status === 'SUBMITTED' && item.reviewStatus === 'DISPUTED');
}

inspectionsRouter.patch('/items/:id', validate({ params: idParams, body: itemBody }), async (req, res) => {
  const { id } = res.locals.params as z.infer<typeof idParams>;
  const { version, ...changes } = res.locals.body as z.infer<typeof itemBody>;
  const me = userId(req);
  const { item, inspection } = await requireItem(id, me);

  if (inspection.authorId !== me) throw ApiError.forbidden('Only the person documenting this inspection can edit items');
  if (!itemEditable(inspection, item)) throw ApiError.conflict('LOCKED', 'This item is locked');
  const isRevision = inspection.status === 'SUBMITTED';

  const updated = await prisma.$transaction(async (tx) => {
    // Optimistic lock: only update if nobody changed it since we read it.
    const result = await tx.inspectionItem.updateMany({
      where: { id, version },
      data: { ...changes, version: { increment: 1 }, ...(isRevision ? { reviewStatus: 'PENDING' } : {}) },
    });
    if (result.count === 0) {
      throw ApiError.conflict('STALE_VERSION', 'This item was changed by someone else. Reload to see the latest version.');
    }
    if (isRevision) {
      await appendAudit(tx, {
        leaseId: inspection.leaseId,
        actorId: me,
        action: 'item.revised',
        entityType: 'InspectionItem',
        entityId: id,
        data: { condition: changes.condition ?? item.condition, notes: changes.notes ?? item.notes, version: version + 1 },
      });
    }
    return tx.inspectionItem.findUniqueOrThrow({ where: { id }, include: { evidence: evidenceSelect } });
  });
  res.json({ item: updated });
});

/** Fingerprint of the whole inspection at submit time: every item + every photo hash. */
async function snapshotDigest(inspectionId: number) {
  const items = await prisma.inspectionItem.findMany({
    where: { inspectionId },
    orderBy: { id: 'asc' },
    select: { id: true, condition: true, notes: true, evidence: { select: { sha256: true }, orderBy: { id: 'asc' } } },
  });
  return { digest: sha256(JSON.stringify(items)), items: items.length, photos: items.reduce((n, i) => n + i.evidence.length, 0) };
}

inspectionsRouter.post('/inspections/:id/submit', validate({ params: idParams }), async (req, res) => {
  const { id } = res.locals.params as z.infer<typeof idParams>;
  const me = userId(req);
  const { inspection, otherPartyId } = await requireInspection(id, me);

  if (inspection.authorId !== me) throw ApiError.forbidden('Only the person documenting this inspection can submit it');
  if (inspection.status !== 'DRAFT') throw ApiError.conflict('ALREADY_SUBMITTED', 'This inspection was already submitted');
  if (!otherPartyId) throw ApiError.conflict('NO_REVIEWER', 'Invite the other party first. They need to review this inspection.');
  const missing = await prisma.inspectionItem.count({ where: { inspectionId: id, condition: null } });
  if (missing > 0) throw ApiError.conflict('INCOMPLETE', `${missing} item(s) still need a condition`);

  const snapshot = await snapshotDigest(id);
  await prisma.$transaction(async (tx) => {
    const r = await tx.inspection.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'SUBMITTED', submittedAt: new Date() } });
    if (r.count === 0) throw ApiError.conflict('ALREADY_SUBMITTED', 'This inspection was already submitted');
    await appendAudit(tx, {
      leaseId: inspection.leaseId,
      actorId: me,
      action: 'inspection.submitted',
      entityType: 'Inspection',
      entityId: id,
      data: { type: inspection.type, ...snapshot },
    });
  });
  res.json({ inspection: await prisma.inspection.findUniqueOrThrow({ where: { id } }) });
});

// ---------- Reviewer ----------

const reviewBody = z
  .object({
    version: z.number().int().positive(),
    decision: z.enum(['APPROVED', 'DISPUTED']),
    comment: z.string().trim().max(1000).optional(),
  })
  .refine((b) => b.decision === 'APPROVED' || (b.comment && b.comment.length >= 3), {
    message: 'Say what you disagree with',
    path: ['comment'],
  });

inspectionsRouter.post('/items/:id/review', validate({ params: idParams, body: reviewBody }), async (req, res) => {
  const { id } = res.locals.params as z.infer<typeof idParams>;
  const { version, decision, comment } = res.locals.body as z.infer<typeof reviewBody>;
  const me = userId(req);
  const { item, inspection } = await requireItem(id, me);

  if (inspection.authorId === me) throw ApiError.forbidden('You can’t review your own inspection');
  if (inspection.status !== 'SUBMITTED') throw ApiError.conflict('NOT_IN_REVIEW', 'This inspection is not open for review');
  if (item.reviewStatus !== 'PENDING') throw ApiError.conflict('ALREADY_REVIEWED', 'This item has already been reviewed');

  const result = await prisma.$transaction(async (tx) => {
    // Lock the inspection so two approvals finishing at once can't both
    // miss that they were the last ones (and so leave it unfinalized).
    await tx.$queryRaw`SELECT id FROM "Inspection" WHERE id = ${inspection.id} FOR UPDATE`;

    const r = await tx.inspectionItem.updateMany({
      where: { id, version, reviewStatus: 'PENDING' },
      data: { reviewStatus: decision, reviewComment: comment ?? null, version: { increment: 1 } },
    });
    if (r.count === 0) throw ApiError.conflict('STALE_VERSION', 'This item changed while you were reviewing it. Reload and try again.');

    await appendAudit(tx, {
      leaseId: inspection.leaseId,
      actorId: me,
      action: decision === 'APPROVED' ? 'item.approved' : 'item.disputed',
      entityType: 'InspectionItem',
      entityId: id,
      data: { item: item.name, comment: comment ?? null, version: version + 1 },
    });

    const remaining = await tx.inspectionItem.count({ where: { inspectionId: inspection.id, reviewStatus: { not: 'APPROVED' } } });
    let finalized = false;
    if (remaining === 0) {
      await tx.inspection.update({ where: { id: inspection.id }, data: { status: 'FINALIZED', finalizedAt: new Date() } });
      await appendAudit(tx, {
        leaseId: inspection.leaseId,
        actorId: me,
        action: 'inspection.finalized',
        entityType: 'Inspection',
        entityId: inspection.id,
        data: { type: inspection.type },
      });
      finalized = true;
    }
    return { item: await tx.inspectionItem.findUniqueOrThrow({ where: { id } }), finalized };
  });
  res.json(result);
});

/** Approve every pending item in one go (the common case for a clean flat). */
inspectionsRouter.post('/inspections/:id/approve-all', validate({ params: idParams }), async (req, res) => {
  const { id } = res.locals.params as z.infer<typeof idParams>;
  const me = userId(req);
  const { inspection } = await requireInspection(id, me);
  if (inspection.authorId === me) throw ApiError.forbidden('You can’t review your own inspection');
  if (inspection.status !== 'SUBMITTED') throw ApiError.conflict('NOT_IN_REVIEW', 'This inspection is not open for review');

  const finalized = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Inspection" WHERE id = ${id} FOR UPDATE`;
    const r = await tx.inspectionItem.updateMany({
      where: { inspectionId: id, reviewStatus: 'PENDING' },
      data: { reviewStatus: 'APPROVED', version: { increment: 1 } },
    });
    await appendAudit(tx, {
      leaseId: inspection.leaseId,
      actorId: me,
      action: 'items.approved_all',
      entityType: 'Inspection',
      entityId: id,
      data: { count: r.count },
    });
    const remaining = await tx.inspectionItem.count({ where: { inspectionId: id, reviewStatus: { not: 'APPROVED' } } });
    if (remaining > 0) return false;
    await tx.inspection.update({ where: { id }, data: { status: 'FINALIZED', finalizedAt: new Date() } });
    await appendAudit(tx, {
      leaseId: inspection.leaseId,
      actorId: me,
      action: 'inspection.finalized',
      entityType: 'Inspection',
      entityId: id,
      data: { type: inspection.type },
    });
    return true;
  });
  res.json({ finalized });
});
