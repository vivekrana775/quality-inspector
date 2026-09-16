import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../server/app.js';
import { InspectionStore } from '../server/database.js';

// Browser tests get a disposable database, never the user's local data.
const directory = mkdtempSync(join(tmpdir(), 'quality-browser-'));
const store = new InspectionStore(join(directory, 'test.sqlite'));
const server = createApp(store, resolve('dist/client')).listen(3101, '127.0.0.1');
const shutdown = () =>
  server.close(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
    process.exit(0);
  });
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
