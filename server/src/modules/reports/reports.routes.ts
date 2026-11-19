import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { accessFor, requireLease } from '../../lib/access.js';
import { appendAudit, verifyChain } from '../../lib/audit.js';
import { ApiError } from '../../lib/errors.js';
import { storage } from '../../lib/storage.js';
import { requireAuth, userId } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { enqueueReport } from '../../jobs.js';

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

const idParams = z.object({ id: z.coerce.number().int().positive() });

const reportSelect = { id: true, status: true, sha256: true, error: true, createdAt: true, completedAt: true, requestedById: true };

reportsRouter.get('/leases/:id/reports', validate({ params: idParams }), async (req, res) => {
  const { id } = res.locals.params as z.infer<typeof idParams>;
  await requireLease(id, userId(req));
  const reports = await prisma.report.findMany({ where: { leaseId: id }, orderBy: { id: 'desc' }, take: 20, select: reportSelect });
  res.json({ reports });
});

/** Returns 202 straight away; the PDF is built by the background worker. */
reportsRouter.post('/leases/:id/reports', validate({ params: idParams }), async (req, res) => {
  const { id } = res.locals.params as z.infer<typeof idParams>;
  const me = userId(req);
  await requireLease(id, me);

  const pending = await prisma.report.count({ where: { leaseId: id, status: 'PENDING' } });
  if (pending > 0) throw ApiError.conflict('REPORT_PENDING', 'A report is already being generated');

  const report = await prisma.$transaction(async (tx) => {
    const r = await tx.report.create({ data: { leaseId: id, requestedById: me }, select: reportSelect });
    await appendAudit(tx, { leaseId: id, actorId: me, action: 'report.requested', entityType: 'Report', entityId: r.id });
    return r;
  });
  await enqueueReport(report.id);
  res.status(202).json({ report: await prisma.report.findUniqueOrThrow({ where: { id: report.id }, select: reportSelect }) });
});

reportsRouter.get('/reports/:id/file', validate({ params: idParams }), async (req, res, next) => {
  const { id } = res.locals.params as z.infer<typeof idParams>;
  const report = await prisma.report.findUnique({ where: { id }, include: { lease: true } });
  if (!report) throw ApiError.notFound('Report');
  accessFor(report.lease, userId(req));
  if (report.status !== 'READY' || !report.storageKey) throw ApiError.conflict('NOT_READY', 'This report is not ready yet');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="rentshield-report-${id}.pdf"`);
  res.setHeader('X-Content-SHA256', report.sha256 ?? '');
  const stream = storage.get(report.storageKey);
  stream.on('error', () => next(ApiError.notFound('Report file')));
  stream.pipe(res);
});

/** The full, hash-chained history of a tenancy, plus a fresh integrity check. */
reportsRouter.get('/leases/:id/audit', validate({ params: idParams }), async (req, res) => {
  const { id } = res.locals.params as z.infer<typeof idParams>;
  await requireLease(id, userId(req));
  const [events, chain] = await Promise.all([
    prisma.auditEvent.findMany({
      where: { leaseId: id },
      orderBy: { id: 'asc' },
      include: { actor: { select: { id: true, name: true } } },
    }),
    verifyChain(id),
  ]);
  res.json({ events, chain });
});
