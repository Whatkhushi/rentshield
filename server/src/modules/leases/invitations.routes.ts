import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { appendAudit } from '../../lib/audit.js';
import { ApiError } from '../../lib/errors.js';
import { sha256 } from '../../lib/tokens.js';
import { requireAuth, userId } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

export const invitationsRouter = Router();

const tokenParams = z.object({ token: z.string().min(20).max(100) });

async function findInvite(token: string) {
  const inv = await prisma.invitation.findUnique({
    where: { tokenHash: sha256(token) },
    include: { lease: { include: { property: true, landlord: true, tenant: true } } },
  });
  if (!inv) throw ApiError.notFound('Invitation');
  return inv;
}

/** Public preview so the invitee knows what they're joining before signing up. */
invitationsRouter.get('/:token', validate({ params: tokenParams }), async (_req, res) => {
  const { token } = res.locals.params as z.infer<typeof tokenParams>;
  const inv = await findInvite(token);
  const inviter = inv.role === 'TENANT' ? inv.lease.landlord : inv.lease.tenant;
  res.json({
    invitation: {
      role: inv.role,
      inviterName: inviter?.name ?? 'Someone',
      property: { addressLine: inv.lease.property.addressLine, city: inv.lease.property.city },
      securityDeposit: inv.lease.securityDeposit,
      expiresAt: inv.expiresAt,
      expired: inv.expiresAt < new Date(),
      accepted: inv.acceptedAt !== null,
    },
  });
});

invitationsRouter.post('/:token/accept', requireAuth, validate({ params: tokenParams }), async (req, res) => {
  const { token } = res.locals.params as z.infer<typeof tokenParams>;
  const me = userId(req);
  const inv = await findInvite(token);

  if (inv.acceptedAt) throw ApiError.conflict('INVITE_USED', 'This invitation has already been used');
  if (inv.expiresAt < new Date()) throw ApiError.conflict('INVITE_EXPIRED', 'This invitation has expired. Ask for a new link.');
  if (inv.lease.landlordId === me || inv.lease.tenantId === me) {
    throw ApiError.conflict('SAME_PERSON', 'You are already part of this tenancy. The other party must open this link.');
  }

  const slot = inv.role === 'LANDLORD' ? 'landlordId' : 'tenantId';
  await prisma.$transaction(async (tx) => {
    // Conditional updates make double-acceptance impossible even if two
    // people click the same link at the same moment.
    const claimed = await tx.invitation.updateMany({
      where: { id: inv.id, acceptedAt: null },
      data: { acceptedAt: new Date(), acceptedById: me },
    });
    const filled = await tx.lease.updateMany({ where: { id: inv.leaseId, [slot]: null }, data: { [slot]: me } });
    if (claimed.count === 0 || filled.count === 0) {
      throw ApiError.conflict('INVITE_USED', 'This tenancy already has a ' + inv.role.toLowerCase());
    }
    await appendAudit(tx, {
      leaseId: inv.leaseId,
      actorId: me,
      action: 'invitation.accepted',
      entityType: 'Invitation',
      entityId: inv.id,
      data: { role: inv.role },
    });
  });
  res.json({ leaseId: inv.leaseId, role: inv.role });
});
