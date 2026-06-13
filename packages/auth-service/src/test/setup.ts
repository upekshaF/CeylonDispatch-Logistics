// Force in-memory SQLite and a deterministic JWT secret before db.ts is imported.
process.env.AUTH_DB_PATH = ":memory:";
process.env.JWT_SECRET = "test-secret";
process.env.VITEST = "1";
