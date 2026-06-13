import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { createProxyMiddleware, type Options } from "http-proxy-middleware";
import { PORTS, USER_CONTEXT_HEADER, type AuthTokenPayload } from "@logistics/shared";

const PORT = Number(process.env.PORT ?? PORTS.gateway);
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";

const AUTH_URL = process.env.AUTH_URL ?? `http://localhost:${PORTS.auth}`;
const SHIPMENTS_URL = process.env.SHIPMENTS_URL ?? `http://localhost:${PORTS.shipments}`;
const ROUTES_URL = process.env.ROUTES_URL ?? `http://localhost:${PORTS.routes}`;
const NOTIFICATIONS_URL = process.env.NOTIFICATIONS_URL ?? `http://localhost:${PORTS.notifications}`;

const app = express();
app.use(cors());

interface AuthedRequest extends Request {
  user?: AuthTokenPayload;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "missing_token" });
    return;
  }
  const token = header.slice("Bearer ".length);
  try {
    req.user = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    next();
  } catch {
    res.status(401).json({ error: "invalid_token" });
  }
}

function withUserHeader(): Options {
  return {
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq, req) => {
        const u = (req as AuthedRequest).user;
        if (u) proxyReq.setHeader(USER_CONTEXT_HEADER, JSON.stringify(u));
      },
    },
  };
}

app.get("/health", (_req, res) => res.json({ ok: true, service: "gateway" }));

// Express's `app.use("/prefix", proxy)` strips the prefix from req.url before the proxy
// middleware runs. That works fine when the downstream service mounts its routes at root
// (e.g. shipments-service has `app.post("/")` matching `/shipments` → `/`). But for routes
// that DO need a prefix downstream (auth-service exposes `/users`, shipments exposes
// `/track/:id`), we have to re-prepend that prefix here, otherwise the request hits the
// wrong handler downstream.
const prepend = (prefix: string) => (path: string) =>
  // path is what's left after Express stripped the mount path. It already starts with "/"
  // or is "/?<query>"; we just glue the prefix back on the front.
  path === "/" ? prefix : `${prefix}${path}`;

// Public passthroughs
app.use("/auth", createProxyMiddleware({ target: AUTH_URL, changeOrigin: true }));
app.use("/track", createProxyMiddleware({ target: SHIPMENTS_URL, changeOrigin: true, pathRewrite: prepend("/track") }));

// Authenticated
app.use("/shipments", requireAuth, createProxyMiddleware({ target: SHIPMENTS_URL, ...withUserHeader() }));
app.use("/routes", requireAuth, createProxyMiddleware({ target: ROUTES_URL, ...withUserHeader() }));
app.use("/notifications", requireAuth, createProxyMiddleware({ target: NOTIFICATIONS_URL, ...withUserHeader() }));
app.use("/users", requireAuth, createProxyMiddleware({ target: AUTH_URL, pathRewrite: prepend("/users"), ...withUserHeader() }));

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[gateway] listening on http://localhost:${PORT}`);
});
