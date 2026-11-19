import PgBoss from 'pg-boss';
import { config } from './config.js';
import { logger } from './logger.js';
import { generateReport } from './modules/reports/report.generator.js';

/**
 * Background jobs with pg-boss: the queue lives in the same Postgres the app
 * already uses (in its own "pgboss" schema), so there's no Redis to run.
 * Jobs survive restarts and failed jobs are retried.
 */
const REPORT_QUEUE = 'generate-report';
let boss: PgBoss | null = null;

export async function startJobs() {
  boss = new PgBoss({ connectionString: config.DATABASE_URL });
  boss.on('error', (err) => logger.error({ err }, 'pg-boss error'));
  await boss.start();
  await boss.createQueue(REPORT_QUEUE);
  await boss.work<{ reportId: number }>(REPORT_QUEUE, async ([job]) => {
    await generateReport(job.data.reportId);
  });
  logger.info('Background job worker started');
}

export async function stopJobs() {
  await boss?.stop({ graceful: true });
  boss = null;
}

/** Queue a report. Without a running worker (tests), generate it inline. */
export async function enqueueReport(reportId: number) {
  if (boss) {
    await boss.send(REPORT_QUEUE, { reportId }, { retryLimit: 2, retryDelay: 5 });
  } else {
    await generateReport(reportId);
  }
}
