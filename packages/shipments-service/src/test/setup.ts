// Force in-memory SQLite and silence outbound notifications.
process.env.SHIPMENTS_DB_PATH = ":memory:";
process.env.VITEST = "1";

// Stub fetch so the service can call notifications-service without it being up.
const originalFetch = globalThis.fetch;
globalThis.fetch = (async () => new Response(null, { status: 201 })) as typeof fetch;
// Restore after tests if needed (no-op here)
void originalFetch;
