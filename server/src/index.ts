import { createServer } from 'node:http';
import { config } from './config.js';
import { createApp } from './app.js';
import { prisma } from './db.js';
import { startJobs, stopJobs } from './jobs.js';
import { logger } from './logger.js';

const server = createServer(createApp());

await startJobs();
server.listen(config.PORT, () => {
  logger.info(`RentShield API listening on http://localhost:${config.PORT} (${config.NODE_ENV})`);
});

// Graceful shutdown: finish in-flight requests and jobs before exiting.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await stopJobs();
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 15_000).unref();
  });
}
