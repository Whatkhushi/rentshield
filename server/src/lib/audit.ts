import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { sha256 } from './tokens.js';

type Tx = Prisma.TransactionClient;

export const GENESIS_HASH = '0'.repeat(64);

export interface AuditInput {
  leaseId: number;
  actorId: number | null;
  action: string; // e.g. "inspection.submitted"
  entityType: string;
  entityId?: number | null;
  data?: Record<string, unknown> | null;
}

/** Deterministic JSON: keys sorted, so the same event always hashes the same. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
    .join(',')}}`;
}

function eventHash(prevHash: string, e: AuditInput, createdAt: Date) {
  return sha256(
    prevHash +
      canonical({
        leaseId: e.leaseId,
        actorId: e.actorId,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId ?? null,
        data: e.data ?? null,
        createdAt: createdAt.toISOString(),
      }),
  );
}

/**
 * Append an event to the lease's hash chain. MUST run inside a transaction:
 * we lock the lease row first so two concurrent writers can't both read the
 * same "previous hash" and fork the chain.
 */
export async function appendAudit(tx: Tx, e: AuditInput) {
  await tx.$queryRaw`SELECT id FROM "Lease" WHERE id = ${e.leaseId} FOR UPDATE`;
  const last = await tx.auditEvent.findFirst({
    where: { leaseId: e.leaseId },
    orderBy: { id: 'desc' },
    select: { hash: true },
  });
  const prevHash = last?.hash ?? GENESIS_HASH;
  const createdAt = new Date();
  return tx.auditEvent.create({
    data: {
      leaseId: e.leaseId,
      actorId: e.actorId,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId ?? null,
      data: (e.data ?? undefined) as Prisma.InputJsonValue | undefined,
      prevHash,
      hash: eventHash(prevHash, e, createdAt),
      createdAt,
    },
  });
}

/** Recompute every hash; returns the first event where the chain breaks, if any. */
export async function verifyChain(leaseId: number) {
  const events = await prisma.auditEvent.findMany({ where: { leaseId }, orderBy: { id: 'asc' } });
  let prev = GENESIS_HASH;
  for (const ev of events) {
    const expected = eventHash(
      prev,
      {
        leaseId: ev.leaseId,
        actorId: ev.actorId,
        action: ev.action,
        entityType: ev.entityType,
        entityId: ev.entityId,
        data: ev.data as Record<string, unknown> | null,
      },
      ev.createdAt,
    );
    if (ev.prevHash !== prev || ev.hash !== expected) {
      return { valid: false as const, count: events.length, brokenAtEventId: ev.id };
    }
    prev = ev.hash;
  }
  return { valid: true as const, count: events.length, brokenAtEventId: null };
}
