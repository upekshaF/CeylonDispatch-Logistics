import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../index.js";
import { USER_CONTEXT_HEADER } from "@logistics/shared";

const dispatcher = JSON.stringify({
  sub: 1,
  email: "d@example.com",
  name: "Dispatcher",
  role: "dispatcher",
});
const driver = JSON.stringify({
  sub: 99,
  email: "dr@example.com",
  name: "Driver",
  role: "driver",
});
const customer = JSON.stringify({
  sub: 7,
  email: "c@example.com",
  name: "Customer",
  role: "customer",
});

describe("shipments-service", () => {
  describe("POST /", () => {
    it("requires dispatcher role", async () => {
      const res = await request(app)
        .post("/")
        .set(USER_CONTEXT_HEADER, customer)
        .send({ customer_id: 7, origin: "A", destination: "B", weight_kg: 1 });
      expect(res.status).toBe(403);
    });

    it("returns 400 on invalid body", async () => {
      const res = await request(app)
        .post("/")
        .set(USER_CONTEXT_HEADER, dispatcher)
        .send({ origin: "", destination: "B", weight_kg: -2 });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("invalid_body");
    });

    it("creates a shipment and writes history", async () => {
      const res = await request(app)
        .post("/")
        .set(USER_CONTEXT_HEADER, dispatcher)
        .send({ customer_id: 7, origin: "Warehouse A", destination: "27 Reid Ave", weight_kg: 2.5 });
      expect(res.status).toBe(201);
      expect(res.body.shipment.tracking_id).toMatch(/^[A-Z2-9]{10}$/);
      expect(res.body.shipment.status).toBe("created");

      // tracking endpoint should now find it
      const track = await request(app).get(`/track/${res.body.shipment.tracking_id}`);
      expect(track.status).toBe(200);
      expect(track.body.history.length).toBeGreaterThan(0);
      expect(track.body.history[0].status).toBe("created");
    });
  });

  describe("GET /track/:trackingId", () => {
    it("returns 404 for unknown tracking ID", async () => {
      const res = await request(app).get("/track/UNKNOWNID00");
      expect(res.status).toBe(404);
    });
  });

  describe("POST /:id/status", () => {
    it("driver can advance a shipment status", async () => {
      const created = await request(app)
        .post("/")
        .set(USER_CONTEXT_HEADER, dispatcher)
        .send({ customer_id: 7, origin: "A", destination: "B", weight_kg: 1 });
      const id = created.body.shipment.id;

      const update = await request(app)
        .post(`/${id}/status`)
        .set(USER_CONTEXT_HEADER, driver)
        .send({ status: "in_transit" });
      expect(update.status).toBe(200);

      const detail = await request(app).get(`/${id}`);
      expect(detail.body.shipment.status).toBe("in_transit");
      expect(detail.body.history[0].status).toBe("in_transit");
    });

    it("rejects updates from customers", async () => {
      const created = await request(app)
        .post("/")
        .set(USER_CONTEXT_HEADER, dispatcher)
        .send({ customer_id: 7, origin: "A", destination: "B", weight_kg: 1 });
      const id = created.body.shipment.id;

      const res = await request(app)
        .post(`/${id}/status`)
        .set(USER_CONTEXT_HEADER, customer)
        .send({ status: "delivered" });
      expect(res.status).toBe(403);
    });
  });

  describe("GET / (list)", () => {
    it("customers only see their own shipments", async () => {
      // shipment for customer 7
      await request(app)
        .post("/")
        .set(USER_CONTEXT_HEADER, dispatcher)
        .send({ customer_id: 7, origin: "A", destination: "B", weight_kg: 1 });
      // shipment for someone else
      await request(app)
        .post("/")
        .set(USER_CONTEXT_HEADER, dispatcher)
        .send({ customer_id: 42, origin: "A", destination: "B", weight_kg: 1 });

      const res = await request(app).get("/").set(USER_CONTEXT_HEADER, customer);
      expect(res.status).toBe(200);
      for (const s of res.body.shipments) expect(s.customer_id).toBe(7);
    });
  });
});
