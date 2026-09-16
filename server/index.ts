import { existsSync } from 'node:fs';
import { createApp } from './app.js';
import { InspectionStore } from './database.js';
import {
  appPassword,
  authSecret,
  databasePath,
  host,
  port,
  sapWebhookSecret,
  staticDir,
  warnings,
} from './config.js';

const store = new InspectionStore(databasePath);
const app = createApp(store, {
  password: appPassword,
  sessionSecret: authSecret,
  webhookSecret: sapWebhookSecret,
  staticDir: existsSync(staticDir) ? staticDir : undefined,
});

const server = app.listen(port, host, () => {
  for (const warning of warnings) console.warn(`Warning: ${warning}`);
  console.log(`Quality Inspection Tracker listening on http://${host}:${port}`);
});
server.on('error', (error) => {
  console.error(error.message);
  store.close();
  process.exit(1);
});

function shutdown() {
  server.close(() => {
    store.close();
    process.exit(0);
  });
  // Browsers hold keep-alive sockets open; drop the idle ones so close() returns.
  server.closeIdleConnections();
  setTimeout(() => process.exit(1), 5000).unref();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
