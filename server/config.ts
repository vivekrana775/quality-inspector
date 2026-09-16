import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

if (existsSync('.env')) process.loadEnvFile('.env');
export const databasePath = process.env.DATABASE_PATH || './data/inspections.sqlite';
export const host = process.env.HOST || '127.0.0.1';
export const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be an integer between 1 and 65535.');
export const staticDir = resolve('dist/client');
