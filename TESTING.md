# Testing strategy and coverage

This document summarises what is tested in the codebase. Use it as a reference when populating the "Testing and Validation" slide (15% + 5% of the Assessment 2 grade).

## Layers

| Layer | Tool | Where | What it covers |
|---|---|---|---|
| Unit (unified UI) | Vitest | `packages/web/src/lib/mock/store.test.ts` | All business logic behind the unified dashboard — state transitions, route optimisation, notifications, reporting selectors |
| Unit / integration | Vitest + Supertest | `packages/*/src/test/*.test.ts` | Each service's HTTP contract — input validation, RBAC, persistence, state transitions |
| Type checks | TypeScript strict | `npm run typecheck` | Whole repo, treated as a first line of defence (run in CI) |
| Manual E2E | Browser | `npm run dev:web` | Assign → optimise route → start → deliver → notification → report |

Coverage focuses on the **happy path plus one failure path** for every public endpoint, which is the test discipline recommended in Humble & Farley's *Continuous Delivery*.

## Unified UI test inventory — `web`, 43 cases

The dashboard's logic lives in a framework-free store (`packages/web/src/lib/mock/store.ts`), so it is tested directly with a fixed clock — fast and deterministic, no DOM required.

- **Seed**: demo data boots with the expected shape (28 shipments incl. 18 historical deliveries, 3 drivers, 5 customers); all coordinates are real Colombo-area lat/lng (2 cases)
- **Geometry**: km distance model sanity (depot → Mount Lavinia ≈ 13 km), fuel model scales with distance (2 cases)
- **Create shipment**: tracking ID generation (CYD-…), history entry, customer notification with channel selection, input validation (3 cases)
- **Transitions**: assign / start / deliver / fail happy path; illegal transitions rejected; driver goes idle after last stop; fuel recorded on delivery; failure alerts both ops and customer (7 cases)
- **Issues**: report + resolve, double-resolve rejected, note required (2 cases)
- **Customer self-service**: reschedule (incl. failed → back to dispatch pool), blocked for delivered/bad dates, special instructions, notification channels follow email/SMS preferences (5 cases)
- **Resend email updates**: branded HTML template with escaping, send on email-channel notifications (payload + log status via injected fake sender), no email when channel disabled, error capture, simulation mode without an API key (5 cases)
- **Route optimisation**: nearest-neighbour ordering, never longer than input order, driver stops re-sequenced 1..n with real-km savings, error when nothing to optimise (4 cases)
- **Notifications**: mark one read, mark all read
- **Simulation**: tick moves en-route drivers closer and updates ETA
- **Reporting selectors (live data only)**: KPIs incl. 7-day on-time rate from records, daily stats derived purely from shipment records (per-day counts match seeded records), new deliveries reflected immediately, per-driver performance, bottleneck detection, CSV export shape (6 cases)
- **SSR smoke** (`app.smoke.test.tsx`): every tab renders to HTML with expected content (5 cases)

## Per-service test inventory

### `auth-service` — 8 cases
- POST /register rejects invalid body (zod validation)
- POST /register issues a JWT for a new dispatcher
- POST /register rejects duplicate email (409)
- POST /login succeeds with correct credentials
- POST /login rejects wrong password (401)
- POST /login rejects unknown email (401)
- POST /verify accepts a freshly issued token
- POST /verify rejects a malformed token
- GET /users filters by role

### `shipments-service` — 6 cases
- POST / requires dispatcher role (403)
- POST / rejects invalid body (400)
- POST / creates shipment and writes history
- GET /track/:id returns 404 for unknown tracking IDs
- POST /:id/status driver advances status, history reflects update
- POST /:id/status rejects customer (403)
- GET / list scopes by customer for customer role

### `routes-service` — 7 cases
- POST /assignments requires dispatcher
- POST /assignments creates assignment, returns id
- POST /assignments rejects duplicate shipment
- GET /me/assignments scoped to current driver
- POST /me/assignments/:id/status rejects another driver's assignment
- GET /drivers/workload returns aggregation for dispatcher
- GET /drivers/workload rejects customers

### `notifications-service` — 4 cases
- GET /me requires authentication
- POST /internal/notify creates a notification readable via /me
- POST /:id/read decrements unread count
- POST /internal/notify validates body shape

**Total: ~25 test cases** across the four services.

## Running the tests

```bash
# everything (web + services)
npm test

# just the unified UI
npm test -w web

# one service
npm test -w auth-service
npm test -w shipments-service
npm test -w routes-service
npm test -w notifications-service
```

Each test file forces SQLite into `:memory:` so the test run never touches development data.

## Notes for the presentation

1. **What's NOT covered** (intentional scope cut, documented for honesty):
   - Frontend component tests (manual E2E only). Planned with Playwright in "way forward".
   - Gateway-level integration tests. Skipped because the gateway is a thin proxy; service tests already exercise its expected `x-user-context` contract.
   - Performance / load tests.

2. **CI integration**: `.github/workflows/ci.yml` runs `npm run typecheck && npm test` on every push and pull request. This is the demonstration of the CI/CD practice claimed in the Assessment 1 report.
