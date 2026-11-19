import { pino } from 'pino';
import { isProd } from './config.js';

// JSON logs in production (easy for log tools to parse), pretty logs locally.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: isProd ? undefined : { target: 'pino-pretty', options: { colorize: true } },
});
