process.env.ROUTES_DB_PATH = ":memory:";
process.env.VITEST = "1";

// Stub fetch so calls to shipments-service don't fail.
globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as typeof fetch;
