import path from 'node:path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer, { type StorageEngine } from 'multer';
import { z } from 'zod';
import type { EvidenceKind } from '@prisma/client';
import { prisma } from '../../db.js';
import { config } from '../../config.js';
import { accessFor, requireItem } from '../../lib/access.js';
import { appendAudit } from '../../lib/audit.js';
import { ApiError } from '../../lib/errors.js';
import { storage, type StoredFile } from '../../lib/storage.js';
import { requireAuth, userId } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { itemEditable } from '../inspections/inspections.routes.js';

export const evidenceRouter = Router();
evidenceRouter.use(requireAuth);

const idParams = z.object({ id: z.coerce.number().int().positive() });

const PHOTO_TYPES: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const INVOICE_TYPES: Record<string, string> = { ...PHOTO_TYPES, 'application/pdf': '.pdf' };

/**
 * Multer storage engine that streams each file straight into our Storage
 * and computes its SHA-256 in the same pass. No temp files, and the hash is
 * of exactly the bytes the server received.
 */
type HashedFile = Express.Multer.File & StoredFile;
const hashingStorage = (types: Record<string, string>): StorageEngine => ({
  _handleFile(_req, file, cb) {
    storage
      .put(file.stream, types[file.mimetype] ?? path.extname(file.originalname))
      .then((stored) => cb(null, stored as Partial<Express.Multer.File>))
      .catch((err) => cb(err));
  },
  _removeFile(_req, file, cb) {
    storage
      .remove((file as HashedFile).key)
      .then(() => cb(null))
      .catch(cb);
  },
});

export function uploader(types: Record<string, string>) {
  return multer({
    storage: hashingStorage(types),
    limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 10 },
    fileFilter: (_req, file, cb) => {
      if (types[file.mimetype]) cb(null, true);
      else cb(ApiError.badRequest(`Unsupported file type: ${file.mimetype}`));
    },
  }).array('files', 10);
}

/** Turn multer's own errors (too big, too many files) into our 400 format. */
export function uploadErrors(err: unknown, _req: Request, _res: Response, next: NextFunction) {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? `Each file must be under ${config.MAX_UPLOAD_MB} MB` : err.message;
    return next(new ApiError(400, 'UPLOAD_REJECTED', msg));
  }
  next(err);
}

export async function recordEvidence(opts: {
  files: HashedFile[];
  kind: EvidenceKind;
  leaseId: number;
  actorId: number;
  itemId?: number;
  deductionId?: number;
}) {
  if (!opts.files?.length) throw ApiError.badRequest('No files were uploaded');
  try {
    return await prisma.$transaction(async (tx) => {
      const rows = [];
      for (const f of opts.files) {
        const row = await tx.evidence.create({
          data: {
            kind: opts.kind,
            itemId: opts.itemId ?? null,
            deductionId: opts.deductionId ?? null,
            uploadedById: opts.actorId,
            storageKey: f.key,
            originalName: f.originalname.slice(0, 200),
            mimeType: f.mimetype,
            sizeBytes: f.size,
            sha256: f.sha256,
          },
        });
        await appendAudit(tx, {
          leaseId: opts.leaseId,
          actorId: opts.actorId,
          action: 'evidence.uploaded',
          entityType: 'Evidence',
          entityId: row.id,
          data: { kind: opts.kind, itemId: opts.itemId ?? null, deductionId: opts.deductionId ?? null, sha256: f.sha256, size: f.size },
        });
        rows.push(row);
      }
      return rows;
    });
  } catch (err) {
    // DB write failed: don't leave orphan files behind.
    await Promise.all(opts.files.map((f) => storage.remove(f.key)));
    throw err;
  }
}

// ---------- Upload photos to an inspection item ----------

evidenceRouter.post(
  '/items/:id/evidence',
  validate({ params: idParams }),
  // Authorise BEFORE accepting any bytes.
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = res.locals.params as z.infer<typeof idParams>;
    const me = userId(req);
    const { item, inspection } = await requireItem(id, me);
    if (inspection.authorId !== me) throw ApiError.forbidden('Only the person documenting this inspection can add photos');
    if (!itemEditable(inspection, item)) throw ApiError.conflict('LOCKED', 'This item is locked');
    res.locals.access = { leaseId: inspection.leaseId };
    next();
  },
  uploader(PHOTO_TYPES),
  uploadErrors,
  async (req: Request, res: Response) => {
    const { id } = res.locals.params as z.infer<typeof idParams>;
    const rows = await recordEvidence({
      files: req.files as HashedFile[],
      kind: 'PHOTO',
      leaseId: res.locals.access.leaseId,
      actorId: userId(req),
      itemId: id,
    });
    res.status(201).json({ evidence: rows.map(publicEvidence) });
  },
);

export { INVOICE_TYPES };

export const publicEvidence = (e: {
  id: number;
  kind: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  uploadedAt: Date;
  uploadedById: number;
}) => ({
  id: e.id,
  kind: e.kind,
  originalName: e.originalName,
  mimeType: e.mimeType,
  sizeBytes: e.sizeBytes,
  sha256: e.sha256,
  uploadedAt: e.uploadedAt,
  uploadedById: e.uploadedById,
});

// ---------- Read / verify / delete ----------

/** Find the lease an evidence row belongs to (via its item or its deduction) and check membership. */
async function requireEvidence(id: number, me: number) {
  const ev = await prisma.evidence.findUnique({
    where: { id },
    include: {
      item: { include: { inspection: { include: { lease: true } } } },
      deduction: { include: { settlement: { include: { lease: true } } } },
    },
  });
  const lease = ev?.item?.inspection.lease ?? ev?.deduction?.settlement.lease;
  if (!ev || !lease) throw ApiError.notFound('File');
  return { ev, ...accessFor(lease, me) };
}

evidenceRouter.get('/evidence/:id/file', validate({ params: idParams }), async (req, res, next) => {
  const { id } = res.locals.params as z.infer<typeof idParams>;
  const { ev } = await requireEvidence(id, userId(req));
  res.setHeader('Content-Type', ev.mimeType);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(ev.originalName)}"`);
  res.setHeader('X-Content-SHA256', ev.sha256);
  const stream = storage.get(ev.storageKey);
  stream.on('error', () => next(ApiError.notFound('File')));
  stream.pipe(res);
});

/** Re-hash the stored bytes and compare with the fingerprint recorded at upload. */
evidenceRouter.get('/evidence/:id/verify', validate({ params: idParams }), async (req, res) => {
  const { id } = res.locals.params as z.infer<typeof idParams>;
  const { ev } = await requireEvidence(id, userId(req));
  let currentHash: string | null = null;
  try {
    currentHash = await storage.hash(ev.storageKey);
  } catch {
    // file missing
  }
  res.json({
    evidenceId: ev.id,
    recordedHash: ev.sha256,
    currentHash,
    verified: currentHash === ev.sha256,
    uploadedAt: ev.uploadedAt,
    checkedAt: new Date(),
  });
});

evidenceRouter.delete('/evidence/:id', validate({ params: idParams }), async (req, res) => {
  const { id } = res.locals.params as z.infer<typeof idParams>;
  const me = userId(req);
  const { ev, lease } = await requireEvidence(id, me);
  if (ev.uploadedById !== me) throw ApiError.forbidden('Only the uploader can remove a file');

  const editable = ev.item
    ? itemEditable(ev.item.inspection, ev.item)
    : ev.deduction?.status === 'PROPOSED' || ev.deduction?.status === 'DISPUTED';
  if (!editable) throw ApiError.conflict('LOCKED', 'Files can’t be removed once they are part of an agreed record');

  await prisma.$transaction(async (tx) => {
    await tx.evidence.delete({ where: { id } });
    await appendAudit(tx, {
      leaseId: lease.id,
      actorId: me,
      action: 'evidence.removed',
      entityType: 'Evidence',
      entityId: id,
      data: { sha256: ev.sha256 },
    });
  });
  await storage.remove(ev.storageKey);
  res.status(204).end();
});
