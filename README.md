# Quality Inspection Tracker

A mobile-first application for shop-floor supervisors to log, track, and resolve fabric quality defects. It includes a React frontend, an Express REST API, persistent local SQLite storage, and a mock SAP webhook.

## Run locally

**Prerequisites:** Node.js **24.19.0** and npm. No database installation, account, cloud service, or environment file is needed. Dependencies and the runtime version are pinned; `.nvmrc` is included for nvm users.

From this project directory:

```sh
# If using nvm, run: nvm install && nvm use
npm ci
npm run dev
```

Open **http://localhost:5173**. The API runs at **http://127.0.0.1:3000**. Vite proxies `/api` requests to the backend, and both processes stop with Ctrl+C. With Node already installed, setup is intended to take under five minutes on a typical internet connection.

The database is created automatically at `data/inspections.sqlite`. The application starts empty. To add six illustrative inspections, run this in another terminal:

```sh
npm run seed
```

Seeding only runs when the database is empty, never overwrites existing records, and supplies one Open and one Resolved example for every severity. The examples are fictional.

### Production build

Stop the development server before using its API port for the production server:

```sh
npm run build
npm start
```

Open **http://127.0.0.1:3000**. Express serves the built frontend and API together. Data survives server restarts and rebuilds.

### Optional configuration

Copy `.env.example` to `.env` only if you want different defaults. The server and seed command load this file automatically; existing shell environment variables take precedence.

| Variable        | Default                     | Purpose                                                    |
| --------------- | --------------------------- | ---------------------------------------------------------- |
| `HOST`          | `127.0.0.1`                 | Interface on which the backend listens                     |
| `PORT`          | `3000`                      | Backend and production frontend port                       |
| `DATABASE_PATH` | `./data/inspections.sqlite` | SQLite file, relative to the project directory or absolute |

For the default development workflow, keep port 3000; if you change it, update the `/api` proxy in `vite.config.ts` as well. If a port is occupied, stop the other process or choose a free port. Use Node 24.19.0 if the runtime reports that `node:sqlite` is unavailable.

For a real phone on the same Wi-Fi network, run the production server with `HOST=0.0.0.0 npm start` and open `http://<your-computer-LAN-IP>:3000` on the phone. The app has no authentication, so use this only on a trusted local network.

## Features and workflow

1. **Log an inspection:** choose a date, enter a machine/line ID, choose the defect and severity, and optionally add remarks. The new record starts Open.
2. **Find inspections:** combine severity, status, and date filters. Both date boundaries are inclusive. Sort by date, machine, severity, or status; reverse the direction using the arrow or, on desktop, click a column heading.
3. **Resolve an issue:** open a record, enter a resolution note, and mark it Resolved. The note and timestamp remain visible in its details.
4. **Review the summary:** see Open and Resolved counts for Critical, Major, and Minor inspections. Summary counts always cover all records and dates, independent of register filters.

The register uses a desktop table and phone-friendly cards. Labels, keyboard navigation, focus indicators, dialog focus containment, error recovery, loading states, and empty states are included. The application loads no external fonts, image assets, or analytics.

### Validation and assumptions

- Defect types: `Weave Defect`, `Shade Variation`, `Hole/Tear`, `Count Deviation`, `Other`.
- Severity: `Critical`, `Major`, `Minor`. Status: `Open`, `Resolved`.
- `date` is a real calendar date in `YYYY-MM-DD` format. It is stored without timezone conversion; the form defaults to the browser's local date. Past and future dates are allowed because the brief does not constrain them.
- Machine/line IDs are free text, trimmed, and 1–100 characters long. Remarks are optional, trimmed, and limited to 2,000 characters. Resolution notes are required, trimmed, and 1–2,000 characters long.
- Creation and resolution timestamps use UTC ISO 8601 strings. The UI displays timestamps in the browser's local timezone.
- Default order is inspection date descending, then record ID descending for ties. Severity descending means Critical → Major → Minor; machine sorting is SQLite's ASCII case-insensitive ordering; status ascending puts Open first.
- Resolved records cannot be edited, reopened, or deleted. Competing resolution requests cannot overwrite an existing note.
- All records are returned in the list; this is deliberately a small local tool without pagination. Filters reset when leaving the register or refreshing the page.
- The tool represents one shared workspace, with free-text machine identifiers rather than a plant or machine master-data system.

## REST API

Base URL: `http://127.0.0.1:3000`. POST and PATCH requests must use `Content-Type: application/json`. A request body is limited to 32 KB.

Successful responses use `{ "data": ... }`. Errors use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please check the submitted fields.",
    "fields": { "machineId": "Enter a machine or line ID." }
  }
}
```

`fields` is present for validation failures. Invalid bodies, enum values, query values, and date ranges return `400`; missing records/routes return `404`; already-resolved records return `409`; oversized bodies return `413`; unexpected failures return `500` without internal details.

| Method | Endpoint                       | Behavior                                                        |
| ------ | ------------------------------ | --------------------------------------------------------------- |
| GET    | `/api/health`                  | `200`, health check                                             |
| POST   | `/api/inspections`             | `201`, creates an Open inspection; includes a `Location` header |
| GET    | `/api/inspections`             | `200`, filtered and sorted array                                |
| GET    | `/api/inspections/summary`     | `200`, totals and counts by severity, including zero counts     |
| GET    | `/api/inspections/:id`         | `200`, complete inspection record                               |
| PATCH  | `/api/inspections/:id/resolve` | `200`, updated record after resolution                          |
| POST   | `/api/sap-webhook`             | `201`, creates an Open inspection with source `SAP`             |

### Create an inspection

```sh
curl -i http://127.0.0.1:3000/api/inspections \
  -H 'Content-Type: application/json' \
  -d '{"date":"2026-09-16","machineId":"LOOM-A12","defectType":"Weave Defect","severity":"Critical","remarks":"Broken warp threads near the edge."}'
```

The request accepts exactly these fields; `remarks` may be omitted. Server-owned fields such as `id`, `status`, timestamps, and `source` cannot be supplied by clients.

Example returned record:

```json
{
  "data": {
    "id": 1,
    "date": "2026-09-16",
    "machineId": "LOOM-A12",
    "defectType": "Weave Defect",
    "severity": "Critical",
    "remarks": "Broken warp threads near the edge.",
    "status": "Open",
    "resolutionNote": null,
    "createdAt": "2026-09-16T08:00:00.000Z",
    "resolvedAt": null,
    "source": "Manual"
  }
}
```

### Filter and sort

```sh
curl 'http://127.0.0.1:3000/api/inspections?severity=Critical&status=Open&dateFrom=2026-09-01&dateTo=2026-09-30&sortBy=date&sortOrder=desc'
```

All query parameters are optional. `sortBy` accepts `date`, `severity`, `machineId`, or `status`; `sortOrder` accepts `asc` or `desc`. Omit unused filters rather than passing empty strings. Unknown parameters and repeated parameter values are rejected.

### Resolve

Use the ID returned when the inspection was created:

```sh
curl -X PATCH http://127.0.0.1:3000/api/inspections/1/resolve \
  -H 'Content-Type: application/json' \
  -d '{"resolutionNote":"Replaced the damaged guide and checked the next sample."}'
```

### Mock SAP webhook

The webhook uses the same payload and validation as manual creation. A successful request immediately appears in the register, counts toward the summary, and is labeled as coming from SAP in record details.

```sh
curl -i http://127.0.0.1:3000/api/sap-webhook \
  -H 'Content-Type: application/json' \
  -d '{"date":"2026-09-16","machineId":"DYE-B04","defectType":"Shade Variation","severity":"Major","remarks":"Batch differs from the approved reference."}'
```

This is a mock inbound integration: there is no SAP connection, signature verification, or retry deduplication. Each valid POST creates a new inspection, including repeated identical requests. A production adapter would authenticate the sender and use an external event ID for idempotency.

## Architecture decisions

**One TypeScript project.** React and Express share Zod validation rules and API types, so client forms and backend requests follow the same contract. Frontend pages, reusable components, HTTP handlers, and database access are separated without adding a monorepo or application framework.

**SQLite with Node's built-in driver.** A local SQLite file satisfies persistence without database services, native npm addons, or cloud dependencies. Synchronous queries keep the implementation small for this low-volume assignment; Node is pinned, and higher concurrency would justify revisiting the synchronous access model.

**Small REST surface with server-side filtering.** The browser requests filtered data from the API and refreshes records and summary totals after mutations. SQL values are bound parameters, sorting expressions come from a fixed map, and one conditional UPDATE makes resolution atomic.

**One origin in production.** Express serves the Vite production build and REST API from one process; development uses Vite's proxy. This keeps setup simple and avoids unnecessary cross-origin configuration.

**Mobile-first presentation.** The same API records appear in phone cards or a desktop table, with a native modal dialog for details and resolution. System fonts, a small icon library, and plain CSS keep the UI self-contained and straightforward to maintain.

### Project layout

```text
client/              React app, pages, components, API client, and styles
server/              Express routes, SQLite access, runtime configuration, seed
shared/              Validation schemas and API types
tests/               API integration tests and Playwright browser tests
data/                Generated local database (ignored by Git)
dist/                Generated production build (ignored by Git)
```

## Verification

```sh
npm run typecheck
npm test
npm run build

# One-time browser download for UI tests; not required to run the app
npx playwright install chromium
npm run test:e2e

# Optional source-format check
npm run format:check
```

API tests cover valid and invalid creation, leap dates, text limits, malformed JSON, combined/inclusive filters, all sorting modes, SQL-like input, zero-count summaries, required resolution notes, competing resolutions, webhook records, and persistence after reopening the database.

Browser tests run at **390 × 844** and **1440 × 1000**. They exercise creation, validation, filtering, sorting, details, resolution, summary, network errors, preserved form input, keyboard navigation, dialog focus restoration, and overflow with long content. Each run uses a disposable database; it never touches `data/inspections.sqlite`. UI tests need port 3101 available and create ignored reports and screenshots locally.

## Cuts and improvements with more time

All required features and the mock SAP endpoint are included. Authentication and offline synchronization are intentionally omitted to keep local setup and the core inspection workflow small and reliable.

With more time, I would add authenticated users and a change audit trail; offline drafts with an explicit sync queue and conflict policy; authenticated, idempotent SAP events; pagination and search for larger registers; and automated database migrations and backups. I would also validate the workflow with supervisors on actual shop-floor phones and test more mobile browsers.

This package is prepared for local review. To satisfy the assignment's repository-link submission requirement, publish it to a public repository or a private repository accessible to the reviewers, excluding the database and environment file.
# quality-inspector
