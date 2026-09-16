import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../server/app.js';
import { InspectionStore } from '../server/database.js';

// Browser tests get a throwaway database and fixed secrets; see playwright.config.ts.
const port = Number(process.env.PORT || 3101);
const directory = mkdtempSync(join(tmpdir(), 'quality-browser-'));
const store = new InspectionStore(join(directory, 'test.sqlite'));
const app = createApp(store, {
  password: 'e2e-password',
  sessionSecret: 'e2e-secret',
  webhookSecret: 'e2e-webhook',
  staticDir: resolve('dist/client'),
});
const server = app.listen(port, '127.0.0.1');
server.on('error', (error) => {
  console.error(`Browser test server could not start on port ${port}: ${error.message}`);
  process.exit(1);
});
const shutdown = () =>
  server.close(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
    process.exit(0);
  });
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
