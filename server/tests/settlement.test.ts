import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { api, bearer, documentAndSubmit, PNG, resetDb, tenancy } from './helpers.js';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

/** Tenancy with both inspections agreed, ready for settlement. */
async function readyToSettle(deposit = 50000) {
  const t = await tenancy({ deposit, rooms: ['Bedroom'] });
  const moveIn = await documentAndSubmit(t.leaseId, t.tenant.token, 'MOVE_IN');
  await api().post(`/api/v1/inspections/${moveIn}/approve-all`).set(bearer(t.landlord.token)).expect(200);
  const moveOut = await documentAndSubmit(t.leaseId, t.tenant.token, 'MOVE_OUT');
  await api().post(`/api/v1/inspections/${moveOut}/approve-all`).set(bearer(t.landlord.token)).expect(200);
  return { ...t, moveOut };
}

describe('move-out comparison', () => {
  it('pairs every move-out item with its move-in item', async () => {
    const { tenant, moveOut } = await readyToSettle();
    const cmp = await api().get(`/api/v1/inspections/${moveOut}/comparison`).set(bearer(tenant.token)).expect(200);
    expect(cmp.body.pairs.length).toBeGreaterThan(0);
    for (const p of cmp.body.pairs) {
      expect(p.moveIn.itemId).toBeTypeOf('number');
      expect(p.moveIn.condition).toBe('GOOD');
    }
  });

  it('cannot start move-out before move-in is agreed', async () => {
    const { tenant, leaseId } = await tenancy();
    await documentAndSubmit(leaseId, tenant.token, 'MOVE_IN');
    const r = await api().post(`/api/v1/leases/${leaseId}/inspections`).set(bearer(tenant.token)).send({ type: 'MOVE_OUT' }).expect(409);
    expect(r.body.error.code).toBe('MOVE_IN_NOT_FINAL');
  });
});

describe('deposit settlement', () => {
  it('negotiates deductions and settles with the right refund', async () => {
    const { tenant, landlord, leaseId, moveOut } = await readyToSettle(50000);

    await api().post(`/api/v1/leases/${leaseId}/settlement`).set(bearer(tenant.token)).expect(403); // landlord opens it
    const opened = await api().post(`/api/v1/leases/${leaseId}/settlement`).set(bearer(landlord.token)).expect(201);
    const sid = opened.body.settlement.id;
    const item = await prisma.inspectionItem.findFirstOrThrow({ where: { inspectionId: moveOut } });

    // Can't claim more than the deposit.
    const tooMuch = await api()
      .post(`/api/v1/settlements/${sid}/deductions`)
      .set(bearer(landlord.token))
      .send({ reason: 'Full repaint of the flat', amount: 60000 })
      .expect(409);
    expect(tooMuch.body.error.code).toBe('EXCEEDS_DEPOSIT');

    const paint = await api()
      .post(`/api/v1/settlements/${sid}/deductions`)
      .set(bearer(landlord.token))
      .send({ itemId: item.id, reason: 'Repaint bedroom wall', amount: 6000 })
      .expect(201);
    const clean = await api()
      .post(`/api/v1/settlements/${sid}/deductions`)
      .set(bearer(landlord.token))
      .send({ reason: 'Deep cleaning', amount: 2000 })
      .expect(201);
    await api().post(`/api/v1/deductions/${paint.body.deduction.id}/evidence`).set(bearer(landlord.token)).attach('files', PNG, 'invoice.png').expect(201);

    // Tenant disputes the paint, accepts cleaning.
    await api()
      .post(`/api/v1/deductions/${paint.body.deduction.id}/respond`)
      .set(bearer(tenant.token))
      .send({ version: 1, decision: 'DISPUTED', comment: 'Wall was already damaged at move-in' })
      .expect(200);
    await api()
      .post(`/api/v1/deductions/${clean.body.deduction.id}/respond`)
      .set(bearer(tenant.token))
      .send({ version: 1, decision: 'ACCEPTED' })
      .expect(200);

    // Can't confirm while something is disputed.
    const blocked = await api().post(`/api/v1/settlements/${sid}/confirm`).set(bearer(landlord.token)).expect(409);
    expect(blocked.body.error.code).toBe('UNRESOLVED');

    // Landlord lowers the paint charge; tenant accepts the revision.
    await api().patch(`/api/v1/deductions/${paint.body.deduction.id}`).set(bearer(landlord.token)).send({ version: 2, amount: 3000 }).expect(200);
    await api()
      .post(`/api/v1/deductions/${paint.body.deduction.id}/respond`)
      .set(bearer(tenant.token))
      .send({ version: 3, decision: 'ACCEPTED' })
      .expect(200);

    const first = await api().post(`/api/v1/settlements/${sid}/confirm`).set(bearer(landlord.token)).expect(200);
    expect(first.body.agreed).toBe(false);
    const second = await api().post(`/api/v1/settlements/${sid}/confirm`).set(bearer(tenant.token)).expect(200);
    expect(second.body.agreed).toBe(true);
    expect(second.body.settlement.finalRefund).toBe(50000 - 3000 - 2000);

    const lease = await api().get(`/api/v1/leases/${leaseId}`).set(bearer(tenant.token));
    expect(lease.body.lease.stage).toBe('SETTLED');

    // Settled = no more changes.
    await api().post(`/api/v1/settlements/${sid}/deductions`).set(bearer(landlord.token)).send({ reason: 'One more thing', amount: 100 }).expect(409);
  });

  it('a change after one party confirmed clears confirmations', async () => {
    const { tenant, landlord, leaseId } = await readyToSettle(10000);
    const { body } = await api().post(`/api/v1/leases/${leaseId}/settlement`).set(bearer(landlord.token));
    const sid = body.settlement.id;
    await api().post(`/api/v1/settlements/${sid}/confirm`).set(bearer(tenant.token)).expect(200);
    await api().post(`/api/v1/settlements/${sid}/deductions`).set(bearer(landlord.token)).send({ reason: 'Broken tap handle', amount: 500 }).expect(201);
    const s = await prisma.settlement.findUniqueOrThrow({ where: { id: sid } });
    expect(s.tenantConfirmedAt).toBeNull();
  });
});

describe('PDF report', () => {
  it('generates a report with its own fingerprint', async () => {
    const { tenant, leaseId } = await readyToSettle();
    const r = await api().post(`/api/v1/leases/${leaseId}/reports`).set(bearer(tenant.token)).expect(202);
    // No worker in tests -> generated inline, so it's ready now.
    expect(r.body.report.status).toBe('READY');
    expect(r.body.report.sha256).toMatch(/^[0-9a-f]{64}$/);

    const file = await api()
      .get(`/api/v1/reports/${r.body.report.id}/file`)
      .set(bearer(tenant.token))
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect((file.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });
});
