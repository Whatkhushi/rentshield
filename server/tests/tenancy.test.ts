import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { api, bearer, newUser, PNG, resetDb, tenancy } from './helpers.js';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('tenancies and invitations', () => {
  it('creates a tenancy with rooms and a pending second party', async () => {
    const t = await newUser();
    const res = await api()
      .post('/api/v1/leases')
      .set(bearer(t.token))
      .send({
        myRole: 'TENANT',
        property: { addressLine: '4 Park Street', city: 'Kolkata', propertyType: 'APARTMENT', rooms: ['Bedroom', 'Bathroom'] },
        startDate: '2026-03-01',
        monthlyRent: 18000,
        securityDeposit: 54000,
      })
      .expect(201);
    const detail = await api().get(`/api/v1/leases/${res.body.lease.id}`).set(bearer(t.token)).expect(200);
    expect(detail.body.lease.myRole).toBe('TENANT');
    expect(detail.body.lease.stage).toBe('WAITING_FOR_PARTY');
    expect(detail.body.lease.property.rooms).toHaveLength(2);
  });

  it('hides tenancies from non-members with 404', async () => {
    const { leaseId } = await tenancy();
    const stranger = await newUser('Stranger');
    await api().get(`/api/v1/leases/${leaseId}`).set(bearer(stranger.token)).expect(404);
    await api().get(`/api/v1/leases/${leaseId}/audit`).set(bearer(stranger.token)).expect(404);
  });

  it('invite links are single-use and cannot be accepted by the inviter', async () => {
    const tenant = await newUser();
    const { body } = await api()
      .post('/api/v1/leases')
      .set(bearer(tenant.token))
      .send({
        myRole: 'TENANT',
        property: { addressLine: '9 Linking Road', city: 'Mumbai', propertyType: 'APARTMENT', rooms: ['Hall'] },
        startDate: '2026-02-01',
        monthlyRent: 40000,
        securityDeposit: 200000,
      });
    const invite = await api().post(`/api/v1/leases/${body.lease.id}/invitations`).set(bearer(tenant.token)).expect(201);
    const token = invite.body.url.split('/invite/')[1];

    const preview = await api().get(`/api/v1/invitations/${token}`).expect(200);
    expect(preview.body.invitation).toMatchObject({ role: 'LANDLORD', expired: false, accepted: false });

    const self = await api().post(`/api/v1/invitations/${token}/accept`).set(bearer(tenant.token)).expect(409);
    expect(self.body.error.code).toBe('SAME_PERSON');

    // Two different people race to accept the same link: exactly one wins.
    const [a, b] = [await newUser(), await newUser()];
    const results = await Promise.all([
      api().post(`/api/v1/invitations/${token}/accept`).set(bearer(a.token)),
      api().post(`/api/v1/invitations/${token}/accept`).set(bearer(b.token)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('deletes a tenancy (and its photos) while nobody else has joined', async () => {
    const t = await newUser();
    const { body } = await api()
      .post('/api/v1/leases')
      .set(bearer(t.token))
      .send({
        myRole: 'TENANT',
        property: { addressLine: '3 Brigade Road', city: 'Bengaluru', propertyType: 'ROOM', rooms: ['Room'] },
        startDate: '2026-04-01',
        monthlyRent: 9000,
        securityDeposit: 18000,
      });
    const id = body.lease.id;
    const start = await api().post(`/api/v1/leases/${id}/inspections`).set(bearer(t.token)).send({ type: 'MOVE_IN' });
    const item = await prisma.inspectionItem.findFirstOrThrow({ where: { inspectionId: start.body.inspection.id } });
    await api().post(`/api/v1/items/${item.id}/evidence`).set(bearer(t.token)).attach('files', PNG, 'a.png').expect(201);

    await api().delete(`/api/v1/leases/${id}`).set(bearer(t.token)).expect(204);
    await api().get(`/api/v1/leases/${id}`).set(bearer(t.token)).expect(404);
    expect(await prisma.evidence.count()).toBe(0);
    expect(await prisma.auditEvent.count({ where: { leaseId: id } })).toBe(0);
    expect(await prisma.property.count()).toBe(0);
  });

  it('refuses to delete once the other person has joined, and outsiders get 404', async () => {
    const { tenant, landlord, leaseId } = await tenancy();
    const r = await api().delete(`/api/v1/leases/${leaseId}`).set(bearer(tenant.token)).expect(409);
    expect(r.body.error.code).toBe('SHARED_TENANCY');
    await api().delete(`/api/v1/leases/${leaseId}`).set(bearer(landlord.token)).expect(409);
    const stranger = await newUser();
    await api().delete(`/api/v1/leases/${leaseId}`).set(bearer(stranger.token)).expect(404);
    // The audit log still refuses ordinary deletes.
    await expect(prisma.$executeRawUnsafe(`DELETE FROM "AuditEvent"`)).rejects.toThrow(/append-only/);
  });

  it('stores only the hash of an invitation token', async () => {
    const { inviteToken } = await tenancy();
    const stored = await prisma.invitation.findMany();
    expect(stored.some((i) => i.tokenHash === inviteToken)).toBe(false);
  });
});
