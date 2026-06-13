import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../index.js";

describe("auth-service", () => {
  describe("POST /register", () => {
    it("rejects invalid body", async () => {
      const res = await request(app).post("/register").send({ email: "not-an-email" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("invalid_body");
    });

    it("registers a new dispatcher and returns a JWT", async () => {
      const res = await request(app).post("/register").send({
        email: "alice@example.com",
        name: "Alice",
        password: "password",
        role: "dispatcher",
      });
      expect(res.status).toBe(201);
      expect(typeof res.body.token).toBe("string");
      expect(res.body.user).toMatchObject({ email: "alice@example.com", role: "dispatcher" });
    });

    it("rejects duplicate email", async () => {
      await request(app).post("/register").send({
        email: "bob@example.com", name: "Bob", password: "password", role: "driver",
      });
      const dup = await request(app).post("/register").send({
        email: "bob@example.com", name: "Bob 2", password: "password", role: "driver",
      });
      expect(dup.status).toBe(409);
      expect(dup.body.error).toBe("email_taken");
    });
  });

  describe("POST /login", () => {
    it("logs in with correct credentials", async () => {
      await request(app).post("/register").send({
        email: "carol@example.com", name: "Carol", password: "password", role: "customer",
      });
      const res = await request(app).post("/login").send({
        email: "carol@example.com", password: "password",
      });
      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe("customer");
    });

    it("rejects wrong password", async () => {
      await request(app).post("/register").send({
        email: "dan@example.com", name: "Dan", password: "password", role: "customer",
      });
      const res = await request(app).post("/login").send({
        email: "dan@example.com", password: "wrong",
      });
      expect(res.status).toBe(401);
    });

    it("rejects unknown email", async () => {
      const res = await request(app).post("/login").send({
        email: "nobody@example.com", password: "anything",
      });
      expect(res.status).toBe(401);
    });
  });

  describe("POST /verify", () => {
    it("accepts a freshly issued token", async () => {
      const reg = await request(app).post("/register").send({
        email: "eve@example.com", name: "Eve", password: "password", role: "driver",
      });
      const res = await request(app).post("/verify").send({ token: reg.body.token });
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.payload.email).toBe("eve@example.com");
    });

    it("rejects a malformed token", async () => {
      const res = await request(app).post("/verify").send({ token: "not-a-jwt" });
      expect(res.status).toBe(401);
      expect(res.body.valid).toBe(false);
    });
  });

  describe("GET /users", () => {
    it("filters by role", async () => {
      await request(app).post("/register").send({
        email: "fred@example.com", name: "Fred", password: "password", role: "driver",
      });
      const res = await request(app).get("/users").query({ role: "driver" });
      expect(res.status).toBe(200);
      for (const u of res.body.users) expect(u.role).toBe("driver");
    });
  });
});
