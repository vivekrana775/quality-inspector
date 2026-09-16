import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
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
export const authSecret = env.AUTH_SECRET || randomBytes(32).toString('hex');

// Printed at startup so the defaults don't get shipped by accident.
export const warnings = [
  !env.APP_PASSWORD && 'APP_PASSWORD is not set; using the default password "supervisor".',
  !env.SAP_WEBHOOK_SECRET && 'SAP_WEBHOOK_SECRET is not set; using the default "sap-dev-secret".',
  !env.AUTH_SECRET && 'AUTH_SECRET is not set; sessions will not survive a restart.',
].filter((message): message is string => Boolean(message));
