import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { InspectionStore } from '../server/database.js';
import { type Inspection } from '../shared/schema.js';

const valid = {
  date: '2026-09-16',
  machineId: 'LOOM-A12',
  defectType: 'Weave Defect',
  severity: 'Critical',
  remarks: 'Broken warp threads.',
};
let store: InspectionStore;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  store = new InspectionStore(':memory:');
  app = createApp(store);
});
afterEach(() => store.close());
const create = (overrides: Record<string, unknown> = {}) =>
  request(app)
    .post('/api/inspections')
    .send({ ...valid, ...overrides });

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
    assert.match(record.createdAt, /Z$/);
    assert.deepEqual((await request(app).get(`/api/inspections/${record.id}`)).body.data, record);
  });
  it('accepts optional remarks and leap-day dates', async () => {
    const { remarks: _, ...withoutRemarks } = valid;
    const response = await request(app)
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
    const malformed = await request(app)
      .post('/api/inspections')
      .set('Content-Type', 'application/json')
      .send('{bad');
    assert.equal(malformed.status, 400);
    assert.equal(malformed.body.error.code, 'INVALID_JSON');
    assert.equal((await create({ remarks: 'A'.repeat(40000) })).status, 413);
    assert.equal((await request(app).get('/api/no-such-route')).status, 404);
    assert.equal((await request(app).get('/api/inspections/999')).status, 404);
    assert.equal((await request(app).get('/api/inspections/0')).status, 400);
    assert.equal((await request(app).get('/api/inspections/1e2')).status, 400);
    assert.equal((await request(app).get('/api/inspections/9007199254740992')).status, 400);
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
    await request(app)
      .patch(`/api/inspections/${third.id}/resolve`)
      .send({ resolutionNote: 'Fixed.' });
    return [first, second, third, fourth] as Inspection[];
  }
  it('returns an empty list and all severity rows with zero counts', async () => {
    assert.deepEqual((await request(app).get('/api/inspections')).body.data, []);
    assert.deepEqual((await request(app).get('/api/inspections/summary')).body.data, {
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
    const response = await request(app).get('/api/inspections').query({
      severity: 'Critical',
      status: 'Open',
      dateFrom: '2026-09-16',
      dateTo: '2026-09-16',
    });
    assert.deepEqual(
      response.body.data.map((record: Inspection) => record.id),
      [records[3].id],
    );
    const range = await request(app)
      .get('/api/inspections')
      .query({ dateFrom: '2026-09-14', dateTo: '2026-09-15' });
    assert.deepEqual(
      range.body.data.map((record: Inspection) => record.id),
      [records[1].id, records[0].id],
    );
    assert.equal(
      (await request(app).get('/api/inspections').query({ dateFrom: '2026-09-17' })).body.data
        .length,
      0,
    );
    assert.equal(
      (await request(app).get('/api/inspections').query({ status: 'Resolved' })).body.data.length,
      1,
    );
  });
  it('sorts by date with deterministic ties, severity, machine and status', async () => {
    const records = await fixture();
    const list = async (query: Record<string, string> = {}) =>
      (await request(app).get('/api/inspections').query(query)).body.data as Inspection[];
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
      assert.equal((await request(app).get('/api/inspections').query(query)).status, 400);
    assert.equal(
      (await request(app).get('/api/inspections?status=Open&status=Resolved')).status,
      400,
    );
    assert.equal(store.summary().total, 0);
  });
  it('stores SQL-like machine text safely without executing it', async () => {
    const machineId = "'; DROP TABLE inspections; --";
    assert.equal((await create({ machineId })).status, 201);
    assert.equal((await request(app).get('/api/inspections')).body.data[0].machineId, machineId);
  });
  it('keeps global summary counts correct after resolution', async () => {
    await fixture();
    const summary = (await request(app).get('/api/inspections/summary')).body.data;
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
      assert.equal(
        (await request(app).patch(`/api/inspections/${id}/resolve`).send(payload)).status,
        400,
      );
    }
    assert.equal(store.get(id)?.status, 'Open');
    const first = await request(app)
      .patch(`/api/inspections/${id}/resolve`)
      .send({ resolutionNote: '  Replaced guide; checked sample.  ' });
    assert.equal(first.status, 200);
    assert.equal(first.body.data.resolutionNote, 'Replaced guide; checked sample.');
    assert.match(first.body.data.resolvedAt, /Z$/);
    const repeated = await request(app)
      .patch(`/api/inspections/${id}/resolve`)
      .send({ resolutionNote: 'Overwrite.' });
    assert.equal(repeated.status, 409);
    assert.equal(repeated.body.error.code, 'ALREADY_RESOLVED');
    assert.deepEqual((await request(app).get(`/api/inspections/${id}`)).body.data, first.body.data);
    assert.equal(
      (await request(app).patch('/api/inspections/999/resolve').send({ resolutionNote: 'Fixed.' }))
        .status,
      404,
    );
  });
  it('allows exactly one of two competing resolutions to succeed', async () => {
    const id = (await create()).body.data.id;
    const responses = await Promise.all(
      ['First action.', 'Second action.'].map((resolutionNote) =>
        request(app).patch(`/api/inspections/${id}/resolve`).send({ resolutionNote }),
      ),
    );
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
    assert.equal(
      store.get(id)?.resolutionNote,
      responses.find((r) => r.status === 200)?.body.data.resolutionNote,
    );
  });
  it('creates SAP inspections through the same rules and exposes them in the list and summary', async () => {
    const response = await request(app).post('/api/sap-webhook').send(valid);
    assert.equal(response.status, 201);
    assert.equal(response.body.data.source, 'SAP');
    assert.equal(response.body.data.status, 'Open');
    assert.equal(
      (await request(app).get('/api/inspections')).body.data[0].id,
      response.body.data.id,
    );
    assert.equal((await request(app).get('/api/inspections/summary')).body.data.open, 1);
    assert.equal(
      (
        await request(app)
          .post('/api/sap-webhook')
          .send({ ...valid, severity: 'Invalid' })
      ).status,
      400,
    );
  });
  it('persists records and resolution notes when the database and app are restarted', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'quality-persistence-'));
    const path = join(directory, 'data.sqlite');
    const original = new InspectionStore(path);
    let reopened: InspectionStore | undefined;
    try {
      const created = (await request(createApp(original)).post('/api/inspections').send(valid)).body
        .data;
      await request(createApp(original))
        .patch(`/api/inspections/${created.id}/resolve`)
        .send({ resolutionNote: 'Repaired and verified.' });
      original.close();
      reopened = new InspectionStore(path);
      const result = await request(createApp(reopened)).get(`/api/inspections/${created.id}`);
      assert.equal(result.status, 200);
      assert.equal(result.body.data.status, 'Resolved');
      assert.equal(result.body.data.resolutionNote, 'Repaired and verified.');
      assert.equal(reopened.summary().resolved, 1);
    } finally {
      if (original.db.isOpen) original.close();
      reopened?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
