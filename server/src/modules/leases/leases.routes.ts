import { Router } from 'express';
import { z } from 'zod';
import type { Inspection, Lease, Settlement } from '@prisma/client';
import { prisma } from '../../db.js';
import { config } from '../../config.js';
import { requireLease } from '../../lib/access.js';
import { appendAudit } from '../../lib/audit.js';
import { ApiError } from '../../lib/errors.js';
import { newOpaqueToken } from '../../lib/tokens.js';
import { requireAuth, userId } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

export const leasesRouter = Router();
leasesRouter.use(requireAuth);

const idParams = z.object({ id: z.coerce.number().int().positive() });
const INVITE_DAYS = 7;

const party = { select: { id: true, name: true, email: true } } as const;

/** Where the tenancy is in the overall workflow; drives the UI stepper. */
export function stageOf(lease: Lease, inspections: Pick<Inspection, 'type' | 'status'>[], settlement: Pick<Settlement, 'status'> | null) {
  const moveIn = inspections.find((i) => i.type === 'MOVE_IN');
  const moveOut = inspections.find((i) => i.type === 'MOVE_OUT');
  if (!lease.landlordId || !lease.tenantId) return 'WAITING_FOR_PARTY';
  if (!moveIn || moveIn.status !== 'FINALIZED') return 'MOVE_IN';
  if (!moveOut) return 'LIVING';
  if (moveOut.status !== 'FINALIZED') return 'MOVE_OUT';
  if (!settlement || settlement.status !== 'AGREED') return 'SETTLEMENT';
  return 'SETTLED';
}

// ---------- List & create ----------

leasesRouter.get('/', async (req, res) => {
  const me = userId(req);
  const leases = await prisma.lease.findMany({
    where: { OR: [{ landlordId: me }, { tenantId: me }] },
    include: {
      property: true,
      landlord: party,
      tenant: party,
      inspections: { select: { id: true, type: true, status: true } },
      settlement: { select: { status: true, finalRefund: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({
    leases: leases.map((l) => ({
      ...l,
      myRole: l.landlordId === me ? 'LANDLORD' : 'TENANT',
      stage: stageOf(l, l.inspections, l.settlement),
    })),
  });
});

const createBody = z.object({
  myRole: z.enum(['LANDLORD', 'TENANT']),
  property: z.object({
    addressLine: z.string().trim().min(5).max(200),
    city: z.string().trim().min(2).max(60),
    propertyType: z.enum(['APARTMENT', 'INDEPENDENT_HOUSE', 'ROOM', 'PG']),
    rooms: z.array(z.string().trim().min(2).max(40)).min(1).max(15),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  }),
  startDate: z.string().date(),
  endDate: z.string().date().optional(),
  monthlyRent: z.number().int().positive().max(10_000_000),
  securityDeposit: z.number().int().min(0).max(100_000_000),
});

leasesRouter.post('/', validate({ body: createBody }), async (req, res) => {
  const body = res.locals.body as z.infer<typeof createBody>;
  const me = userId(req);

  const lease = await prisma.$transaction(async (tx) => {
    const property = await tx.property.create({
      data: {
        addressLine: body.property.addressLine,
        city: body.property.city,
        propertyType: body.property.propertyType,
        latitude: body.property.latitude ?? null,
        longitude: body.property.longitude ?? null,
        rooms: { create: body.property.rooms.map((name, i) => ({ name, sortOrder: i })) },
      },
    });
    const lease = await tx.lease.create({
      data: {
        propertyId: property.id,
        landlordId: body.myRole === 'LANDLORD' ? me : null,
        tenantId: body.myRole === 'TENANT' ? me : null,
        startDate: new Date(body.startDate),
        endDate: body.endDate ? new Date(body.endDate) : null,
        monthlyRent: body.monthlyRent,
        securityDeposit: body.securityDeposit,
      },
    });
    await appendAudit(tx, {
      leaseId: lease.id,
      actorId: me,
      action: 'lease.created',
      entityType: 'Lease',
      entityId: lease.id,
      data: { role: body.myRole, securityDeposit: body.securityDeposit, monthlyRent: body.monthlyRent },
    });
    return lease;
  });
  res.status(201).location(`/api/v1/leases/${lease.id}`).json({ lease });
});

// ---------- Detail ----------

leasesRouter.get('/:id', validate({ params: idParams }), async (req, res) => {
  const { id } = res.locals.params as z.infer<typeof idParams>;
  const { role } = await requireLease(id, userId(req));
  const lease = await prisma.lease.findUniqueOrThrow({
    where: { id },
    include: {
      property: { include: { rooms: { orderBy: { sortOrder: 'asc' } } } },
      landlord: party,
      tenant: party,
      inspections: {
        include: { _count: { select: { items: true } }, items: { select: { reviewStatus: true, condition: true } } },
      },
      settlement: { include: { deductions: { select: { amount: true, status: true } } } },
      invitations: { where: { acceptedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, role: true, expiresAt: true } },
    },
  });

  const inspections = lease.inspections.map(({ items, ...i }) => ({
    ...i,
    itemCount: items.length,
    documented: items.filter((x) => x.condition !== null).length,
    approved: items.filter((x) => x.reviewStatus === 'APPROVED' || x.reviewStatus === 'NOTED').length,
    disputed: items.filter((x) => x.reviewStatus === 'DISPUTED').length,
    noted: items.filter((x) => x.reviewStatus === 'NOTED').length,
  }));

  res.json({
    lease: {
      ...lease,
      inspections,
      myRole: role,
      stage: stageOf(lease, lease.inspections, lease.settlement),
    },
  });
});

// ---------- Map pin ----------

const locationBody = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

/**
 * Pin (or move) the property on the map. Once an inspection is agreed the
 * pin is part of the evidence, so it can't move any more.
 */
leasesRouter.patch('/:id/location', validate({ params: idParams, body: locationBody }), async (req, res) => {
  const { id } = res.locals.params as z.infer<typeof idParams>;
  const { latitude, longitude } = res.locals.body as z.infer<typeof locationBody>;
  const me = userId(req);
  const { lease } = await requireLease(id, me);
  const locked = await prisma.inspection.count({ where: { leaseId: id, status: 'FINALIZED' } });
  if (locked) throw ApiError.conflict('LOCKED', 'The location is locked once an inspection has been agreed');

  const property = await prisma.$transaction(async (tx) => {
    const p = await tx.property.update({ where: { id: lease.propertyId }, data: { latitude, longitude } });
    await appendAudit(tx, {
      leaseId: id,
      actorId: me,
      action: 'property.pinned',
      entityType: 'Property',
      entityId: p.id,
      data: { latitude: Number(latitude.toFixed(6)), longitude: Number(longitude.toFixed(6)) },
    });
    return p;
  });
  res.json({ property });
});

// ---------- Invitations ----------

leasesRouter.post('/:id/invitations', validate({ params: idParams }), async (req, res) => {
  const { id } = res.locals.params as z.infer<typeof idParams>;
  const me = userId(req);
  const { role, otherPartyId } = await requireLease(id, me);
  if (otherPartyId) throw ApiError.conflict('ALREADY_JOINED', 'The other party has already joined this tenancy');

  const inviteRole = role === 'LANDLORD' ? 'TENANT' : 'LANDLORD';
  const { token, hash } = newOpaqueToken();
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);

  await prisma.$transaction(async (tx) => {
    const inv = await tx.invitation.create({
      data: { leaseId: id, role: inviteRole, tokenHash: hash, createdById: me, expiresAt },
    });
    await appendAudit(tx, {
      leaseId: id,
      actorId: me,
      action: 'invitation.created',
      entityType: 'Invitation',
      entityId: inv.id,
      data: { role: inviteRole, expiresAt: expiresAt.toISOString() },
    });
  });
  // The raw token is only ever shown here, once. The DB stores its hash.
  res.status(201).json({ url: `${config.APP_URL}/invite/${token}`, role: inviteRole, expiresAt });
});
