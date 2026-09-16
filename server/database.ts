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

// One entry per schema version. PRAGMA user_version records how far a file has been upgraded.
export const migrations = [
  `CREATE TABLE IF NOT EXISTS inspections (
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
  CREATE INDEX IF NOT EXISTS inspections_status_severity ON inspections(status, severity);`,
  // Idempotency key for offline replays and SAP retries. SQLite can't add a UNIQUE
  // column through ALTER TABLE, hence the separate index. NULLs don't collide.
  `ALTER TABLE inspections ADD COLUMN clientRef TEXT;
  CREATE UNIQUE INDEX inspections_client_ref ON inspections(clientRef);`,
];

const columns = 'date, machineId, defectType, severity, remarks, createdAt, source, clientRef';

export class InspectionStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path, { timeout: 5000 });
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.migrate();
  }

  private migrate() {
    const { user_version: current } = this.db.prepare('PRAGMA user_version').get() as {
      user_version: number;
    };
    if (current > migrations.length) {
      throw new Error(
        `Database is at schema version ${current}; this build only knows up to ${migrations.length}.`,
      );
    }
    for (let version = current; version < migrations.length; version++) {
      try {
        this.db.exec(`BEGIN; ${migrations[version]} PRAGMA user_version = ${version + 1}; COMMIT;`);
      } catch (error) {
        this.db.exec('ROLLBACK;');
        throw error;
      }
    }
  }

  get isOpen() {
    return this.db.isOpen;
  }

  create(input: CreateInspection, source: Inspection['source'] = 'Manual'): Inspection {
    return this.db
      .prepare(`INSERT INTO inspections (${columns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`)
      .get(
        input.date,
        input.machineId,
        input.defectType,
        input.severity,
        input.remarks,
        new Date().toISOString(),
        source,
        input.clientRef ?? null,
      ) as unknown as Inspection;
  }

  get(id: number): Inspection | undefined {
    return this.db.prepare('SELECT * FROM inspections WHERE id = ?').get(id) as unknown as
      Inspection | undefined;
  }

  findByClientRef(clientRef: string): Inspection | undefined {
    return this.db
      .prepare('SELECT * FROM inspections WHERE clientRef = ?')
      .get(clientRef) as unknown as Inspection | undefined;
  }

  list(filters: InspectionFilters): Inspection[] {
    const where: string[] = [];
    const values: string[] = [];
    if (filters.severity) {
      where.push('severity = ?');
      values.push(filters.severity);
    }
    if (filters.status) {
      where.push('status = ?');
      values.push(filters.status);
    }
    if (filters.dateFrom) {
      where.push('date >= ?');
      values.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      where.push('date <= ?');
      values.push(filters.dateTo);
    }
    // Column names can't be bound parameters, so sortBy maps to fixed SQL here.
    const orderBy = {
      date: 'date',
      machineId: 'machineId COLLATE NOCASE',
      status: 'status',
      severity: "CASE severity WHEN 'Minor' THEN 1 WHEN 'Major' THEN 2 ELSE 3 END",
    }[filters.sortBy];
    const direction = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const sql = `SELECT * FROM inspections
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ${orderBy} ${direction}, id DESC`;
    return this.db.prepare(sql).all(...values) as unknown as Inspection[];
  }

  resolve(id: number, note: string): 'resolved' | 'missing' | 'conflict' {
    // Only an Open row matches, so two people resolving at once can't overwrite each other.
    const result = this.db
      .prepare(
        "UPDATE inspections SET status = 'Resolved', resolutionNote = ?, resolvedAt = ? WHERE id = ? AND status = 'Open'",
      )
      .run(note, new Date().toISOString(), id);
    if (result.changes) return 'resolved';
    return this.get(id) ? 'conflict' : 'missing';
  }

  summary(): Summary {
    const rows = this.db
      .prepare(
        'SELECT severity, status, count(*) AS count FROM inspections GROUP BY severity, status',
      )
      .all() as unknown as { severity: string; status: string; count: number }[];
    const count = (severity: string, status: string) =>
      rows.find((row) => row.severity === severity && row.status === status)?.count ?? 0;
    const bySeverity = severities.map((severity) => ({
      severity,
      open: count(severity, 'Open'),
      resolved: count(severity, 'Resolved'),
    }));
    const open = bySeverity.reduce((sum, row) => sum + row.open, 0);
    const resolved = bySeverity.reduce((sum, row) => sum + row.resolved, 0);
    return { total: open + resolved, open, resolved, bySeverity };
  }

  close() {
    this.db.close();
  }
}
