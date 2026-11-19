import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { config, isProd, isTest } from './config.js';
import { prisma } from './db.js';
import { logger } from './logger.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { leasesRouter } from './modules/leases/leases.routes.js';
import { invitationsRouter } from './modules/leases/invitations.routes.js';
import { inspectionsRouter } from './modules/inspections/inspections.routes.js';
import { evidenceRouter } from './modules/evidence/evidence.routes.js';
import { settlementsRouter } from './modules/settlements/settlements.routes.js';
import { reportsRouter } from './modules/reports/reports.routes.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: isProd
        ? { directives: { 'img-src': ["'self'", 'data:', 'blob:'], 'media-src': ["'self'", 'blob:'] } }
        : false,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        autoLogging: { ignore: (req) => req.url === '/api/health' },
        // One short line per request instead of every header.
        serializers: {
          req: (req) => ({ method: req.method, url: req.url }),
          res: (res) => ({ status: res.statusCode }),
        },
        // originalUrl: the full path, even inside nested routers.
        customSuccessMessage: (req, res, ms) =>
          `${req.method} ${(req as express.Request).originalUrl ?? req.url} -> ${res.statusCode} (${Math.round(ms)}ms)`,
        customErrorMessage: (req, res) => `${req.method} ${(req as express.Request).originalUrl ?? req.url} -> ${res.statusCode}`,
      }),
    );
  }

  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', db: 'ok', uptime: Math.round(process.uptime()) });
    } catch {
      res.status(503).json({ status: 'error', db: 'unreachable' });
    }
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: isTest ? 10_000 : 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again in a few minutes' } },
  });

  const api = express.Router();
  api.use(['/auth/login', '/auth/register'], authLimiter);
  api.use('/auth', authRouter);
  api.use('/invitations', invitationsRouter);
  api.use('/leases', leasesRouter);
  // These routers define full paths (/leases/:id/inspections, /items/:id, ...)
  api.use(inspectionsRouter);
  api.use(evidenceRouter);
  api.use(settlementsRouter);
  api.use(reportsRouter);
  app.use('/api/v1', api);
  app.use('/api', notFoundHandler);

  if (config.WEB_DIST) {
    const dist = path.resolve(config.WEB_DIST);
    app.use(express.static(dist, { maxAge: '1h', index: false }));
    app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
