import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../index.js";
import { USER_CONTEXT_HEADER } from "@logistics/shared";

const customer = JSON.stringify({
  sub: 5,
  email: "c@example.com",
  name: "Customer",
  role: "customer",
});

describe("notifications-service", () => {
  it("rejects /me without authentication", async () => {
    const res = await request(app).get("/me");
    expect(res.status).toBe(401);
  });

  it("internal/notify creates a notification readable by the user", async () => {
    const created = await request(app).post("/internal/notify").send({
      user_id: 5,
      kind: "shipment.created",
      title: "Hello",
      body: "Your shipment has been created",
      payload: { tracking_id: "ABC" },
    });
    expect(created.status).toBe(201);

    const list = await request(app).get("/me").set(USER_CONTEXT_HEADER, customer);
    expect(list.status).toBe(200);
    expect(list.body.unread).toBeGreaterThan(0);
    expect(list.body.notifications[0].title).toBe("Hello");
  });

  it("marks a notification as read", async () => {
    const created = await request(app).post("/internal/notify").send({
      user_id: 5,
      kind: "shipment.delivered",
      title: "Delivered",
      body: "Out for delivery",
    });
    const id = created.body.id;
    const before = await request(app).get("/me").set(USER_CONTEXT_HEADER, customer);
    const unreadBefore = before.body.unread;

    const read = await request(app).post(`/${id}/read`).set(USER_CONTEXT_HEADER, customer);
    expect(read.status).toBe(200);

    const after = await request(app).get("/me").set(USER_CONTEXT_HEADER, customer);
    expect(after.body.unread).toBe(unreadBefore - 1);
  });

  it("validates the internal/notify body", async () => {
    const res = await request(app).post("/internal/notify").send({ kind: "x" });
    expect(res.status).toBe(400);
  });
});
