import { existsSync } from 'node:fs';
import { createApp } from './app.js';
import { InspectionStore } from './database.js';
import { databasePath, host, port, staticDir } from './config.js';

const store = new InspectionStore(databasePath);
const server = createApp(store, existsSync(staticDir) ? staticDir : undefined).listen(
  port,
  host,
  () => {
    console.log(`Quality Inspection Tracker: http://${host}:${port}`);
  },
);
server.on('error', (error) => {
  console.error(error.message);
  store.close();
  process.exit(1);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () =>
    server.close(() => {
      store.close();
      process.exit(0);
    }),
  );
}
