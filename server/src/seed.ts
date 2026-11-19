/**
 * Demo data, created through the real REST API (in-process), so every
 * record has a valid audit chain and real SHA-256 fingerprints.
 *
 *   tenant@rentshield.dev   / tenant1234
 *   landlord@rentshield.dev / landlord1234
 *
 * Creates three tenancies at different stages. Safe to re-run: it does
 * nothing if the demo tenant already exists.
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import zlib from 'node:zlib';
import { createApp } from './app.js';
import { prisma } from './db.js';

// ---------- Tiny PNG encoder + procedural "photos" ----------

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w: number, h: number, px: (x: number, y: number) => [number, number, number]) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = px(x, y);
      const i = y * (w * 3 + 1) + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

type Scene = 'wall' | 'floor' | 'sink' | 'tap' | 'door';
const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** A simple illustrated photo. `shift` nudges the framing; `damage` adds a stain/crack. */
function photo(scene: Scene, opts: { shift?: number; damage?: boolean; seed?: number } = {}) {
  const W = 640;
  const H = 480;
  const s = opts.shift ?? 0;
  let seed = opts.seed ?? 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const noise = Array.from({ length: 4096 }, () => rand() * 10 - 5);
  return png(W, H, (x0, y) => {
    const x = x0 + s;
    const n = noise[(x0 * 31 + y * 17) & 4095];
    let c: [number, number, number];
    if (scene === 'wall' || scene === 'door') {
      const shade = 236 - y * 0.05;
      c = [shade, shade - 6, shade - 18];
      if (y > 390) c = [168 - (x % 80 < 2 ? 30 : 0), 140, 108]; // floor
      if (scene === 'wall' && x > 90 && x < 270 && y > 80 && y < 290) c = x > 175 && x < 185 ? [244, 241, 234] : [150 + y * 0.2, 190 + y * 0.1, 225]; // window
      if (scene === 'door' && x > 230 && x < 420 && y > 40 && y < 395) c = [120, 82, 52 + (x % 40 < 3 ? -20 : 0)];
      if (scene === 'door' && Math.hypot(x - 395, y - 230) < 9) c = [210, 180, 90];
      if (opts.damage) {
        const d = Math.hypot(x - 470, y - 200);
        if (d < 70) c = c.map((v) => v - (70 - d) * 1.3) as typeof c; // damp stain
        if (Math.abs(y - 150 - (x - 430) * 0.6) < 2 && x > 430 && x < 540) c = [90, 80, 70]; // crack
      }
    } else if (scene === 'floor') {
      const tile = (Math.floor(x / 80) + Math.floor(y / 80)) % 2;
      const grout = x % 80 < 2 || y % 80 < 2;
      c = grout ? [150, 145, 135] : tile ? [222, 214, 198] : [210, 200, 182];
      if (opts.damage && Math.hypot(x - 330, y - 260) < 40 && Math.abs((x - 330) - (y - 260)) < 4) c = [60, 55, 50];
    } else {
      c = [200, 205, 210];
      const basin = Math.hypot((x - 320) / 1.6, y - 330) < 120;
      if (basin) c = [245, 247, 248];
      if (Math.hypot((x - 320) / 1.6, y - 330) < 90) c = [225, 230, 235];
      if (x > 300 && x < 340 && y > 120 && y < 240) c = [185, 190, 198]; // tap
      if (x > 300 && x < 420 && y > 120 && y < 150) c = [175, 180, 190];
      if (opts.damage && x > 300 && x < 340 && y > 240 && y < 330) c = [120 + (y % 9), 150, 190]; // drip
      if (opts.damage && scene === 'sink' && Math.hypot(x - 380, y - 360) < 30) c = [170, 140, 90]; // rust
    }
    return [clamp(c[0] + n), clamp(c[1] + n), clamp(c[2] + n)];
  });
}

// ---------- API client against the in-process server ----------

let base = '';

async function call<T = any>(token: string | null, method: string, path: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(base + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

async function user(name: string, email: string, password: string) {
  const r = await call<{ accessToken: string }>(null, 'POST', '/auth/register', { name, email, password });
  return r.accessToken;
}

async function upload(token: string, itemId: number, files: { name: string; data: Buffer }[]) {
  const fd = new FormData();
  for (const f of files) fd.append('files', new Blob([new Uint8Array(f.data)], { type: 'image/png' }), f.name);
  await call(token, 'POST', `/items/${itemId}/evidence`, fd);
}

interface ItemRow {
  id: number;
  name: string;
  roomId: number;
  version: number;
}

async function tenancy(owner: string, ownerRole: 'TENANT' | 'LANDLORD', other: string | null, p: { address: string; city: string; rooms: string[]; rent: number; deposit: number; start: string }) {
  const { lease } = await call(owner, 'POST', '/leases', {
    myRole: ownerRole,
    property: { addressLine: p.address, city: p.city, propertyType: 'APARTMENT', rooms: p.rooms },
    startDate: p.start,
    monthlyRent: p.rent,
    securityDeposit: p.deposit,
  });
  if (other) {
    const inv = await call(owner, 'POST', `/leases/${lease.id}/invitations`);
    await call(other, 'POST', `/invitations/${inv.url.split('/invite/')[1]}/accept`);
  }
  return lease.id as number;
}

type Plan = Record<string, { condition?: string; notes?: string; photo?: Buffer }>;

/** Document every item (GOOD unless the plan says otherwise), attach photos, submit. */
async function inspect(token: string, leaseId: number, type: 'MOVE_IN' | 'MOVE_OUT', rooms: Map<number, string>, plan: Plan, meters: Record<string, string>) {
  const { inspection } = await call(token, 'POST', `/leases/${leaseId}/inspections`, { type });
  const full = await call<{ inspection: { items: ItemRow[] } }>(token, 'GET', `/inspections/${inspection.id}`);
  for (const it of full.inspection.items) {
    const key = `${rooms.get(it.roomId)}/${it.name}`;
    const p = plan[key] ?? {};
    await call(token, 'PATCH', `/items/${it.id}`, { version: it.version, condition: p.condition ?? 'GOOD', notes: p.notes ?? null });
    if (p.photo) await upload(token, it.id, [{ name: `${key.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`, data: p.photo }]);
  }
  await call(token, 'PATCH', `/inspections/${inspection.id}`, meters);
  await call(token, 'POST', `/inspections/${inspection.id}/submit`);
  return inspection.id as number;
}

// Real-world positions for the demo flats.
const PLACES = {
  'Flat 402, Lakeview': { latitude: 12.91164, longitude: 77.64738 }, // HSR Layout, Bengaluru
  '12 Carter Road': { latitude: 19.06492, longitude: 72.82318 }, // Bandra West, Mumbai
  '7 Lodhi Estate': { latitude: 28.58817, longitude: 77.22337 }, // Lodhi Estate, New Delhi
};
const jitter = (p: { latitude: number; longitude: number }, i: number) => ({
  latitude: p.latitude + Math.sin(i * 2.1) * 0.00018, // ~20 m
  longitude: p.longitude + Math.cos(i * 1.7) * 0.00018,
});

/**
 * Demo data created before photo locations existed: pin the demo flats and
 * give their photos device locations near the flat (one deliberately far
 * away, to show the warning). Only touches the demo accounts' records.
 */
async function backfillDemoLocations() {
  const demo = await prisma.user.findMany({ where: { email: { in: ['tenant@rentshield.dev', 'landlord@rentshield.dev'] } }, select: { id: true } });
  const demoIds = demo.map((u) => u.id);
  for (const [prefix, place] of Object.entries(PLACES)) {
    const props = await prisma.property.findMany({
      where: { addressLine: { startsWith: prefix }, leases: { some: { OR: [{ tenantId: { in: demoIds } }, { landlordId: { in: demoIds } }] } } },
    });
    for (const prop of props) {
      if (prop.latitude === null) await prisma.property.update({ where: { id: prop.id }, data: place });
      const photos = await prisma.evidence.findMany({
        where: { kind: 'PHOTO', latitude: null, uploadedById: { in: demoIds }, item: { inspection: { lease: { propertyId: prop.id } } } },
        include: { item: { include: { room: true } } },
        orderBy: { id: 'asc' },
      });
      for (const [i, ph] of photos.entries()) {
        // Mumbai's leaking-tap photo: taken ~3 km away, near Bandra station.
        const far = prefix === '12 Carter Road' && ph.item?.room.name === 'Bathroom 1';
        const at = far ? { latitude: 19.0544, longitude: 72.8406 } : jitter(place, i + 1);
        await prisma.evidence.update({
          where: { id: ph.id },
          data: { ...at, locationSource: 'DEVICE', takenAt: new Date(ph.uploadedAt.getTime() - 60_000) },
        });
      }
    }
  }
}

async function main() {
  if (await prisma.user.findUnique({ where: { email: 'tenant@rentshield.dev' } })) {
    await backfillDemoLocations();
    console.log('Demo data already present; locations backfilled.');
    return;
  }
  const server = createServer(createApp()).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;

  try {
    const tenant = await user('Aarav Mehta', 'tenant@rentshield.dev', 'tenant1234');
    const landlord = await user('Sunita Rao', 'landlord@rentshield.dev', 'landlord1234');

    // ---- 1. Full journey: both inspections agreed, settlement open ----
    const rooms1 = ['Living room', 'Bedroom', 'Kitchen', 'Bathroom'];
    const l1 = await tenancy(tenant, 'TENANT', landlord, {
      address: 'Flat 402, Lakeview Apartments, 5th Cross, HSR Layout',
      city: 'Bengaluru',
      rooms: rooms1,
      rent: 28000,
      deposit: 150000,
      start: '2025-06-01',
    });
    const roomMap1 = new Map((await prisma.room.findMany({ where: { property: { leases: { some: { id: l1 } } } } })).map((r) => [r.id, r.name]));

    const moveIn = await inspect(tenant, l1, 'MOVE_IN', roomMap1, {
      'Living room/Walls & paint': { photo: photo('wall', { seed: 3 }) },
      'Living room/Main door & lock': { photo: photo('door', { seed: 4 }) },
      'Bedroom/Walls & paint': { photo: photo('wall', { seed: 5 }), notes: 'Fresh paint, no marks' },
      'Bedroom/Floor': { photo: photo('floor', { seed: 6 }) },
      'Kitchen/Sink & taps': { photo: photo('sink', { seed: 8 }) },
      'Bathroom/Taps & shower': { condition: 'FAIR', notes: 'Shower head slightly loose', photo: photo('tap', { seed: 9 }) },
      'Bathroom/Floor': { photo: photo('floor', { seed: 10 }) },
    }, { electricityReading: '18342', waterReading: '0712', gasReading: '00431' });
    await call(landlord, 'POST', `/inspections/${moveIn}/approve-all`);

    const moveOut = await inspect(tenant, l1, 'MOVE_OUT', roomMap1, {
      'Living room/Walls & paint': { photo: photo('wall', { seed: 13, shift: 6 }) },
      'Living room/Main door & lock': { photo: photo('door', { seed: 14, shift: 4 }) },
      'Bedroom/Walls & paint': { condition: 'DAMAGED', notes: 'Damp patch and hairline crack near the window', photo: photo('wall', { seed: 15, shift: 8, damage: true }) },
      'Bedroom/Floor': { photo: photo('floor', { seed: 16, shift: 5 }) },
      'Kitchen/Sink & taps': { condition: 'DAMAGED', notes: 'Tap drips; rust mark in basin', photo: photo('sink', { seed: 18, shift: 6, damage: true }) },
      'Bathroom/Taps & shower': { condition: 'FAIR', notes: 'Same as move-in', photo: photo('tap', { seed: 19, shift: 3 }) },
      'Bathroom/Floor': { photo: photo('floor', { seed: 20, shift: 4 }) },
    }, { electricityReading: '22917', waterReading: '0988', gasReading: '00517' });
    await call(landlord, 'POST', `/inspections/${moveOut}/approve-all`);

    const { settlement } = await call(landlord, 'POST', `/leases/${l1}/settlement`);
    const items = await prisma.inspectionItem.findMany({ where: { inspectionId: moveOut }, include: { room: true } });
    const wall = items.find((i) => i.room.name === 'Bedroom' && i.name === 'Walls & paint')!;
    const sink = items.find((i) => i.room.name === 'Kitchen' && i.name === 'Sink & taps')!;
    const d1 = await call(landlord, 'POST', `/settlements/${settlement.id}/deductions`, { itemId: wall.id, reason: 'Repaint bedroom wall and fix damp patch near window', amount: 6500 });
    await call(landlord, 'POST', `/settlements/${settlement.id}/deductions`, { itemId: sink.id, reason: 'Replace kitchen tap cartridge and clean rust stain', amount: 1800 });
    await call(landlord, 'POST', `/settlements/${settlement.id}/deductions`, { reason: 'Deep cleaning of the whole flat', amount: 3000 });
    void d1;

    // ---- 2. Move-in submitted, waiting for the landlord's review ----
    const rooms2 = ['Hall', 'Master bedroom', 'Kitchen', 'Bathroom 1', 'Balcony'];
    const l2 = await tenancy(tenant, 'TENANT', landlord, {
      address: '12 Carter Road, Sea Breeze CHS, Bandra West',
      city: 'Mumbai',
      rooms: rooms2,
      rent: 65000,
      deposit: 390000,
      start: '2026-11-01',
    });
    const roomMap2 = new Map((await prisma.room.findMany({ where: { property: { leases: { some: { id: l2 } } } } })).map((r) => [r.id, r.name]));
    await inspect(tenant, l2, 'MOVE_IN', roomMap2, {
      'Hall/Walls & paint': { photo: photo('wall', { seed: 21 }) },
      'Master bedroom/Walls & paint': { condition: 'FAIR', notes: 'Scuff marks behind the bed, about 1 m wide', photo: photo('wall', { seed: 22, damage: true }) },
      'Master bedroom/Floor': { photo: photo('floor', { seed: 23 }) },
      'Kitchen/Sink & taps': { photo: photo('sink', { seed: 24 }) },
      'Bathroom 1/Taps & shower': { condition: 'DAMAGED', notes: 'Hot water tap leaks when fully open', photo: photo('tap', { seed: 25, damage: true }) },
    }, { electricityReading: '04121', waterReading: '0093', gasReading: '' });

    // ---- 3. Just created, waiting for the landlord to join ----
    await tenancy(tenant, 'TENANT', null, {
      address: '7 Lodhi Estate, Block C',
      city: 'New Delhi',
      rooms: ['Living room', 'Bedroom', 'Kitchen', 'Bathroom'],
      rent: 42000,
      deposit: 84000,
      start: '2026-12-01',
    });

    await backfillDemoLocations();
    console.log('Seed complete: tenant@rentshield.dev / tenant1234, landlord@rentshield.dev / landlord1234');
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
