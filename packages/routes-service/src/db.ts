import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.ROUTES_DB_PATH ?? path.join(__dirname, "..", "routes.db");

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS assignments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id  INTEGER NOT NULL UNIQUE,
    driver_id    INTEGER NOT NULL,
    sequence     INTEGER NOT NULL DEFAULT 1,
    status       TEXT NOT NULL CHECK (status IN ('created','assigned','in_transit','delivered','failed')),
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_assignments_driver ON assignments(driver_id);
`);
