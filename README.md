# SIXS Modern

Node.js backend, React + TypeScript frontend, and an inferred PostgreSQL database.
Database access uses MikroORM with PostgreSQL. No .NET runtime, SQL Server, stored procedures, or hidden session-based business state.

## What is implemented

- JSON CRUD APIs for customers, policies, companies, policy types, employees, alternate contacts and Medicare.
- Frontend list/search, add/edit/delete forms, foreign-key selectors, pagination and sales reports.
- Server-side allowlisted validation, MikroORM entities and query builders, decimal strings and optimistic concurrency.
- Transactional MikroORM migrations with a migration ledger and PostgreSQL advisory lock.
- Local-only defaults; no real data, credentials or seed records copied from the old project.

This is a working development starter, not a complete production or distributed deployment.
Business modules currently use one backend and database. Review database/ASSUMPTIONS.md before importing data.

## Prerequisites

Node.js 24 LTS with npm, plus Docker Compose or an existing PostgreSQL server.
Runtime guidance: https://nodejs.org/en/about/previous-releases
MikroORM documentation: https://mikro-orm.io/docs/usage-with-js

## Run locally (PowerShell)

With Node.js 24+ installed and Docker Desktop running, launch everything from the project root:

```powershell
.\Start-Testing.ps1
```

If PowerShell blocks scripts, allow this launch only:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Start-Testing.ps1
```

The launcher creates missing .env files, installs dependencies, starts PostgreSQL, applies migrations, opens backend/frontend terminals, and opens the browser after both apps are ready. Existing .env files are preserved. Use `-RunChecks` to run tests and the frontend build before launching, `-SkipInstall` to reuse installed dependencies, or `-NoBrowser` to skip opening the browser. If you configured a backend API_TOKEN, set the same token in frontend/.env.
Stop the apps with Ctrl+C in their terminals, and stop PostgreSQL with `docker compose stop`.

For manual startup, run these commands from the project root:

```powershell
Copy-Item .env.example .env
Copy-Item backend/.env.example backend/.env
npm install
docker compose up -d
npm run db:migrate
npm test
npm run build
npm run dev:backend
```

In another terminal in the same project directory:

```powershell
npm run dev:frontend
```

Open http://localhost:5173. Backend health: http://127.0.0.1:3001/health.
Add companies, policy types, employees and customers before adding policies.
Backend workspaces resolve .env relative to backend/. Change DATABASE_URL there for an existing PostgreSQL server.
If you change Compose credentials, also change DATABASE_URL. Changes do not reset an already initialized PostgreSQL volume.

The SQL script can alternatively be applied once with:
```powershell
psql "postgresql://sixs:local-development-only@localhost:5432/sixs" -v ON_ERROR_STOP=1 -f database/001_initial.sql
```
Use the migration runner for new databases. Databases initialized by the original runner are automatically adopted from their schema_migrations ledger, preserving existing records. A database initialized directly with psql has no ledger; it must be explicitly baselined before using the runner.

## API

GET/POST /api/{resource}
GET/PATCH/DELETE /api/{resource}/{id}
Resources: customers, policies, companies, policy-types, employees, alternate-contacts, medicare.
Lists support limit (1–200), offset, q; child resources support customer_id.
PATCH requires the current version in its JSON body. DELETE also requires { "version": 1 }.
GET /api/reports/sales?year=2026&employee_id=1 returns policy counts and nominal premium totals.
Optional employee_id filters the report. Missing months produce no rows.
Date fields use YYYY-MM-DD; money and percentage values use decimal strings.
400 = invalid request, 401 = token failure, 404 = missing record/route, 409 = duplicate, dependency or version conflict.

## Security and deployment

This local starter has no employee login, role authorization, audit trail, event broker or outbox.
It binds loopback by default. Outside local development, an API_TOKEN is mandatory; the shared token is bootstrap protection, not user authentication.
For proxy testing, copy frontend/.env.example to frontend/.env and set the same API_TOKEN there. The Vite server injects it server-side.
Never put a secret in a VITE_ variable. The development proxy is not a production gateway.
The production frontend build uses same-origin /api; deploy behind an authenticated reverse proxy.
Before real use, implement identity-provider login, per-user permissions, an audit trail, HTTPS, sensitive-field encryption, backup/restore and retention.
Do not expose this development frontend/proxy to untrusted users.

## Future service separation

Customer records, alternate contacts and Medicare form the customer domain.
Policies, companies, policy types and employee attribution form the policy domain.
Reporting can be extracted into an event-driven read model after transaction/outbox support is added.
Separate deployment requires replacing cross-domain foreign keys with API checks and events, and assigning one writer to each record type.

## Validation

npm test checks input contracts and HTTP CRUD/error/concurrency behavior, plus schema and relational workflows using embedded PostgreSQL (PGlite).
npm run build type-checks and bundles the frontend.
A standalone PostgreSQL instance is still required to verify deployment, the PostgreSQL driver connection and migration locking against your environment.

## Database access

Entity mappings live in backend/src/entities.js and ORM configuration in backend/src/orm.js.
Each API request gets an isolated EntityManager through MikroORM RequestContext.
CRUD uses entity persistence and ORM queries. PATCH uses a conditional QueryBuilder update so row versions are checked and advanced atomically, even for unchanged values; DELETE also matches the expected version.
Sales aggregation stays in PostgreSQL through MikroORM QueryBuilder. Its SQL expression fragments handle month formatting, full names, counts and exact decimal sums; request values use ORM query conditions.
The immutable database/001_initial.sql schema is applied by backend/migrations/Migration001Initial.js through MikroORM Migrator, retaining the original constraints and indexes.
Migration ledger bootstrap, application migrations and legacy adoption are serialized under the advisory lock.
Add subsequent Migration classes to ormOptions.migrations.migrationsList. Do not use automatic schema updates on an existing database.
