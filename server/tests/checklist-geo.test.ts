import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { checkPhoto, distanceMeters } from '../src/lib/geo.js';
import { api, bearer, documentAndSubmit, PNG, resetDb, tenancy } from './helpers.js';
import { jpegWithExif } from './exif.js';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const HSR = { latitude: 12.9116, longitude: 77.6474 }; // HSR Layout, Bengaluru

describe('geo helpers', () => {
  it('measures distance with the haversine formula', () => {
    const mumbai = { latitude: 19.076, longitude: 72.8777 };
    expect(distanceMeters(HSR, mumbai) / 1000).toBeGreaterThan(830);
    expect(distanceMeters(HSR, mumbai) / 1000).toBeLessThan(860);
    expect(distanceMeters(HSR, HSR)).toBe(0);
  });

  it('classifies photos by place and age', () => {
    const uploadedAt = new Date('2026-11-20T10:00:00Z');
    const near = { latitude: 12.9117, longitude: 77.6475, locationSource: 'EXIF' as const, takenAt: new Date('2026-11-20T09:00:00Z'), uploadedAt };
    expect(checkPhoto(near, HSR)).toMatchObject({ place: 'AT_PROPERTY', stale: false });
    expect(checkPhoto({ ...near, latitude: 12.95 }, HSR).place).toBe('AWAY');
    expect(checkPhoto({ ...near, latitude: null, longitude: null }, HSR).place).toBe('NO_LOCATION');
    expect(checkPhoto(near, { latitude: null, longitude: null }).place).toBe('PROPERTY_NOT_PINNED');
    expect(checkPhoto({ ...near, takenAt: new Date('2026-08-01T00:00:00Z') }, HSR).stale).toBe(true);
  });
});

async function startMoveIn(rooms = ['Bedroom']) {
  const t = await tenancy({ rooms });
  const start = await api().post(`/api/v1/leases/${t.leaseId}/inspections`).set(bearer(t.tenant.token)).send({ type: 'MOVE_IN' });
  const inspectionId = start.body.inspection.id as number;
  const room = await prisma.room.findFirstOrThrow({ where: { property: { leases: { some: { id: t.leaseId } } } } });
  return { ...t, inspectionId, room };
}

describe('shaping the checklist', () => {
  it('adds a custom item, removes one, and marks the rest of a room as good', async () => {
    const { tenant, landlord, inspectionId, room } = await startMoveIn();
    const before = await prisma.inspectionItem.count({ where: { inspectionId } });

    const added = await api().post(`/api/v1/inspections/${inspectionId}/items`).set(bearer(tenant.token)).send({ roomId: room.id, name: 'Study table' }).expect(201);
    expect(added.body.item.name).toBe('Study table');

    // The reviewer can't change the author's checklist.
    await api().post(`/api/v1/inspections/${inspectionId}/items`).set(bearer(landlord.token)).send({ roomId: room.id, name: 'Sneaky item' }).expect(403);

    const ac = await prisma.inspectionItem.findFirstOrThrow({ where: { inspectionId, name: 'AC (if any)' } });
    await api().delete(`/api/v1/items/${ac.id}`).set(bearer(tenant.token)).expect(204);
    expect(await prisma.inspectionItem.count({ where: { inspectionId } })).toBe(before); // +1 -1

    // Record one item as damaged, then "everything else is fine".
    const wall = await prisma.inspectionItem.findFirstOrThrow({ where: { inspectionId, name: 'Walls & paint' } });
    await api().patch(`/api/v1/items/${wall.id}`).set(bearer(tenant.token)).send({ version: wall.version, condition: 'DAMAGED' }).expect(200);
    const marked = await api().post(`/api/v1/inspections/${inspectionId}/rooms/${room.id}/mark-good`).set(bearer(tenant.token)).expect(200);
    expect(marked.body.updated).toBe(before - 1);
    expect((await prisma.inspectionItem.findUniqueOrThrow({ where: { id: wall.id } })).condition).toBe('DAMAGED'); // untouched

    await api().post(`/api/v1/inspections/${inspectionId}/submit`).set(bearer(tenant.token)).expect(200);
    // Locked after submission.
    await api().post(`/api/v1/inspections/${inspectionId}/items`).set(bearer(tenant.token)).send({ roomId: room.id, name: 'Late item' }).expect(409);
  });
});

describe('recording a disagreement', () => {
  it('lets the inspection lock with both views recorded', async () => {
    const t = await tenancy({ rooms: ['Kitchen'] });
    const id = await documentAndSubmit(t.leaseId, t.tenant.token, 'MOVE_IN');
    const sink = await prisma.inspectionItem.findFirstOrThrow({ where: { inspectionId: id, name: 'Sink & taps' } });

    // A note is required: you have to say what you disagree with.
    await api().post(`/api/v1/items/${sink.id}/review`).set(bearer(t.landlord.token)).send({ version: sink.version, decision: 'NOTED' }).expect(400);
    await api()
      .post(`/api/v1/items/${sink.id}/review`)
      .set(bearer(t.landlord.token))
      .send({ version: sink.version, decision: 'NOTED', comment: 'Tap was replaced last month, it was not leaking' })
      .expect(200);

    const all = await api().post(`/api/v1/inspections/${id}/approve-all`).set(bearer(t.landlord.token)).expect(200);
    expect(all.body.finalized).toBe(true);
    const saved = await prisma.inspectionItem.findUniqueOrThrow({ where: { id: sink.id } });
    expect(saved).toMatchObject({ reviewStatus: 'NOTED', reviewComment: 'Tap was replaced last month, it was not leaking' });
  });
});

describe('photo location', () => {
  it('reads GPS from EXIF and checks it against the pinned property', async () => {
    const { tenant, leaseId, inspectionId } = await startMoveIn(['Hall']);
    await api().patch(`/api/v1/leases/${leaseId}/location`).set(bearer(tenant.token)).send(HSR).expect(200);
    const item = await prisma.inspectionItem.findFirstOrThrow({ where: { inspectionId } });

    const atFlat = jpegWithExif({ lat: 12.91165, lng: 77.64745, takenAt: new Date() });
    const elsewhere = jpegWithExif({ lat: 12.9716, lng: 77.5946, takenAt: new Date() }); // MG Road, ~9 km away
    await api().post(`/api/v1/items/${item.id}/evidence`).set(bearer(tenant.token)).attach('files', atFlat, { filename: 'a.jpg', contentType: 'image/jpeg' }).expect(201);
    await api().post(`/api/v1/items/${item.id}/evidence`).set(bearer(tenant.token)).attach('files', elsewhere, { filename: 'b.jpg', contentType: 'image/jpeg' }).expect(201);

    const { body } = await api().get(`/api/v1/inspections/${inspectionId}`).set(bearer(tenant.token)).expect(200);
    const ev = body.inspection.items.find((i: { id: number }) => i.id === item.id).evidence;
    expect(ev[0].check).toMatchObject({ place: 'AT_PROPERTY', source: 'EXIF' });
    expect(ev[1].check.place).toBe('AWAY');
    expect(ev[1].check.distanceMeters).toBeGreaterThan(8000);
  });

  it('falls back to the device location for in-app camera shots, and records it in the audit chain', async () => {
    const { tenant, leaseId, inspectionId } = await startMoveIn(['Hall']);
    const item = await prisma.inspectionItem.findFirstOrThrow({ where: { inspectionId } });
    await api()
      .post(`/api/v1/items/${item.id}/evidence`)
      .set(bearer(tenant.token))
      .field('deviceLat', String(HSR.latitude))
      .field('deviceLng', String(HSR.longitude))
      .attach('files', PNG, 'camera.png')
      .expect(201);
    const ev = await prisma.evidence.findFirstOrThrow({ where: { itemId: item.id } });
    expect(ev.locationSource).toBe('DEVICE');

    const audit = await api().get(`/api/v1/leases/${leaseId}/audit`).set(bearer(tenant.token));
    const upload = audit.body.events.find((e: { action: string }) => e.action === 'evidence.uploaded');
    expect(upload.data.location).toMatchObject({ source: 'DEVICE' });
    expect(audit.body.chain.valid).toBe(true);
  });

  it('locks the map pin once an inspection is agreed', async () => {
    const t = await tenancy({ rooms: ['Hall'] });
    const id = await documentAndSubmit(t.leaseId, t.tenant.token, 'MOVE_IN');
    await api().post(`/api/v1/inspections/${id}/approve-all`).set(bearer(t.landlord.token)).expect(200);
    await api().patch(`/api/v1/leases/${t.leaseId}/location`).set(bearer(t.tenant.token)).send(HSR).expect(409);
  });
});
