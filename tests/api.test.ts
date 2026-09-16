import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { signSession } from '../server/auth.js';
import { InspectionStore, migrations } from '../server/database.js';
import { createInspectionSchema, type Inspection } from '../shared/schema.js';

const PASSWORD = 'test-password';
const SECRET = 'test-secret';
const WEBHOOK = 'test-webhook';
const options = { password: PASSWORD, sessionSecret: SECRET, webhookSecret: WEBHOOK };

const valid = {
  date: '2026-09-16',
  machineId: 'LOOM-A12',
  defectType: 'Weave Defect',
  severity: 'Critical',
  remarks: 'Broken warp threads.',
};

let store: InspectionStore;
let app: ReturnType<typeof createApp>;
let agent: ReturnType<typeof request.agent>;

// Most tests talk to the API as a signed-in supervisor.
async function signedIn(target: ReturnType<typeof createApp>) {
  const session = request.agent(target);
  await session.post('/api/auth/login').send({ password: PASSWORD }).expect(200);
  return session;
}

beforeEach(async () => {
  store = new InspectionStore(':memory:');
  app = createApp(store, options);
  agent = await signedIn(app);
});
afterEach(() => store.close());

const create = (overrides: Record<string, unknown> = {}) =>
  agent.post('/api/inspections').send({ ...valid, ...overrides });
const webhook = (body: Record<string, unknown>, token = WEBHOOK) =>
  request(app).post('/api/sap-webhook').set('Authorization', `Bearer ${token}`).send(body);

describe('Authentication', () => {
  it('keeps inspection routes behind the session cookie', async () => {
    for (const call of [
      request(app).get('/api/inspections'),
      request(app).get('/api/inspections/summary'),
      request(app).get('/api/inspections/1'),
      request(app).post('/api/inspections').send(valid),
      request(app).patch('/api/inspections/1/resolve').send({ resolutionNote: 'x' }),
    ]) {
      const response = await call;
      assert.equal(response.status, 401);
      assert.equal(response.body.error.code, 'UNAUTHORIZED');
    }
    assert.equal((await request(app).get('/api/health')).status, 200);
    assert.equal(store.summary().total, 0);
  });
  it('signs in, reports the session and signs out', async () => {
    const anonymous = request.agent(app);
    assert.equal((await anonymous.get('/api/auth/session')).body.data.authenticated, false);
    assert.equal((await anonymous.post('/api/auth/login').send({})).status, 400);
    const wrong = await anonymous.post('/api/auth/login').send({ password: 'nope' });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.error.code, 'INVALID_PASSWORD');

    const login = await anonymous.post('/api/auth/login').send({ password: PASSWORD });
    assert.equal(login.status, 200);
    const cookie = String(login.headers['set-cookie']);
    assert.match(cookie, /^session=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Max-Age=43200/);
    assert.equal((await anonymous.get('/api/auth/session')).body.data.authenticated, true);
    assert.equal((await anonymous.get('/api/inspections')).status, 200);

    assert.equal((await anonymous.post('/api/auth/logout')).status, 200);
    assert.equal((await anonymous.get('/api/auth/session')).body.data.authenticated, false);
    assert.equal((await anonymous.get('/api/inspections')).status, 401);
  });
  it('rejects forged, foreign and expired session tokens', async () => {
    const good = signSession(SECRET);
    for (const token of [
      `${good.slice(0, -1)}x`,
      signSession('another-secret'),
      signSession(SECRET, Date.now() - 1000),
      'not-a-token',
    ]) {
      const response = await request(app).get('/api/inspections').set('Cookie', `session=${token}`);
      assert.equal(response.status, 401, token);
    }
    const response = await request(app)
      .get('/api/inspections')
      .set('Cookie', `other=1; session=${good}; theme=dark`);
    assert.equal(response.status, 200);
  });
  it('protects the SAP webhook with its own bearer secret', async () => {
    assert.equal((await request(app).post('/api/sap-webhook').send(valid)).status, 401);
    assert.equal((await webhook(valid, 'wrong')).status, 401);
    const cookieOnly = await agent.post('/api/sap-webhook').send(valid);
    assert.equal(cookieOnly.status, 401);
    assert.equal((await webhook(valid)).status, 201);
  });
});

describe('Inspection creation and retrieval', () => {
  it('creates an Open inspection, trims text, sets UTC timestamps and location', async () => {
    const response = await create({
      machineId: '  LOOM-09  ',
      remarks: '  Observed during shift.  ',
    });
    assert.equal(response.status, 201);
    const record = response.body.data;
    assert.equal(response.headers.location, `/api/inspections/${record.id}`);
    assert.equal(record.machineId, 'LOOM-09');
    assert.equal(record.remarks, 'Observed during shift.');
    assert.equal(record.date, valid.date);
    assert.equal(record.status, 'Open');
    assert.equal(record.resolutionNote, null);
    assert.equal(record.resolvedAt, null);
    assert.equal(record.source, 'Manual');
    assert.equal(record.clientRef, null);
    assert.match(record.createdAt, /Z$/);
    assert.deepEqual((await agent.get(`/api/inspections/${record.id}`)).body.data, record);
  });
  it('accepts optional remarks and leap-day dates', async () => {
    const { remarks: _, ...withoutRemarks } = valid;
    const response = await agent
      .post('/api/inspections')
      .send({ ...withoutRemarks, date: '2024-02-29' });
    assert.equal(response.status, 201);
    assert.equal(response.body.data.remarks, '');
  });
  for (const [label, overrides] of [
    ['blank machine ID', { machineId: ' \n ' }],
    ['invalid date', { date: '2026-02-30' }],
    ['non-leap-year February 29', { date: '2025-02-29' }],
    ['timestamp instead of date', { date: '2026-09-16T00:00:00Z' }],
    ['year zero', { date: '0000-01-01' }],
    ['invalid severity', { severity: 'Urgent' }],
    ['invalid defect type', { defectType: 'Bad' }],
    ['machine ID too long', { machineId: 'A'.repeat(101) }],
    ['remarks too long', { remarks: 'A'.repeat(2001) }],
    ['client-set status', { status: 'Resolved' }],
    ['client-set source', { source: 'SAP' }],
    ['non-UUID clientRef', { clientRef: 'abc' }],
    ['wrong type', { machineId: 100 }],
  ] as const) {
    it(`rejects ${label}`, async () => {
      const response = await create(overrides);
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, 'VALIDATION_ERROR');
      assert.ok(response.body.error.fields);
      assert.equal(store.summary().total, 0);
    });
  }
  it('returns useful errors for malformed JSON, oversized bodies, and missing routes', async () => {
    const malformed = await agent
      .post('/api/inspections')
      .set('Content-Type', 'application/json')
      .send('{bad');
    assert.equal(malformed.status, 400);
    assert.equal(malformed.body.error.code, 'INVALID_JSON');
    assert.equal((await create({ remarks: 'A'.repeat(40000) })).status, 413);
    assert.equal((await agent.get('/api/no-such-route')).status, 404);
    assert.equal((await agent.get('/api/inspections/999')).status, 404);
    assert.equal((await agent.get('/api/inspections/0')).status, 400);
    assert.equal((await agent.get('/api/inspections/1e2')).status, 400);
    assert.equal((await agent.get('/api/inspections/9007199254740992')).status, 400);
  });
});

describe('Idempotent creation', () => {
  const clientRef = '3f6b1c2e-5d4a-4b8c-9e1f-2a3b4c5d6e7f';
  it('returns the original record when the same clientRef is sent again', async () => {
    const first = await create({ clientRef });
    assert.equal(first.status, 201);
    assert.equal(first.body.data.clientRef, clientRef);
    const again = await create({ clientRef, remarks: 'Different text this time.' });
    assert.equal(again.status, 200);
    assert.deepEqual(again.body.data, first.body.data);
    assert.equal(store.summary().total, 1);
    const other = await create({ clientRef: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' });
    assert.equal(other.status, 201);
    assert.equal(store.summary().total, 2);
  });
  it('deduplicates SAP events by eventId', async () => {
    const first = await webhook({ ...valid, eventId: 'QN-100045' });
    assert.equal(first.status, 201);
    assert.equal(first.body.data.clientRef, 'sap:QN-100045');
    const retry = await webhook({ ...valid, eventId: 'QN-100045' });
    assert.equal(retry.status, 200);
    assert.equal(retry.body.data.id, first.body.data.id);
    assert.equal(store.summary().total, 1);
    assert.equal((await webhook({ ...valid, clientRef })).status, 400);
    assert.equal((await create({ eventId: 'QN-1' })).status, 400);
  });
});

describe('Filtering, sorting and summaries', () => {
  async function fixture() {
    const first = (await create({ date: '2026-09-14', machineId: 'Alpha', severity: 'Minor' })).body
      .data;
    const second = (await create({ date: '2026-09-15', machineId: 'bravo', severity: 'Major' }))
      .body.data;
    const third = (await create({ date: '2026-09-16', machineId: 'Charlie', severity: 'Critical' }))
      .body.data;
    const fourth = (await create({ date: '2026-09-16', machineId: 'Delta', severity: 'Critical' }))
      .body.data;
    await agent.patch(`/api/inspections/${third.id}/resolve`).send({ resolutionNote: 'Fixed.' });
    return [first, second, third, fourth] as Inspection[];
  }
  it('returns an empty list and all severity rows with zero counts', async () => {
    assert.deepEqual((await agent.get('/api/inspections')).body.data, []);
    assert.deepEqual((await agent.get('/api/inspections/summary')).body.data, {
      total: 0,
      open: 0,
      resolved: 0,
      bySeverity: [
        { severity: 'Critical', open: 0, resolved: 0 },
        { severity: 'Major', open: 0, resolved: 0 },
        { severity: 'Minor', open: 0, resolved: 0 },
      ],
    });
  });
  it('combines filters and includes both date boundaries', async () => {
    const records = await fixture();
    const response = await agent.get('/api/inspections').query({
      severity: 'Critical',
      status: 'Open',
      dateFrom: '2026-09-16',
      dateTo: '2026-09-16',
    });
    assert.deepEqual(
      response.body.data.map((record: Inspection) => record.id),
      [records[3].id],
    );
    const range = await agent
      .get('/api/inspections')
      .query({ dateFrom: '2026-09-14', dateTo: '2026-09-15' });
    assert.deepEqual(
      range.body.data.map((record: Inspection) => record.id),
      [records[1].id, records[0].id],
    );
    assert.equal(
      (await agent.get('/api/inspections').query({ dateFrom: '2026-09-17' })).body.data.length,
      0,
    );
    assert.equal(
      (await agent.get('/api/inspections').query({ status: 'Resolved' })).body.data.length,
      1,
    );
  });
  it('sorts by date with deterministic ties, severity, machine and status', async () => {
    const records = await fixture();
    const list = async (query: Record<string, string> = {}) =>
      (await agent.get('/api/inspections').query(query)).body.data as Inspection[];
    assert.deepEqual(
      (await list()).map((r) => r.id),
      [records[3].id, records[2].id, records[1].id, records[0].id],
    );
    assert.equal((await list({ sortBy: 'date', sortOrder: 'asc' }))[0].machineId, 'Alpha');
    assert.deepEqual(
      (await list({ sortBy: 'severity', sortOrder: 'desc' })).map((r) => r.severity),
      ['Critical', 'Critical', 'Major', 'Minor'],
    );
    assert.deepEqual(
      (await list({ sortBy: 'severity', sortOrder: 'asc' })).map((r) => r.severity),
      ['Minor', 'Major', 'Critical', 'Critical'],
    );
    assert.deepEqual(
      (await list({ sortBy: 'machineId', sortOrder: 'asc' })).map((r) => r.machineId),
      ['Alpha', 'bravo', 'Charlie', 'Delta'],
    );
    assert.equal((await list({ sortBy: 'status', sortOrder: 'desc' }))[0].status, 'Resolved');
  });
  it('rejects invalid ranges, duplicate query values, unknown fields and SQL sort injection', async () => {
    for (const query of [
      { dateFrom: '2026-09-17', dateTo: '2026-09-16' },
      { dateFrom: '2026-13-01' },
      { sortBy: 'date; DROP TABLE inspections' },
      { severity: 'Anything' },
      { sortOrder: 'sideways' },
      { typo: 'x' },
    ])
      assert.equal((await agent.get('/api/inspections').query(query)).status, 400);
    assert.equal((await agent.get('/api/inspections?status=Open&status=Resolved')).status, 400);
    assert.equal(store.summary().total, 0);
  });
  it('stores SQL-like machine text safely without executing it', async () => {
    const machineId = "'; DROP TABLE inspections; --";
    assert.equal((await create({ machineId })).status, 201);
    assert.equal((await agent.get('/api/inspections')).body.data[0].machineId, machineId);
  });
  it('keeps global summary counts correct after resolution', async () => {
    await fixture();
    const summary = (await agent.get('/api/inspections/summary')).body.data;
    assert.equal(summary.total, 4);
    assert.equal(summary.open, 3);
    assert.equal(summary.resolved, 1);
    assert.deepEqual(summary.bySeverity[0], { severity: 'Critical', open: 1, resolved: 1 });
    assert.deepEqual(summary.bySeverity[1], { severity: 'Major', open: 1, resolved: 0 });
    assert.deepEqual(summary.bySeverity[2], { severity: 'Minor', open: 1, resolved: 0 });
  });
});

describe('Resolution, SAP and persistence', () => {
  it('requires a nonblank note and preserves the first resolution', async () => {
    const id = (await create()).body.data.id;
    for (const payload of [{}, { resolutionNote: '  \n ' }, { resolutionNote: 'A'.repeat(2001) }]) {
      assert.equal((await agent.patch(`/api/inspections/${id}/resolve`).send(payload)).status, 400);
    }
    assert.equal(store.get(id)?.status, 'Open');
    const first = await agent
      .patch(`/api/inspections/${id}/resolve`)
      .send({ resolutionNote: '  Replaced guide; checked sample.  ' });
    assert.equal(first.status, 200);
    assert.equal(first.body.data.resolutionNote, 'Replaced guide; checked sample.');
    assert.match(first.body.data.resolvedAt, /Z$/);
    const repeated = await agent
      .patch(`/api/inspections/${id}/resolve`)
      .send({ resolutionNote: 'Overwrite.' });
    assert.equal(repeated.status, 409);
    assert.equal(repeated.body.error.code, 'ALREADY_RESOLVED');
    assert.deepEqual((await agent.get(`/api/inspections/${id}`)).body.data, first.body.data);
    assert.equal(
      (await agent.patch('/api/inspections/999/resolve').send({ resolutionNote: 'Fixed.' })).status,
      404,
    );
  });
  it('lets exactly one of two competing resolutions succeed', async () => {
    const id = (await create()).body.data.id;
    const responses = await Promise.all(
      ['First action.', 'Second action.'].map((resolutionNote) =>
        agent.patch(`/api/inspections/${id}/resolve`).send({ resolutionNote }),
      ),
    );
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
    assert.equal(
      store.get(id)?.resolutionNote,
      responses.find((r) => r.status === 200)?.body.data.resolutionNote,
    );
  });
  it('creates SAP inspections through the same rules and exposes them in the list and summary', async () => {
    const response = await webhook(valid);
    assert.equal(response.status, 201);
    assert.equal(response.body.data.source, 'SAP');
    assert.equal(response.body.data.status, 'Open');
    assert.equal((await agent.get('/api/inspections')).body.data[0].id, response.body.data.id);
    assert.equal((await agent.get('/api/inspections/summary')).body.data.open, 1);
    assert.equal((await webhook({ ...valid, severity: 'Invalid' })).status, 400);
  });
  it('persists records and resolution notes when the database and app are restarted', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'quality-persistence-'));
    const path = join(directory, 'data.sqlite');
    const original = new InspectionStore(path);
    let reopened: InspectionStore | undefined;
    try {
      const session = await signedIn(createApp(original, options));
      const created = (await session.post('/api/inspections').send(valid)).body.data;
      await session
        .patch(`/api/inspections/${created.id}/resolve`)
        .send({ resolutionNote: 'Repaired and verified.' });
      original.close();
      reopened = new InspectionStore(path);
      const result = await (
        await signedIn(createApp(reopened, options))
      ).get(`/api/inspections/${created.id}`);
      assert.equal(result.status, 200);
      assert.equal(result.body.data.status, 'Resolved');
      assert.equal(result.body.data.resolutionNote, 'Repaired and verified.');
      assert.equal(reopened.summary().resolved, 1);
    } finally {
      if (original.isOpen) original.close();
      reopened?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('upgrades a version 1 database file in place', () => {
    const directory = mkdtempSync(join(tmpdir(), 'quality-migration-'));
    const path = join(directory, 'old.sqlite');
    // Build the file the way the first release did: schema v1, no clientRef column.
    const legacy = new DatabaseSync(path);
    legacy.exec(`${migrations[0]} PRAGMA user_version = 1;`);
    legacy
      .prepare(
        'INSERT INTO inspections (date, machineId, defectType, severity, remarks, createdAt, source) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run('2026-09-01', 'OLD-01', 'Other', 'Minor', '', new Date().toISOString(), 'Manual');
    legacy.close();
    let upgraded: InspectionStore | undefined;
    try {
      upgraded = new InspectionStore(path);
      assert.equal(upgraded.get(1)?.clientRef, null);
      const clientRef = '9b2d1f7e-3c4a-4d5e-8f6a-7b8c9d0e1f2a';
      upgraded.create(createInspectionSchema.parse({ ...valid, clientRef }));
      assert.equal(upgraded.findByClientRef(clientRef)?.machineId, valid.machineId);
      upgraded.close();
      upgraded = new InspectionStore(path);
      assert.equal(upgraded.summary().total, 2);
    } finally {
      upgraded?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
