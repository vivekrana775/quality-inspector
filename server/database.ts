import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  severities,
  type CreateInspection,
  type Inspection,
  type InspectionFilters,
  type Summary,
} from '../shared/schema.js';

export class InspectionStore {
  readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path, { timeout: 5000 });
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS inspections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        machineId TEXT NOT NULL CHECK(length(trim(machineId)) BETWEEN 1 AND 100),
        defectType TEXT NOT NULL CHECK(defectType IN ('Weave Defect', 'Shade Variation', 'Hole/Tear', 'Count Deviation', 'Other')),
        severity TEXT NOT NULL CHECK(severity IN ('Critical', 'Major', 'Minor')),
        remarks TEXT NOT NULL DEFAULT '' CHECK(length(remarks) <= 2000),
        status TEXT NOT NULL DEFAULT 'Open' CHECK(status IN ('Open', 'Resolved')),
        resolutionNote TEXT,
        createdAt TEXT NOT NULL,
        resolvedAt TEXT,
        source TEXT NOT NULL CHECK(source IN ('Manual', 'SAP')),
        CHECK((status = 'Open' AND resolutionNote IS NULL AND resolvedAt IS NULL)
          OR (status = 'Resolved' AND resolutionNote IS NOT NULL AND length(trim(resolutionNote)) BETWEEN 1 AND 2000 AND resolvedAt IS NOT NULL))
      );
      CREATE INDEX IF NOT EXISTS inspections_date ON inspections(date DESC, id DESC);
      CREATE INDEX IF NOT EXISTS inspections_status_severity ON inspections(status, severity);
      PRAGMA user_version = 1;
    `);
  }

  create(input: CreateInspection, source: Inspection['source'] = 'Manual'): Inspection {
    const result = this.db
      .prepare(
        `INSERT INTO inspections (date, machineId, defectType, severity, remarks, createdAt, source)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.date,
        input.machineId,
        input.defectType,
        input.severity,
        input.remarks,
        new Date().toISOString(),
        source,
      );
    return this.get(Number(result.lastInsertRowid))!;
  }

  get(id: number): Inspection | undefined {
    return this.db.prepare('SELECT * FROM inspections WHERE id = ?').get(id) as unknown as
      Inspection | undefined;
  }

  list(filters: InspectionFilters): Inspection[] {
    const conditions: string[] = [];
    const values: string[] = [];
    for (const [field, operator, value] of [
      ['severity', '=', filters.severity],
      ['status', '=', filters.status],
      ['date', '>=', filters.dateFrom],
      ['date', '<=', filters.dateTo],
    ] as const) {
      if (value) {
        conditions.push(`${field} ${operator} ?`);
        values.push(value);
      }
    }
    // SQL identifiers cannot be bound. Select them only from these fixed maps.
    const sort = {
      date: 'date',
      machineId: 'machineId COLLATE NOCASE',
      status: 'status',
      severity: "CASE severity WHEN 'Minor' THEN 1 WHEN 'Major' THEN 2 ELSE 3 END",
    }[filters.sortBy];
    const direction = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';
    return this.db
      .prepare(
        `SELECT * FROM inspections ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY ${sort} ${direction}, id DESC`,
      )
      .all(...values) as unknown as Inspection[];
  }

  resolve(id: number, note: string): 'resolved' | 'missing' | 'conflict' {
    // One conditional UPDATE prevents concurrent requests from overwriting the first resolution.
    const result = this.db
      .prepare(
        "UPDATE inspections SET status = 'Resolved', resolutionNote = ?, resolvedAt = ? WHERE id = ? AND status = 'Open'",
      )
      .run(note, new Date().toISOString(), id);
    return result.changes ? 'resolved' : this.get(id) ? 'conflict' : 'missing';
  }

  summary(): Summary {
    const rows = this.db
      .prepare(
        'SELECT severity, status, count(*) AS count FROM inspections GROUP BY severity, status',
      )
      .all() as unknown as { severity: string; status: string; count: number }[];
    const bySeverity = severities.map((severity) => ({
      severity,
      open: rows.find((row) => row.severity === severity && row.status === 'Open')?.count ?? 0,
      resolved:
        rows.find((row) => row.severity === severity && row.status === 'Resolved')?.count ?? 0,
    }));
    const open = bySeverity.reduce((sum, row) => sum + row.open, 0);
    const resolved = bySeverity.reduce((sum, row) => sum + row.resolved, 0);
    return { total: open + resolved, open, resolved, bySeverity };
  }

  close() {
    this.db.close();
  }
}
