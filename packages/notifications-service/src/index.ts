import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { z } from "zod";
import { db } from "./db.js";
import { PORTS, USER_CONTEXT_HEADER, type AuthTokenPayload } from "@logistics/shared";

const PORT = Number(process.env.PORT ?? PORTS.notifications);

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

const internalBody = z.object({
  user_id: z.number().int().positive(),
  kind: z.string().min(1).max(60),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  payload: z.record(z.unknown()).optional(),
});

app.get("/health", (_req, res) => res.json({ ok: true, service: "notifications" }));

app.post("/internal/notify", (req, res) => {
  const parsed = internalBody.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });

  const { user_id, kind, title, body, payload } = parsed.data;
  const result = db
    .prepare(
      "INSERT INTO notifications (user_id, kind, title, body, payload) VALUES (?, ?, ?, ?, ?)",
    )
    .run(user_id, kind, title, body, JSON.stringify(payload ?? {}));

  res.status(201).json({ id: Number(result.lastInsertRowid) });
});

app.get("/me", (req, res) => {
  const user = readUser(req);
  if (!user) return res.status(401).json({ error: "unauthenticated" });

  const rows = db
    .prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50")
    .all(user.sub);
  const unread = (
    db
      .prepare("SELECT COUNT(*) as n FROM notifications WHERE user_id = ? AND read_at IS NULL")
      .get(user.sub) as { n: number }
  ).n;
  res.json({ notifications: rows, unread });
});

app.post("/:id/read", (req, res) => {
  const user = readUser(req);
  if (!user) return res.status(401).json({ error: "unauthenticated" });

  const id = Number(req.params.id);
  const result = db
    .prepare(
      "UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ? AND read_at IS NULL",
    )
    .run(id, user.sub);

  res.json({ ok: true, updated: result.changes });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  // eslint-disable-next-line no-console
  console.error("[notifications] error:", err);
  res.status(500).json({ error: "internal", message: err.message });
});

if (!process.env.VITEST) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[notifications] listening on http://localhost:${PORT}`);
  });
}

export default app;
