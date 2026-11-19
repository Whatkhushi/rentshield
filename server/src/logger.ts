import { pino } from 'pino';
import { isProd } from './config.js';

// JSON logs in production (easy for log tools to parse), pretty logs locally.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  // Locally: one readable line per request (details stay in production JSON logs).
  transport: isProd ? undefined : { target: 'pino-pretty', options: { colorize: true, ignore: 'pid,hostname,req,res,responseTime' } },
});
