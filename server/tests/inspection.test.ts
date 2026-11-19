import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { api, bearer, documentAndSubmit, PNG, resetDb, tenancy } from './helpers.js';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('joint inspection', () => {
  it('runs the full document → dispute → revise → agree cycle', async () => {
    const { tenant, landlord, leaseId } = await tenancy({ rooms: ['Bedroom'] });

    const start = await api().post(`/api/v1/leases/${leaseId}/inspections`).set(bearer(tenant.token)).send({ type: 'MOVE_IN' }).expect(201);
    const inspectionId = start.body.inspection.id;
    const { body } = await api().get(`/api/v1/inspections/${inspectionId}`).set(bearer(tenant.token));
    const items = body.inspection.items as { id: number; version: number; name: string }[];
    expect(items.map((i) => i.name)).toContain('Wardrobe'); // bedroom checklist applied

    // Can't submit until every item has a condition.
    const early = await api().post(`/api/v1/inspections/${inspectionId}/submit`).set(bearer(tenant.token)).expect(409);
    expect(early.body.error.code).toBe('INCOMPLETE');

    for (const it of items) {
      await api().patch(`/api/v1/items/${it.id}`).set(bearer(tenant.token)).send({ version: it.version, condition: 'GOOD' }).expect(200);
    }
    const wall = items[0];
    await api()
      .patch(`/api/v1/items/${wall.id}`)
      .set(bearer(tenant.token))
      .send({ version: wall.version + 1, condition: 'DAMAGED', notes: 'Paint peeling near window' })
      .expect(200);

    // Photo upload: server computes and records SHA-256.
    const up = await api().post(`/api/v1/items/${wall.id}/evidence`).set(bearer(tenant.token)).attach('files', PNG, 'wall.png').expect(201);
    expect(up.body.evidence[0].sha256).toMatch(/^[0-9a-f]{64}$/);

    // The landlord can't edit the tenant's inspection.
    await api().patch(`/api/v1/items/${wall.id}`).set(bearer(landlord.token)).send({ version: 3, notes: 'x' }).expect(403);

    await api().post(`/api/v1/inspections/${inspectionId}/submit`).set(bearer(tenant.token)).expect(200);

    // Landlord disputes the wall, then approves everything else.
    let wallNow = await prisma.inspectionItem.findUniqueOrThrow({ where: { id: wall.id } });
    await api()
      .post(`/api/v1/items/${wall.id}/review`)
      .set(bearer(landlord.token))
      .send({ version: wallNow.version, decision: 'DISPUTED', comment: 'Only a small patch, not the whole wall' })
      .expect(200);
    const all = await api().post(`/api/v1/inspections/${inspectionId}/approve-all`).set(bearer(landlord.token)).expect(200);
    expect(all.body.finalized).toBe(false); // the disputed one blocks finalization

    // Tenant revises the disputed item -> back to PENDING.
    wallNow = await prisma.inspectionItem.findUniqueOrThrow({ where: { id: wall.id } });
    await api()
      .patch(`/api/v1/items/${wall.id}`)
      .set(bearer(tenant.token))
      .send({ version: wallNow.version, notes: 'Small patch of peeling paint (about 30 cm) near the window' })
      .expect(200);
    wallNow = await prisma.inspectionItem.findUniqueOrThrow({ where: { id: wall.id } });
    expect(wallNow.reviewStatus).toBe('PENDING');

    const final = await api()
      .post(`/api/v1/items/${wall.id}/review`)
      .set(bearer(landlord.token))
      .send({ version: wallNow.version, decision: 'APPROVED' })
      .expect(200);
    expect(final.body.finalized).toBe(true);

    // Finalized = locked forever.
    await api().patch(`/api/v1/items/${wall.id}`).set(bearer(tenant.token)).send({ version: wallNow.version + 1, notes: 'edit' }).expect(409);
    await api().post(`/api/v1/items/${wall.id}/evidence`).set(bearer(tenant.token)).attach('files', PNG, 'late.png').expect(409);
  });

  it('rejects a stale update with 409 (optimistic locking)', async () => {
    const { tenant, leaseId } = await tenancy({ rooms: ['Kitchen'] });
    const start = await api().post(`/api/v1/leases/${leaseId}/inspections`).set(bearer(tenant.token)).send({ type: 'MOVE_IN' });
    const item = (await prisma.inspectionItem.findFirstOrThrow({ where: { inspectionId: start.body.inspection.id } }));

    // Two edits based on the same version: the second must fail.
    await api().patch(`/api/v1/items/${item.id}`).set(bearer(tenant.token)).send({ version: item.version, condition: 'GOOD' }).expect(200);
    const stale = await api().patch(`/api/v1/items/${item.id}`).set(bearer(tenant.token)).send({ version: item.version, condition: 'FAIR' }).expect(409);
    expect(stale.body.error.code).toBe('STALE_VERSION');
  });

  it('allows only one move-in inspection per tenancy', async () => {
    const { tenant, landlord, leaseId } = await tenancy();
    await api().post(`/api/v1/leases/${leaseId}/inspections`).set(bearer(tenant.token)).send({ type: 'MOVE_IN' }).expect(201);
    const dup = await api().post(`/api/v1/leases/${leaseId}/inspections`).set(bearer(landlord.token)).send({ type: 'MOVE_IN' }).expect(409);
    expect(dup.body.error.code).toBe('INSPECTION_EXISTS');
  });

  it('rejects non-image uploads', async () => {
    const { tenant, leaseId } = await tenancy({ rooms: ['Hall'] });
    const start = await api().post(`/api/v1/leases/${leaseId}/inspections`).set(bearer(tenant.token)).send({ type: 'MOVE_IN' });
    const item = await prisma.inspectionItem.findFirstOrThrow({ where: { inspectionId: start.body.inspection.id } });
    await api()
      .post(`/api/v1/items/${item.id}/evidence`)
      .set(bearer(tenant.token))
      .attach('files', Buffer.from('#!/bin/sh'), { filename: 'evil.sh', contentType: 'text/x-sh' })
      .expect(400);
  });
});

describe('tamper evidence', () => {
  it('detects a file changed on disk after upload', async () => {
    const { tenant, leaseId } = await tenancy({ rooms: ['Hall'] });
    const start = await api().post(`/api/v1/leases/${leaseId}/inspections`).set(bearer(tenant.token)).send({ type: 'MOVE_IN' });
    const item = await prisma.inspectionItem.findFirstOrThrow({ where: { inspectionId: start.body.inspection.id } });
    const up = await api().post(`/api/v1/items/${item.id}/evidence`).set(bearer(tenant.token)).attach('files', PNG, 'floor.png');
    const evId = up.body.evidence[0].id;

    const ok = await api().get(`/api/v1/evidence/${evId}/verify`).set(bearer(tenant.token)).expect(200);
    expect(ok.body.verified).toBe(true);

    // Someone edits the stored file directly.
    const ev = await prisma.evidence.findUniqueOrThrow({ where: { id: evId } });
    fs.appendFileSync(path.join(process.env.STORAGE_DIR!, ev.storageKey), 'tampered');

    const bad = await api().get(`/api/v1/evidence/${evId}/verify`).set(bearer(tenant.token)).expect(200);
    expect(bad.body.verified).toBe(false);
    expect(bad.body.currentHash).not.toBe(bad.body.recordedHash);
  });

  it('keeps an intact hash chain, and the database refuses to edit history', async () => {
    const { tenant, landlord, leaseId } = await tenancy();
    await documentAndSubmit(leaseId, tenant.token, 'MOVE_IN');

    const audit = await api().get(`/api/v1/leases/${leaseId}/audit`).set(bearer(landlord.token)).expect(200);
    expect(audit.body.chain.valid).toBe(true);
    expect(audit.body.events.map((e: { action: string }) => e.action)).toEqual(
      expect.arrayContaining(['lease.created', 'invitation.accepted', 'inspection.started', 'inspection.submitted']),
    );

    // The trigger blocks UPDATE and DELETE on the audit table.
    await expect(prisma.$executeRawUnsafe(`UPDATE "AuditEvent" SET action = 'hacked'`)).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe(`DELETE FROM "AuditEvent"`)).rejects.toThrow(/append-only/);
  });

  it('keeps the chain intact under concurrent writes', async () => {
    const { tenant, leaseId } = await tenancy({ rooms: ['Hall'] });
    const start = await api().post(`/api/v1/leases/${leaseId}/inspections`).set(bearer(tenant.token)).send({ type: 'MOVE_IN' });
    const item = await prisma.inspectionItem.findFirstOrThrow({ where: { inspectionId: start.body.inspection.id } });
    // 6 uploads at once -> 6 audit events appended concurrently.
    await Promise.all(
      Array.from({ length: 6 }, (_, i) => api().post(`/api/v1/items/${item.id}/evidence`).set(bearer(tenant.token)).attach('files', PNG, `p${i}.png`)),
    );
    const audit = await api().get(`/api/v1/leases/${leaseId}/audit`).set(bearer(tenant.token));
    expect(audit.body.chain.valid).toBe(true);
    expect(audit.body.events.filter((e: { action: string }) => e.action === 'evidence.uploaded')).toHaveLength(6);
  });
});
