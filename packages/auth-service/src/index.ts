import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { db } from "./db.js";
import { PORTS, type AuthTokenPayload, type Role } from "@logistics/shared";

const PORT = Number(process.env.PORT ?? PORTS.auth);
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
const JWT_TTL = "8h";

const app = express();
app.use(express.json());
app.use(cors());

const registerBody = z.object({
  email: z.string().email().max(120),
  name: z.string().min(1).max(120),
  password: z.string().min(6).max(120),
  role: z.enum(["dispatcher", "driver", "customer"]),
});

const loginBody = z.object({
  email: z.string().email().max(120),
  password: z.string().min(1).max(120),
});

function asyncRoute(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_TTL });
}

app.get("/health", (_req, res) => res.json({ ok: true, service: "auth" }));

app.post(
  "/register",
  asyncRoute(async (req, res) => {
    const parsed = registerBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    }
    const { email, name, password, role } = parsed.data;

    const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (exists) return res.status(409).json({ error: "email_taken" });

    const password_hash = await bcrypt.hash(password, 10);
    const result = db
      .prepare("INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, ?, ?)")
      .run(email, name, role, password_hash);

    const id = Number(result.lastInsertRowid);
    const token = signToken({ sub: id, email, name, role: role as Role });
    res.status(201).json({ token, user: { id, email, name, role } });
  }),
);

app.post(
  "/login",
  asyncRoute(async (req, res) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    }
    const { email, password } = parsed.data;

    const row = db
      .prepare("SELECT id, email, name, role, password_hash FROM users WHERE email = ?")
      .get(email) as
      | { id: number; email: string; name: string; role: Role; password_hash: string }
      | undefined;

    if (!row) return res.status(401).json({ error: "invalid_credentials" });

    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: "invalid_credentials" });

    const token = signToken({ sub: row.id, email: row.email, name: row.name, role: row.role });
    res.json({ token, user: { id: row.id, email: row.email, name: row.name, role: row.role } });
  }),
);

app.post("/verify", (req, res) => {
  const { token } = req.body as { token?: string };
  if (!token) return res.status(400).json({ error: "missing_token" });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    return res.json({ valid: true, payload });
  } catch {
    return res.status(401).json({ valid: false });
  }
});

app.get("/users", (req, res) => {
  const role = req.query.role as Role | undefined;
  const rows = role
    ? db.prepare("SELECT id, email, name, role, created_at FROM users WHERE role = ?").all(role)
    : db.prepare("SELECT id, email, name, role, created_at FROM users").all();
  res.json({ users: rows });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  // eslint-disable-next-line no-console
  console.error("[auth] error:", err);
  res.status(500).json({ error: "internal", message: err.message });
});

/**
 * Auto-seed demo users on first boot. Runs only if the users table is empty,
 * so deleting auth.db gives you a clean slate next time.
 *
 * IDs are fixed (1..6) so that the demo shipments in shipments-service can
 * reference the same customer IDs without any cross-service coordination.
 */
async function autoSeed(): Promise<void> {
  if (process.env.AUTH_AUTOSEED === "0") return;
  const count = (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
  if (count > 0) return;

  const hash = await bcrypt.hash("password", 10);
  const stmt = db.prepare(
    "INSERT INTO users (id, email, name, role, password_hash) VALUES (?, ?, ?, ?, ?)",
  );
  const demoUsers: Array<[number, string, string, Role]> = [
    [1, "dispatcher@demo.com", "Dana Dispatcher", "dispatcher"],
    [2, "driver1@demo.com",    "Marco Driver",    "driver"],
    [3, "driver2@demo.com",    "Priya Driver",    "driver"],
    [4, "customer1@demo.com",  "Sarah Customer",  "customer"],
    [5, "customer2@demo.com",  "Liam Customer",   "customer"],
    [6, "customer3@demo.com",  "Anika Customer",  "customer"],
  ];
  const tx = db.transaction(() => {
    for (const [id, email, name, role] of demoUsers) {
      stmt.run(id, email, name, role, hash);
    }
  });
  tx();
  // eslint-disable-next-line no-console
  console.log("[auth] seeded 6 demo accounts — password is 'password'");
}

if (!process.env.VITEST) {
  autoSeed()
    .then(() =>
      app.listen(PORT, () => {
        // eslint-disable-next-line no-console
        console.log(`[auth] listening on http://localhost:${PORT}`);
      }),
    )
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error("[auth] failed to start:", e);
      process.exit(1);
    });
}

export default app;
