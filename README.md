# SIXS Modern

Node.js backend, React + TypeScript frontend, and an inferred PostgreSQL database.
No .NET runtime, SQL Server, stored procedures, ORM, or hidden session-based business state.

## What is implemented

- JSON CRUD APIs for customers, policies, companies, policy types, employees, alternate contacts and Medicare.
- Frontend list/search, add/edit/delete forms, foreign-key selectors, pagination and sales reports.
- Server-side allowlisted validation, parameterized SQL, decimal strings and optimistic concurrency.
- PostgreSQL schema migration with a migration ledger and concurrency lock.
- Local-only defaults; no real data, credentials or seed records copied from the old project.

This is a working development starter, not a complete production or distributed deployment.
Business modules currently use one backend and database. Review database/ASSUMPTIONS.md before importing data.

## Prerequisites

Node.js 24 LTS with npm, plus Docker Compose or an existing PostgreSQL server.
Runtime guidance: https://nodejs.org/en/about/previous-releases
Parameterized query documentation: https://node-postgres.com/features/queries

## Run locally (PowerShell)

Run these commands from the project root:

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
Choose either this direct setup or the migration runner on a fresh database; do not run both against the same initialized schema.

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
A standalone PostgreSQL instance is still required to verify deployment, the pg driver connection, and the migration runner against your environment.
