import type { Lease, PartyRole } from '@prisma/client';
import { prisma } from '../db.js';
import { ApiError } from './errors.js';

/**
 * Lease-level authorization. Every lease-scoped route goes through here.
 * Non-members get 404 (not 403) so lease IDs can't be probed.
 */
export interface LeaseAccess {
  lease: Lease;
  role: PartyRole;
  /** The other party's user id (null if they haven't joined yet). */
  otherPartyId: number | null;
}

export function roleIn(lease: Pick<Lease, 'landlordId' | 'tenantId'>, userId: number): PartyRole | null {
  if (lease.landlordId === userId) return 'LANDLORD';
  if (lease.tenantId === userId) return 'TENANT';
  return null;
}

export function accessFor(lease: Lease, userId: number): LeaseAccess {
  const role = roleIn(lease, userId);
  if (!role) throw ApiError.notFound('Tenancy');
  return { lease, role, otherPartyId: role === 'LANDLORD' ? lease.tenantId : lease.landlordId };
}

export async function requireLease(leaseId: number, userId: number): Promise<LeaseAccess> {
  const lease = await prisma.lease.findUnique({ where: { id: leaseId } });
  if (!lease) throw ApiError.notFound('Tenancy');
  return accessFor(lease, userId);
}

/** Resolve an inspection and check the user is part of its lease. */
export async function requireInspection(inspectionId: number, userId: number) {
  const inspection = await prisma.inspection.findUnique({ where: { id: inspectionId }, include: { lease: true } });
  if (!inspection) throw ApiError.notFound('Inspection');
  return { inspection, ...accessFor(inspection.lease, userId) };
}

export async function requireItem(itemId: number, userId: number) {
  const item = await prisma.inspectionItem.findUnique({
    where: { id: itemId },
    include: { inspection: { include: { lease: true } } },
  });
  if (!item) throw ApiError.notFound('Item');
  return { item, inspection: item.inspection, ...accessFor(item.inspection.lease, userId) };
}
