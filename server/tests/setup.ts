import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Tests need a real Postgres. Locally they use TEST_DATABASE_URL from
// server/.env; CI sets DATABASE_URL directly (see .github/workflows/ci.yml).
if (fs.existsSync('.env')) process.loadEnvFile('.env');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
process.env.JWT_SECRET ??= 'test-secret-at-least-16-chars';
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rentshield-test-'));
