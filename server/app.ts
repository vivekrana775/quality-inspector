import express, { type ErrorRequestHandler, type RequestHandler, type Response } from 'express';
import { z, ZodError } from 'zod';
import {
  createInspectionSchema,
  filterSchema,
  loginSchema,
  resolveInspectionSchema,
  sapWebhookSchema,
  type CreateInspection,
  type Inspection,
} from '../shared/schema.js';
import { InspectionStore } from './database.js';
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  readCookie,
  requireBearer,
  requireSession,
  safeEqual,
  signSession,
  verifySession,
} from './auth.js';

export interface AppOptions {
  password: string;
  sessionSecret: string;
  webhookSecret: string;
  staticDir?: string;
}

const idParam = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .refine(Number.isSafeInteger);

const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, path: '/' };

const notFound = (res: Response) =>
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Inspection not found.' } });

export function createApp(store: InspectionStore, options: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/health', (_req, res) => res.json({ data: { status: 'ok' } }));

  app.post('/api/auth/login', (req, res) => {
    const { password } = loginSchema.parse(req.body);
    if (!safeEqual(password, options.password)) {
      return res
        .status(401)
        .json({ error: { code: 'INVALID_PASSWORD', message: 'Incorrect password.' } });
    }
    res.cookie(SESSION_COOKIE, signSession(options.sessionSecret), {
      ...cookieOptions,
      maxAge: SESSION_TTL_MS,
    });
    res.json({ data: { authenticated: true } });
  });
  app.get('/api/auth/session', (req, res) => {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    res.json({ data: { authenticated: verifySession(options.sessionSecret, token) } });
  });
  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, cookieOptions);
    res.json({ data: { authenticated: false } });
  });

  // Shared by the app and the SAP webhook. A repeated clientRef means the caller is
  // retrying a request whose response it never saw, so hand back the original row.
  const create =
    (source: Inspection['source'], parse: (body: unknown) => CreateInspection): RequestHandler =>
    (req, res) => {
      const input = parse(req.body);
      const existing = input.clientRef ? store.findByClientRef(input.clientRef) : undefined;
      if (existing) return res.json({ data: existing });
      const record = store.create(input, source);
      res.location(`/api/inspections/${record.id}`).status(201).json({ data: record });
    };

  app.post(
    '/api/sap-webhook',
    requireBearer(options.webhookSecret),
    create('SAP', (body) => {
      const { eventId, ...input } = sapWebhookSchema.parse(body);
      return { ...input, clientRef: eventId ? `sap:${eventId}` : undefined };
    }),
  );

  app.use('/api/inspections', requireSession(options.sessionSecret));
  app.post(
    '/api/inspections',
    create('Manual', (body) => createInspectionSchema.parse(body)),
  );
  app.get('/api/inspections', (req, res) =>
    res.json({ data: store.list(filterSchema.parse(req.query)) }),
  );
  app.get('/api/inspections/summary', (_req, res) => res.json({ data: store.summary() }));
  app.get('/api/inspections/:id', (req, res) => {
    const record = store.get(idParam.parse(req.params.id));
    if (!record) return notFound(res);
    res.json({ data: record });
  });
  app.patch('/api/inspections/:id/resolve', (req, res) => {
    const id = idParam.parse(req.params.id);
    const { resolutionNote } = resolveInspectionSchema.parse(req.body);
    const outcome = store.resolve(id, resolutionNote);
    if (outcome === 'missing') return notFound(res);
    if (outcome === 'conflict') {
      return res.status(409).json({
        error: { code: 'ALREADY_RESOLVED', message: 'This inspection is already resolved.' },
      });
    }
    res.json({ data: store.get(id) });
  });
  app.use('/api', (_req, res) =>
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API endpoint not found.' } }),
  );
  if (options.staticDir) app.use(express.static(options.staticDir));

  const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof ZodError) {
      const fields = Object.fromEntries(
        error.issues.map((issue) => [issue.path.join('.') || 'body', issue.message]),
      );
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Please check the submitted fields.', fields },
      });
    }
    if (error && typeof error === 'object' && 'type' in error) {
      if (error.type === 'entity.parse.failed') {
        return res
          .status(400)
          .json({ error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' } });
      }
      if (error.type === 'entity.too.large') {
        return res
          .status(413)
          .json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds 32 KB.' } });
      }
    }
    console.error('Request failed:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to complete the request. Please try again.',
      },
    });
  };
  app.use(errorHandler);
  return app;
}
