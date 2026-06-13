import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.SHIPMENTS_DB_PATH ?? path.join(__dirname, "..", "shipments.db");

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS shipments (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    tracking_id           TEXT NOT NULL UNIQUE,
    customer_id           INTEGER NOT NULL,
    origin                TEXT NOT NULL,
    destination           TEXT NOT NULL,
    weight_kg             REAL NOT NULL,
    status                TEXT NOT NULL CHECK (status IN ('created','assigned','in_transit','delivered','failed')),
    special_instructions  TEXT,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS shipment_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    status      TEXT NOT NULL,
    note        TEXT,
    actor_id    INTEGER,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_shipments_status   ON shipments(status);
  CREATE INDEX IF NOT EXISTS idx_history_shipment   ON shipment_history(shipment_id);
`);
