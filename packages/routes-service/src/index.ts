import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { z } from "zod";
import { db } from "./db.js";
import {
  PORTS,
  USER_CONTEXT_HEADER,
  type AuthTokenPayload,
  type ShipmentStatus,
  type Assignment,
} from "@logistics/shared";

const PORT = Number(process.env.PORT ?? PORTS.routes);
const SHIPMENTS_URL = process.env.SHIPMENTS_URL ?? `http://localhost:${PORTS.shipments}`;

const app = express();
app.use(express.json());
app.use(cors());

function asyncRoute(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

function readUser(req: Request): AuthTokenPayload | null {
  const raw = req.header(USER_CONTEXT_HEADER);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthTokenPayload;
  } catch {
    return null;
  }
}

async function updateShipmentStatus(
  shipmentId: number,
  status: ShipmentStatus,
  note: string | null,
  forwardedUser: AuthTokenPayload,
): Promise<void> {
  await fetch(`${SHIPMENTS_URL}/${shipmentId}/status`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [USER_CONTEXT_HEADER]: JSON.stringify(forwardedUser),
    },
    body: JSON.stringify({ status, note }),
  });
}

const assignBody = z.object({
  shipment_id: z.number().int().positive(),
  driver_id: z.number().int().positive(),
  sequence: z.number().int().min(1).max(500).optional(),
});

const statusBody = z.object({
  status: z.enum(["in_transit", "delivered", "failed"]),
  note: z.string().max(500).optional().nullable(),
});

app.get("/health", (_req, res) => res.json({ ok: true, service: "routes" }));

app.post(
  "/assignments",
  asyncRoute(async (req, res) => {
    const user = readUser(req);
    if (!user || user.role !== "dispatcher") return res.status(403).json({ error: "forbidden" });

    const parsed = assignBody.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });

    const { shipment_id, driver_id, sequence } = parsed.data;
    const exists = db.prepare("SELECT id FROM assignments WHERE shipment_id = ?").get(shipment_id);
    if (exists) return res.status(409).json({ error: "already_assigned" });

    const result = db
      .prepare(
        `INSERT INTO assignments (shipment_id, driver_id, sequence, status) VALUES (?, ?, ?, 'assigned')`,
      )
      .run(shipment_id, driver_id, sequence ?? 1);

    await updateShipmentStatus(shipment_id, "assigned", "Assigned to driver", user);

    res.status(201).json({ assignment_id: Number(result.lastInsertRowid) });
  }),
);

app.get("/me/assignments", (req, res) => {
  const user = readUser(req);
  if (!user || user.role !== "driver") return res.status(403).json({ error: "forbidden" });

  const rows = db
    .prepare(
      `SELECT * FROM assignments WHERE driver_id = ? AND status NOT IN ('delivered','failed') ORDER BY sequence ASC`,
    )
    .all(user.sub);
  res.json({ assignments: rows });
});

app.post(
  "/me/assignments/:id/status",
  asyncRoute(async (req, res) => {
    const user = readUser(req);
    if (!user || user.role !== "driver") return res.status(403).json({ error: "forbidden" });

    const parsed = statusBody.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });

    const id = Number(req.params.id);
    const a = db.prepare("SELECT * FROM assignments WHERE id = ?").get(id) as
      | Assignment
      | undefined;
    if (!a) return res.status(404).json({ error: "not_found" });
    if (a.driver_id !== user.sub) return res.status(403).json({ error: "not_your_assignment" });

    const next = parsed.data.status;
    const completedAt = next === "delivered" || next === "failed" ? new Date().toISOString() : null;
    db.prepare("UPDATE assignments SET status = ?, completed_at = ? WHERE id = ?").run(
      next,
      completedAt,
      id,
    );

    await updateShipmentStatus(a.shipment_id, next, parsed.data.note ?? null, user);

    res.json({ ok: true });
  }),
);

app.get("/drivers/workload", (req, res) => {
  const user = readUser(req);
  if (!user || user.role !== "dispatcher") return res.status(403).json({ error: "forbidden" });

  const rows = db
    .prepare(
      `SELECT driver_id, COUNT(*) as total,
              SUM(CASE WHEN status NOT IN ('delivered','failed') THEN 1 ELSE 0 END) AS active
       FROM assignments GROUP BY driver_id`,
    )
    .all();
  res.json({ workload: rows });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  // eslint-disable-next-line no-console
  console.error("[routes] error:", err);
  res.status(500).json({ error: "internal", message: err.message });
});

if (!process.env.VITEST) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[routes] listening on http://localhost:${PORT}`);
  });
}

export default app;
