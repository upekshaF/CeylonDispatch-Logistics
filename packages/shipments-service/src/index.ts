import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { z } from "zod";
import { customAlphabet } from "nanoid";
import { db } from "./db.js";
import {
  PORTS,
  USER_CONTEXT_HEADER,
  type AuthTokenPayload,
  type ShipmentStatus,
  type Shipment,
} from "@logistics/shared";

const PORT = Number(process.env.PORT ?? PORTS.shipments);
const NOTIFICATIONS_URL =
  process.env.NOTIFICATIONS_URL ?? `http://localhost:${PORTS.notifications}`;

const newTrackingId = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 10);

const app = express();
app.use(express.json());
app.use(cors());

function readUser(req: Request): AuthTokenPayload | null {
  const raw = req.header(USER_CONTEXT_HEADER);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthTokenPayload;
  } catch {
    return null;
  }
}

function notify(userId: number, kind: string, title: string, body: string, payload: object): void {
  fetch(`${NOTIFICATIONS_URL}/internal/notify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: userId, kind, title, body, payload }),
  }).catch((e) => {
    // eslint-disable-next-line no-console
    console.warn("[shipments] notify failed:", (e as Error).message);
  });
}

function recordHistory(
  shipmentId: number,
  status: ShipmentStatus,
  actorId: number | null,
  note: string | null,
): void {
  db.prepare(
    "INSERT INTO shipment_history (shipment_id, status, actor_id, note) VALUES (?, ?, ?, ?)",
  ).run(shipmentId, status, actorId, note);
}

const createBody = z.object({
  customer_id: z.number().int().positive(),
  origin: z.string().min(1).max(200),
  destination: z.string().min(1).max(200),
  weight_kg: z.number().positive().max(10_000),
  special_instructions: z.string().max(500).optional().nullable(),
});

const statusBody = z.object({
  status: z.enum(["created", "assigned", "in_transit", "delivered", "failed"]),
  note: z.string().max(500).optional().nullable(),
});

app.get("/health", (_req, res) => res.json({ ok: true, service: "shipments" }));

app.get("/track/:trackingId", (req, res) => {
  const ship = db
    .prepare("SELECT * FROM shipments WHERE tracking_id = ?")
    .get(req.params.trackingId) as Shipment | undefined;
  if (!ship) return res.status(404).json({ error: "not_found" });

  const history = db
    .prepare(
      "SELECT id, shipment_id, status, note, actor_id, created_at FROM shipment_history WHERE shipment_id = ? ORDER BY id DESC",
    )
    .all(ship.id);

  res.json({ shipment: ship, history });
});

app.get("/", (req, res) => {
  const user = readUser(req);
  if (!user) return res.status(401).json({ error: "unauthenticated" });

  const status = req.query.status as ShipmentStatus | undefined;
  const customerId = req.query.customer_id ? Number(req.query.customer_id) : undefined;

  let sql = "SELECT * FROM shipments";
  const where: string[] = [];
  const args: unknown[] = [];
  if (status) { where.push("status = ?"); args.push(status); }
  if (customerId) { where.push("customer_id = ?"); args.push(customerId); }
  if (user.role === "customer") { where.push("customer_id = ?"); args.push(user.sub); }
  if (where.length) sql += " WHERE " + where.join(" AND ");
  sql += " ORDER BY id DESC LIMIT 200";

  const rows = db.prepare(sql).all(...args);
  res.json({ shipments: rows });
});

app.get("/:id", (req, res) => {
  const ship = db.prepare("SELECT * FROM shipments WHERE id = ?").get(Number(req.params.id)) as
    | Shipment
    | undefined;
  if (!ship) return res.status(404).json({ error: "not_found" });
  const history = db
    .prepare("SELECT * FROM shipment_history WHERE shipment_id = ? ORDER BY id DESC")
    .all(ship.id);
  res.json({ shipment: ship, history });
});

app.post("/", (req, res) => {
  const user = readUser(req);
  if (!user || user.role !== "dispatcher") return res.status(403).json({ error: "forbidden" });

  const parsed = createBody.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });

  const { customer_id, origin, destination, weight_kg, special_instructions } = parsed.data;
  const tracking_id = newTrackingId();
  const result = db
    .prepare(
      `INSERT INTO shipments (tracking_id, customer_id, origin, destination, weight_kg, status, special_instructions)
       VALUES (?, ?, ?, ?, ?, 'created', ?)`,
    )
    .run(tracking_id, customer_id, origin, destination, weight_kg, special_instructions ?? null);

  const id = Number(result.lastInsertRowid);
  recordHistory(id, "created", user.sub, "Shipment created");

  notify(
    customer_id,
    "shipment.created",
    "Shipment created",
    `Your shipment ${tracking_id} has been created.`,
    { shipment_id: id, tracking_id },
  );

  const ship = db.prepare("SELECT * FROM shipments WHERE id = ?").get(id);
  res.status(201).json({ shipment: ship });
});

app.post("/:id/status", (req, res) => {
  const user = readUser(req);
  if (!user) return res.status(401).json({ error: "unauthenticated" });
  if (user.role === "customer") return res.status(403).json({ error: "forbidden" });

  const parsed = statusBody.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });

  const id = Number(req.params.id);
  const ship = db.prepare("SELECT * FROM shipments WHERE id = ?").get(id) as Shipment | undefined;
  if (!ship) return res.status(404).json({ error: "not_found" });

  const next = parsed.data.status;
  db.prepare("UPDATE shipments SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
    next,
    id,
  );
  recordHistory(id, next, user.sub, parsed.data.note ?? null);

  notify(
    ship.customer_id,
    "shipment.status_changed",
    "Shipment update",
    `Shipment ${ship.tracking_id} is now ${next}.`,
    { shipment_id: id, tracking_id: ship.tracking_id, status: next },
  );

  res.json({ ok: true });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  // eslint-disable-next-line no-console
  console.error("[shipments] error:", err);
  res.status(500).json({ error: "internal", message: err.message });
});

/**
 * Auto-seed 3 demo shipments on first boot. Idempotent — only runs when the
 * shipments table is empty. Tracking IDs are fixed strings so the README and
 * the slide deck can reference them.
 *
 * customer_ids match the seeded users in auth-service (4, 5, 6 = the customers).
 */
function autoSeed(): void {
  if (process.env.SHIPMENTS_AUTOSEED === "0") return;
  const count = (db.prepare("SELECT COUNT(*) AS n FROM shipments").get() as { n: number }).n;
  if (count > 0) return;

  const insertShipment = db.prepare(
    `INSERT INTO shipments (id, tracking_id, customer_id, origin, destination, weight_kg, status, special_instructions)
     VALUES (?, ?, ?, ?, ?, ?, 'created', NULL)`,
  );
  const insertHistory = db.prepare(
    `INSERT INTO shipment_history (shipment_id, status, note, actor_id) VALUES (?, 'created', 'Shipment created', 1)`,
  );

  const demoShipments = [
    { id: 1, tracking: "DEMO111111", customer: 4, origin: "Colombo Warehouse A", dest: "27 Reid Avenue, Colombo 07", kg: 2.4 },
    { id: 2, tracking: "DEMO222222", customer: 5, origin: "Colombo Warehouse A", dest: "10 Galle Road, Mount Lavinia",  kg: 5.1 },
    { id: 3, tracking: "DEMO333333", customer: 6, origin: "Colombo Warehouse B", dest: "Bauddhaloka Mawatha, Colombo 04", kg: 1.0 },
  ];

  const tx = db.transaction(() => {
    for (const s of demoShipments) {
      insertShipment.run(s.id, s.tracking, s.customer, s.origin, s.dest, s.kg);
      insertHistory.run(s.id);
    }
  });
  tx();
  // eslint-disable-next-line no-console
  console.log("[shipments] seeded 3 demo shipments — try /track/DEMO111111");
}

if (!process.env.VITEST) {
  autoSeed();
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[shipments] listening on http://localhost:${PORT}`);
  });
}

export default app;
