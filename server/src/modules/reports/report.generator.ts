import { Readable } from 'node:stream';
import PDFDocument from 'pdfkit';
import { prisma } from '../../db.js';
import { logger } from '../../logger.js';
import { verifyChain } from '../../lib/audit.js';
import { storage } from '../../lib/storage.js';
import { totals } from '../settlements/settlements.routes.js';

// Built-in PDF fonts don't include the ₹ glyph, so amounts use "Rs.".
const rs = (n: number) => `Rs. ${n.toLocaleString('en-IN')}`;
const fmt = (d: Date | null | undefined) =>
  d ? d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }) : '-';
const label = (s: string | null | undefined) => (s ? s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '-');

const BRAND = '#0f5132';
const MUTED = '#555555';

async function readAll(key: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of storage.get(key)) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

async function loadEverything(leaseId: number) {
  return prisma.lease.findUniqueOrThrow({
    where: { id: leaseId },
    include: {
      property: { include: { rooms: { orderBy: { sortOrder: 'asc' } } } },
      landlord: true,
      tenant: true,
      inspections: {
        orderBy: { type: 'asc' },
        include: { items: { orderBy: [{ roomId: 'asc' }, { sortOrder: 'asc' }], include: { evidence: { orderBy: { id: 'asc' } } } } },
      },
      settlement: { include: { deductions: { orderBy: { id: 'asc' }, include: { evidence: true, item: { include: { room: true } } } } } },
      auditEvents: { orderBy: { id: 'asc' }, include: { actor: { select: { name: true } } } },
    },
  });
}

/** Build the PDF in memory, store it, and record its own SHA-256. */
export async function generateReport(reportId: number) {
  const report = await prisma.report.findUniqueOrThrow({ where: { id: reportId } });
  try {
    const data = await loadEverything(report.leaseId);
    const chain = await verifyChain(report.leaseId);
    const pdf = await render(data, chain, reportId);
    const stored = await storage.put(Readable.from(pdf), '.pdf');
    await prisma.report.update({
      where: { id: reportId },
      data: { status: 'READY', storageKey: stored.key, sha256: stored.sha256, completedAt: new Date() },
    });
  } catch (err) {
    logger.error({ err, reportId }, 'Report generation failed');
    await prisma.report.update({
      where: { id: reportId },
      data: { status: 'FAILED', error: (err as Error).message.slice(0, 500), completedAt: new Date() },
    });
  }
}

type Data = Awaited<ReturnType<typeof loadEverything>>;

async function render(d: Data, chain: Awaited<ReturnType<typeof verifyChain>>, reportId: number): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, info: { Title: `RentShield report #${reportId}` } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const width = doc.page.width - 96;
  const rooms = new Map(d.property.rooms.map((r) => [r.id, r.name]));
  const users = new Map([d.landlord, d.tenant].filter(Boolean).map((u) => [u!.id, u!.name]));

  const h1 = (t: string) => doc.moveDown(0.5).font('Helvetica-Bold').fontSize(16).fillColor(BRAND).text(t).moveDown(0.3);
  const h2 = (t: string) => doc.moveDown(0.6).font('Helvetica-Bold').fontSize(12).fillColor('#111').text(t).moveDown(0.2);
  const body = (t: string, color = '#111') => doc.font('Helvetica').fontSize(9.5).fillColor(color).text(t, { width });
  const kv = (k: string, v: string) =>
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(MUTED).text(`${k}: `, { continued: true }).font('Helvetica').fillColor('#111').text(v);
  const ensure = (space: number) => {
    if (doc.y + space > doc.page.height - 60) doc.addPage();
  };

  // ---- Cover ----
  doc.rect(0, 0, doc.page.width, 110).fill(BRAND);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(22).text('RentShield', 48, 36);
  doc.font('Helvetica').fontSize(11).text('Rental handover & deposit settlement record', 48, 64);
  doc.fillColor('#111').moveDown(3);
  doc.y = 130;

  h1('Tenancy');
  kv('Property', `${d.property.addressLine}, ${d.property.city} (${label(d.property.propertyType)})`);
  kv('Landlord', d.landlord ? `${d.landlord.name} <${d.landlord.email}>` : 'Not joined');
  kv('Tenant', d.tenant ? `${d.tenant.name} <${d.tenant.email}>` : 'Not joined');
  kv('Tenancy start', d.startDate.toISOString().slice(0, 10));
  kv('Monthly rent', rs(d.monthlyRent));
  kv('Security deposit', rs(d.securityDeposit));
  kv('Report generated', fmt(new Date()));
  kv('Audit chain', chain.valid ? `Intact (${chain.count} events verified)` : `BROKEN at event #${chain.brokenAtEventId}`);

  doc.moveDown(0.6);
  body(
    'This report is an organised record of what both parties documented and acknowledged in RentShield. File fingerprints (SHA-256) show whether stored files changed after upload; they do not prove when or where a photo was taken. This is not a legal opinion or a guaranteed legal document.',
    MUTED,
  );

  // ---- Inspections ----
  for (const insp of d.inspections) {
    doc.addPage();
    h1(insp.type === 'MOVE_IN' ? 'Move-in inspection' : 'Move-out inspection');
    kv('Status', label(insp.status));
    kv('Documented by', users.get(insp.authorId) ?? '-');
    kv('Submitted', fmt(insp.submittedAt));
    kv('Agreed by both parties', fmt(insp.finalizedAt));
    kv('Meter readings', `Electricity ${insp.electricityReading ?? '-'} | Water ${insp.waterReading ?? '-'} | Gas ${insp.gasReading ?? '-'}`);
    if (insp.generalNotes) kv('Notes', insp.generalNotes);

    const approved = insp.items.filter((i) => i.reviewStatus === 'APPROVED').length;
    const disputed = insp.items.filter((i) => i.reviewStatus === 'DISPUTED').length;
    kv('Items', `${insp.items.length} total | ${approved} agreed | ${disputed} disputed | ${insp.items.length - approved - disputed} pending`);

    let currentRoom = -1;
    for (const it of insp.items) {
      if (it.roomId !== currentRoom) {
        currentRoom = it.roomId;
        ensure(60);
        h2(rooms.get(it.roomId) ?? 'Room');
      }
      const photos = it.evidence.filter((e) => e.mimeType === 'image/jpeg' || e.mimeType === 'image/png').slice(0, 4);
      ensure(photos.length ? 150 : 40);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111').text(it.name, { continued: true });
      doc.font('Helvetica').fillColor(MUTED).text(`   ${label(it.condition)}  ·  ${label(it.reviewStatus)}`);
      if (it.notes) body(`Notes: ${it.notes}`);
      if (it.reviewComment) body(`Reviewer: ${it.reviewComment}`, '#9a3412');
      if (photos.length) {
        const y = doc.y + 4;
        let x = 48;
        for (const p of photos) {
          try {
            doc.image(await readAll(p.storageKey), x, y, { fit: [118, 88] });
            doc.font('Helvetica').fontSize(6).fillColor(MUTED).text(`#${p.id} ${p.sha256.slice(0, 12)}…`, x, y + 90, { width: 118 });
          } catch {
            doc.font('Helvetica').fontSize(7).fillColor('#b91c1c').text(`Photo #${p.id} unavailable`, x, y + 40, { width: 118 });
          }
          x += 126;
        }
        doc.x = 48;
        doc.y = y + 104;
      }
      const skipped = it.evidence.length - photos.length;
      if (skipped > 0) body(`+ ${skipped} more file(s), listed in the fingerprint appendix`, MUTED);
      doc.moveDown(0.4);
    }
  }

  // ---- Settlement ----
  doc.addPage();
  h1('Deposit settlement');
  if (!d.settlement) {
    body('No settlement has been opened yet.', MUTED);
  } else {
    const s = d.settlement;
    const t = totals(s, s.deductions);
    kv('Status', label(s.status));
    kv('Deposit', rs(t.deposit));
    kv('Accepted deductions', rs(t.accepted));
    kv('Still open', rs(t.open));
    kv('Landlord confirmed', fmt(s.landlordConfirmedAt));
    kv('Tenant confirmed', fmt(s.tenantConfirmedAt));
    if (s.finalRefund !== null) kv('FINAL REFUND', rs(s.finalRefund));

    h2('Deductions');
    if (s.deductions.length === 0) body('No deductions were proposed.', MUTED);
    for (const ded of s.deductions) {
      ensure(60);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111').text(`${rs(ded.amount)}  ·  ${label(ded.status)}`);
      body(`Reason: ${ded.reason}`);
      if (ded.item) body(`Linked item: ${ded.item.room.name} / ${ded.item.name} (move-out condition: ${label(ded.item.condition)})`, MUTED);
      if (ded.tenantComment) body(`Tenant: ${ded.tenantComment}`, '#9a3412');
      if (ded.evidence.length) body(`Invoices: ${ded.evidence.map((e) => `#${e.id} ${e.originalName}`).join(', ')}`, MUTED);
      doc.moveDown(0.4);
    }
  }

  // ---- Appendix: fingerprints ----
  doc.addPage();
  h1('Appendix A: File fingerprints');
  body('Each stored file was re-hashed while generating this report and compared with the fingerprint recorded at upload.', MUTED);
  doc.moveDown(0.3);
  const allEvidence = [
    ...d.inspections.flatMap((i) => i.items.flatMap((it) => it.evidence)),
    ...(d.settlement?.deductions.flatMap((x) => x.evidence) ?? []),
  ];
  for (const e of allEvidence) {
    ensure(28);
    let ok = false;
    try {
      ok = (await storage.hash(e.storageKey)) === e.sha256;
    } catch {
      ok = false;
    }
    doc.font('Helvetica-Bold').fontSize(8).fillColor(ok ? '#166534' : '#b91c1c').text(`${ok ? 'VERIFIED' : 'MISMATCH'}  #${e.id}  ${e.originalName}`);
    doc.font('Courier').fontSize(7).fillColor(MUTED).text(`${e.sha256}  ·  ${fmt(e.uploadedAt)}  ·  by ${users.get(e.uploadedById) ?? '-'}`);
  }
  if (allEvidence.length === 0) body('No files uploaded.', MUTED);

  // ---- Appendix: audit log ----
  doc.addPage();
  h1('Appendix B: Audit log');
  body(
    `Every action is chained: each entry's hash covers the previous entry's hash. Chain status: ${
      chain.valid ? `intact, ${chain.count} events` : `BROKEN at event #${chain.brokenAtEventId}`
    }.`,
    MUTED,
  );
  doc.moveDown(0.3);
  for (const ev of d.auditEvents) {
    ensure(22);
    doc.font('Helvetica').fontSize(8).fillColor('#111').text(`${fmt(ev.createdAt)}  ·  ${ev.actor?.name ?? 'system'}  ·  ${ev.action}`);
    doc.font('Courier').fontSize(6.5).fillColor(MUTED).text(ev.hash);
  }

  // Page numbers
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(`RentShield report #${reportId}  ·  page ${i + 1} of ${range.count}`, 48, doc.page.height - 36, {
      width,
      align: 'center',
      lineBreak: false,
    });
  }
  doc.end();
  return done;
}
