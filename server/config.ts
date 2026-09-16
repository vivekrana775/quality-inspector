import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

// Paths are relative to the working directory; the npm scripts always run from the project root.
if (existsSync('.env')) process.loadEnvFile('.env');

const env = process.env;

export const databasePath = env.DATABASE_PATH || './data/inspections.sqlite';
export const host = env.HOST || '127.0.0.1';
export const port = Number(env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be an integer between 1 and 65535.');
export const staticDir = resolve('dist/client');

export const appPassword = env.APP_PASSWORD || 'supervisor';
export const sapWebhookSecret = env.SAP_WEBHOOK_SECRET || 'sap-dev-secret';

// Without AUTH_SECRET we generate one and keep it next to the database, so sessions
// survive restarts (and tsx reloads while developing).
export const authSecret =
  env.AUTH_SECRET ||
  (databasePath === ':memory:'
    ? randomBytes(32).toString('hex')
    : storedSecret(join(dirname(databasePath), 'session-secret')));

function storedSecret(path: string) {
  try {
    const existing = readFileSync(path, 'utf8').trim();
    if (existing) return existing;
  } catch {
    // First run; fall through and create it.
  }
  const secret = randomBytes(32).toString('hex');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, secret, { mode: 0o600 });
  return secret;
}

// Printed at startup so the defaults don't get shipped by accident.
export const warnings = [
  !env.APP_PASSWORD && 'APP_PASSWORD is not set; using the default password "supervisor".',
  !env.SAP_WEBHOOK_SECRET && 'SAP_WEBHOOK_SECRET is not set; using the default "sap-dev-secret".',
].filter((message): message is string => Boolean(message));
