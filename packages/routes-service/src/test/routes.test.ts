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
const driverA = JSON.stringify({
  sub: 10,
  email: "a@example.com",
  name: "Driver A",
  role: "driver",
});
const driverB = JSON.stringify({
  sub: 20,
  email: "b@example.com",
  name: "Driver B",
  role: "driver",
});
const customer = JSON.stringify({
  sub: 7,
  email: "c@example.com",
  name: "Customer",
  role: "customer",
});

describe("routes-service", () => {
  it("only dispatchers can create assignments", async () => {
    const res = await request(app)
      .post("/assignments")
      .set(USER_CONTEXT_HEADER, driverA)
      .send({ shipment_id: 1, driver_id: 10 });
    expect(res.status).toBe(403);
  });

  it("creates an assignment and advances shipment status", async () => {
    const res = await request(app)
      .post("/assignments")
      .set(USER_CONTEXT_HEADER, dispatcher)
      .send({ shipment_id: 100, driver_id: 10, sequence: 1 });
    expect(res.status).toBe(201);
    expect(typeof res.body.assignment_id).toBe("number");
  });

  it("prevents duplicate assignment of the same shipment", async () => {
    await request(app)
      .post("/assignments")
      .set(USER_CONTEXT_HEADER, dispatcher)
      .send({ shipment_id: 200, driver_id: 10 });
    const dup = await request(app)
      .post("/assignments")
      .set(USER_CONTEXT_HEADER, dispatcher)
      .send({ shipment_id: 200, driver_id: 20 });
    expect(dup.status).toBe(409);
  });

  it("driver only sees their own assignments", async () => {
    await request(app)
      .post("/assignments")
      .set(USER_CONTEXT_HEADER, dispatcher)
      .send({ shipment_id: 301, driver_id: 10 });
    await request(app)
      .post("/assignments")
      .set(USER_CONTEXT_HEADER, dispatcher)
      .send({ shipment_id: 302, driver_id: 20 });

    const a = await request(app).get("/me/assignments").set(USER_CONTEXT_HEADER, driverA);
    expect(a.status).toBe(200);
    for (const x of a.body.assignments) expect(x.driver_id).toBe(10);
  });

  it("rejects status update for another driver's assignment", async () => {
    const create = await request(app)
      .post("/assignments")
      .set(USER_CONTEXT_HEADER, dispatcher)
      .send({ shipment_id: 401, driver_id: 10 });

    const res = await request(app)
      .post(`/me/assignments/${create.body.assignment_id}/status`)
      .set(USER_CONTEXT_HEADER, driverB)
      .send({ status: "delivered" });
    expect(res.status).toBe(403);
  });

  it("dispatcher sees workload aggregation", async () => {
    const res = await request(app).get("/drivers/workload").set(USER_CONTEXT_HEADER, dispatcher);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.workload)).toBe(true);
  });

  it("rejects workload endpoint for customers", async () => {
    const res = await request(app).get("/drivers/workload").set(USER_CONTEXT_HEADER, customer);
    expect(res.status).toBe(403);
  });
});
