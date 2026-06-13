# CeylonDispatch — Unified Control Center

COMP70006 Assessment 2 project. A logistics management demo set in **Colombo, Sri Lanka**, presented as a **single unified UI**: dispatch, drivers, customers, reporting, and notifications are all controlled from one dashboard. The UI runs entirely on **frontend mock data** so it can be demoed with zero setup — the original microservices backend is still in the repo for the architecture story.

---

## How to run the demo (2 steps)

You need **Node.js 18.18 or newer** installed.

```bash
# 1) install dependencies (one time)
npm install

# 2) start the unified UI (no backend needed)
npm run dev:web
```

Open <http://localhost:5173>. No login required — the demo boots with mock data: 28 shipments (10 live + 18 historical deliveries), 3 drivers, 5 customers, and open issues, all around real Colombo locations. Refreshing the page resets the demo.

### What's in the unified UI

| Tab | What you can do |
|---|---|
| **Overview** | KPI cards (active, in transit, delivered today, awaiting driver, open issues, on-time rate), real interactive map of Colombo (Leaflet + OpenStreetMap — no API key needed), "needs attention" feed, recent activity |
| **Shipments** | Create shipments, assign drivers, filter/search, and per-shipment detail: timeline, issues, reschedule, special instructions, status actions. Columns include customer, assigned date, and last updated |
| **Drivers & Routes** | Per-driver route list with one-tap **Start / Delivered / Report issue**, ⚡ **route optimisation** (nearest-neighbour re-sequencing with estimated km saved), live map |
| **Customers** | Track shipments, reschedule deliveries, add special instructions, toggle automatic email/SMS updates, see exactly which updates were "sent" and via which channel |
| **Reports** | Deliveries per day, average delivery time, on-time rate, fuel usage trends, driver performance table, bottleneck detection, CSV export — **derived live from the current shipment records**, no pre-baked stats |
| **🔔 bell** | In-app notification feed with unread counts and channel chips (in-app / email / SMS) |

The 🔔 notifications and the map update live — drivers move toward their next stop every few seconds.

---

## Mock data architecture

The web app owns its data in `packages/web/src/lib/mock/`:

| File | Role |
|---|---|
| `types.ts` | Domain types (shipments, drivers, customers, issues, notifications, email log) |
| `seed.ts` | Deterministic seed with real Colombo coordinates — timestamps are relative to "now" so the demo always looks live |
| `store.ts` | All business logic: status transitions, assignment, route optimisation (real km), notifications, email dispatch, live reporting selectors. Framework-free and fully unit-tested |
| `react.tsx` | React bindings (`StoreProvider`, `useAppState`) via `useSyncExternalStore` |
| `store.test.ts` + `app.smoke.test.tsx` | 43 Vitest tests: store/selectors/email logic plus SSR smoke renders of every tab |

### Email updates via Resend

Customer notifications with the email channel are dispatched through [Resend](https://resend.com). Paste your API key and verified sender in **`packages/web/src/lib/email/config.ts`** — until then emails run in **simulation mode** and show up as `simulated` in the Customers tab's email delivery log. (Note: Resend blocks browser-origin calls in production; route through a small backend endpoint when deploying for real.)

## The microservices backend (kept for the architecture story)

The original backend still works and demonstrates the assessed microservices design — `npm run dev:services` starts gateway (4000), auth (4001), shipments (4002), routes (4003) and notifications (4004), each with its own SQLite database. The unified UI no longer depends on it.

---

## Suggested demo flow (under two minutes)

1. `npm run dev:web`, open <http://localhost:5173> — the **Overview** tab shows KPIs, the live Colombo map, and items needing attention.
2. **Shipments** → assign `CYD-100007` to a driver. A customer notification appears in the 🔔 and an email is logged (simulated until you add a Resend key).
3. **Drivers & Routes** → press ⚡ **Optimise route** on Kasun, then **Start** and **✓ Delivered** on a stop. Watch the map and the "Delivered today" KPI react.
4. Report an issue from a driver card ("Report issue" → delay) — it surfaces in Overview's *Needs attention* and in Reports' *Bottlenecks*.
5. **Customers** → pick Osu Sala Pharmacy, reschedule failed `CYD-100009` (it returns to the dispatch pool), toggle SMS off and see future updates drop the SMS channel; check the **email delivery log**.
6. **Reports** → trends for deliveries, delivery time, on-time rate and fuel — all derived from the shipment records you just changed — plus driver performance and CSV export.
7. Track `CYD-100003` from the top search bar for the full audit timeline.

---

## Repository layout

```
logistics-app/
├── package.json                ← root scripts and workspaces
├── README.md                   ← this file
├── TESTING.md                  ← test inventory and how to run them
├── .github/workflows/ci.yml    ← GitHub Actions: lint + typecheck + tests
└── packages/
    ├── shared/                 ← types and constants used by all packages
    ├── gateway/                ← single ingress, JWT verification
    ├── auth-service/           ← users and authentication
    ├── shipments-service/      ← shipments + tracking history
    ├── routes-service/         ← driver assignments
    ├── notifications-service/  ← in-app notification feed
    └── web/                    ← React + Vite unified UI (mock data + unit tests)
```

---

## Scripts you can run

| Command                | What it does                                     |
|------------------------|--------------------------------------------------|
| `npm install`          | Install dependencies (run once)                  |
| `npm run dev:web`      | **Start the unified UI demo** (recommended)      |
| `npm run dev`          | Start the UI plus the legacy backend services    |
| `npm run dev:services` | Start the backend only (no web)                  |
| `npm test`             | Run all tests (web store + services)             |
| `npm test -w web`      | Run just the unified UI's 30 unit tests          |
| `npm run typecheck`    | Strict TypeScript check across the repo          |

---

## How it maps to the Scrum artefacts

| User story | Where it lives in the unified UI |
|------------|----------------------------------|
| US-01 customer tracking            | top-bar tracking search + Customers tab timeline |
| US-02 notifications (email/SMS/in-app) | 🔔 bell + per-customer channel preferences |
| US-03 reschedule / special instructions | Customers tab and shipment detail panel |
| US-04 dispatcher creates and assigns | Shipments tab (create form + assign dropdown) |
| US-05 dispatcher monitors          | Overview tab (KPIs, live map, needs attention) |
| US-06 route optimisation           | Drivers & Routes tab (⚡ optimise, nearest-neighbour) |
| US-07 driver views deliveries      | Drivers & Routes tab (per-driver stop list) |
| US-08 driver updates status / reports issues | one-tap Start / Delivered / Report issue |
| US-10 audit retention              | per-shipment timeline (full status history) |
| Reporting (delivery times, delays, fuel) | Reports tab + CSV export |

Previously "way forward" items now demonstrated in the unified UI with mock data: reschedule, reporting dashboard, live map, route optimisation, and email/SMS update simulation.

---

## Troubleshooting

**`npm install` fails with a `node-gyp` error.** Only the backend services need `better-sqlite3`. For the UI demo you can skip them entirely: `npm install -w web && npm run dev:web`. Otherwise use Node 20 LTS and `npm rebuild better-sqlite3`.

**A port is already in use.** The web app uses 5173 (and the optional backend uses 4000–4004). Close the conflicting app or change the port in `packages/web/vite.config.ts`.

**The demo data looks wrong.** The mock store lives in memory — refresh the browser to reset it to the seed state.

---

## License

For coursework use (COMP70006).
