import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';

export const app = createApp();
export const api = () => request(app);

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE "AuditEvent", "Report", "Evidence", "Deduction", "Settlement", "InspectionItem", "Inspection",
     "Invitation", "Lease", "Room", "Property", "RefreshToken", "User" RESTART IDENTITY CASCADE`,
  );
}

let n = 0;
export async function newUser(name = 'User') {
  const email = `user${++n}-${Date.now()}@test.dev`;
  const res = await api().post('/api/v1/auth/register').send({ name: `${name} ${n}`, email, password: 'password123' });
  return { token: res.body.accessToken as string, id: res.body.user.id as number, email };
}

export const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

/** 1x1 PNG, enough to exercise uploads, hashing and PDF embedding. */
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Tenant creates a tenancy and the landlord joins through the invite link. */
export async function tenancy(opts: { deposit?: number; rooms?: string[] } = {}) {
  const tenant = await newUser('Tenant');
  const landlord = await newUser('Landlord');
  const created = await api()
    .post('/api/v1/leases')
    .set(bearer(tenant.token))
    .send({
      myRole: 'TENANT',
      property: { addressLine: '12 MG Road, Indiranagar', city: 'Bengaluru', propertyType: 'APARTMENT', rooms: opts.rooms ?? ['Bedroom', 'Kitchen'] },
      startDate: '2026-01-01',
      monthlyRent: 25000,
      securityDeposit: opts.deposit ?? 100000,
    })
    .expect(201);
  const leaseId = created.body.lease.id as number;
  const invite = await api().post(`/api/v1/leases/${leaseId}/invitations`).set(bearer(tenant.token)).expect(201);
  const token = (invite.body.url as string).split('/invite/')[1];
  await api().post(`/api/v1/invitations/${token}/accept`).set(bearer(landlord.token)).expect(200);
  return { tenant, landlord, leaseId, inviteToken: token };
}

/** Tenant documents every item as GOOD and submits; returns the inspection. */
export async function documentAndSubmit(leaseId: number, author: string, type: 'MOVE_IN' | 'MOVE_OUT') {
  const start = await api().post(`/api/v1/leases/${leaseId}/inspections`).set(bearer(author)).send({ type }).expect(201);
  const id = start.body.inspection.id as number;
  const { body } = await api().get(`/api/v1/inspections/${id}`).set(bearer(author)).expect(200);
  for (const item of body.inspection.items) {
    await api().patch(`/api/v1/items/${item.id}`).set(bearer(author)).send({ version: item.version, condition: 'GOOD' }).expect(200);
  }
  await api().post(`/api/v1/inspections/${id}/submit`).set(bearer(author)).expect(200);
  return id;
}
