import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { z, ZodError } from 'zod';
import { join } from 'node:path';
import {
  createInspectionSchema,
  filterSchema,
  resolveInspectionSchema,
  type Inspection,
} from '../shared/schema.js';
import { InspectionStore } from './database.js';

export function createApp(store: InspectionStore, staticDir?: string) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '32kb' }));

  const create =
    (source: Inspection['source']): RequestHandler =>
    (req, res) => {
      const record = store.create(createInspectionSchema.parse(req.body), source);
      res.location(`/api/inspections/${record.id}`).status(201).json({ data: record });
    };
  const idSchema = z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));
  app.get('/api/health', (_req, res) => res.json({ data: { status: 'ok' } }));
  app.post('/api/inspections', create('Manual'));
  app.post('/api/sap-webhook', create('SAP'));
  app.get('/api/inspections', (req, res) =>
    res.json({ data: store.list(filterSchema.parse(req.query)) }),
  );
  app.get('/api/inspections/summary', (_req, res) => res.json({ data: store.summary() }));
  app.get('/api/inspections/:id', (req, res) => {
    const record = store.get(idSchema.parse(req.params.id));
    if (!record)
      return res
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: 'Inspection not found.' } });
    res.json({ data: record });
  });
  app.patch('/api/inspections/:id/resolve', (req, res) => {
    const id = idSchema.parse(req.params.id);
    const { resolutionNote } = resolveInspectionSchema.parse(req.body);
    const outcome = store.resolve(id, resolutionNote);
    if (outcome === 'missing')
      return res
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: 'Inspection not found.' } });
    if (outcome === 'conflict')
      return res.status(409).json({
        error: {
          code: 'ALREADY_RESOLVED',
          message: 'This inspection has already been resolved. Refresh to see its resolution.',
        },
      });
    res.json({ data: store.get(id) });
  });
  app.use('/api', (_req, res) =>
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API endpoint not found.' } }),
  );
  if (staticDir) {
    app.use(express.static(staticDir));
    app.get('/', (_req, res) => res.sendFile(join(staticDir, 'index.html')));
  }

  const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof ZodError) {
      const fields = Object.fromEntries(
        error.issues.map((issue) => [issue.path.join('.') || 'body', issue.message]),
      );
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please check the submitted fields.',
          fields,
        },
      });
    }
    if (error && typeof error === 'object' && 'type' in error) {
      if (error.type === 'entity.parse.failed')
        return res
          .status(400)
          .json({ error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' } });
      if (error.type === 'entity.too.large')
        return res
          .status(413)
          .json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds 32 KB.' } });
    }
    console.error('Request failed:', error);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to complete the request. Please try again.',
      },
    });
  };
  app.use(errorHandler);
  return app;
}
