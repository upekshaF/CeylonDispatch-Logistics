import { describe, it, expect, beforeEach, vi } from "vitest";

// Tests must behave the same whether or not a real Resend key is configured.
vi.mock("../email/config.js", () => ({ RESEND_API_KEY: "", EMAIL_FROM: "" }));
import {
  createStore,
  computeKpis,
  computeDailyStats,
  computeTodayStat,
  driverPerformance,
  findBottlenecks,
  buildReportCsv,
  nearestNeighbourOrder,
  routeLengthKm,
  distanceKm,
  fuelForKm,
  DEPOT,
  type Store,
} from "./store.js";
import { buildUpdateEmail, type EmailMessage } from "../email/resend.js";

// Fixed clock so every test run sees identical timestamps.
const NOW = Date.parse("2026-06-12T12:00:00.000Z");
const TODAY = "2026-06-12";

// Seed shape: 10 "live" shipments + 18 historical deliveries spread over the
// past 6 days (2+3+4+2+3+4), used by the live-data reports.
const HISTORICAL = 18;
const TOTAL = 10 + HISTORICAL;

function freshStore(): Store {
  return createStore({ now: () => NOW });
}

describe("seed data", () => {
  it("boots with the expected demo shape", () => {
    const s = freshStore().getState();
    expect(s.shipments).toHaveLength(TOTAL);
    expect(s.drivers).toHaveLength(3);
    expect(s.customers).toHaveLength(5);
    expect(s.shipments.filter((x) => x.status === "delivered")).toHaveLength(2 + HISTORICAL);
    expect(s.shipments.filter((x) => x.status === "in_transit")).toHaveLength(2);
    expect(s.shipments.filter((x) => x.status === "created")).toHaveLength(3);
    expect(s.shipments.filter((x) => x.status === "failed")).toHaveLength(1);
    expect(s.emailLog).toHaveLength(3);
  });

  it("uses real Colombo-area coordinates", () => {
    const s = freshStore().getState();
    for (const sh of s.shipments) {
      expect(sh.destCoord.lat).toBeGreaterThan(6.5);
      expect(sh.destCoord.lat).toBeLessThan(7.3);
      expect(sh.destCoord.lng).toBeGreaterThan(79.7);
      expect(sh.destCoord.lng).toBeLessThan(80.1);
    }
  });
});

describe("geometry", () => {
  it("computes real-world km distances", () => {
    // Depot (Peliyagoda) → Mount Lavinia is roughly 13–14 km as the crow flies
    const km = distanceKm(DEPOT, { lat: 6.839, lng: 79.863 });
    expect(km).toBeGreaterThan(12);
    expect(km).toBeLessThan(15);
  });

  it("fuel model scales with distance", () => {
    expect(fuelForKm(10)).toBeGreaterThan(fuelForKm(2));
  });
});

describe("createShipment", () => {
  let store: Store;
  beforeEach(() => {
    store = freshStore();
  });

  it("creates a shipment with a fresh tracking id and history entry", () => {
    const s = store.createShipment({ customerId: 1, destination: "Galle Face", weightKg: 5 });
    expect(s.trackingId).toBe(`CYD-${100000 + TOTAL + 1}`);
    expect(s.status).toBe("created");
    expect(s.history).toHaveLength(1);
    expect(store.getState().shipments).toHaveLength(TOTAL + 1);
  });

  it("notifies the customer through their preferred channels", () => {
    store.createShipment({ customerId: 1, destination: "Galle Face", weightKg: 5 });
    const n = store.getState().notifications[0];
    expect(n.kind).toBe("created");
    // customer 1 (Cargills) has email + sms enabled
    expect(n.channels).toEqual(["in_app", "email", "sms"]);
  });

  it("rejects invalid input", () => {
    expect(() =>
      store.createShipment({ customerId: 1, destination: "  ", weightKg: 5 }),
    ).toThrow(/destination/i);
    expect(() =>
      store.createShipment({ customerId: 1, destination: "Galle Face", weightKg: 0 }),
    ).toThrow(/weight/i);
    expect(() =>
      store.createShipment({ customerId: 999, destination: "Galle Face", weightKg: 1 }),
    ).toThrow(/not found/i);
  });
});

describe("assignment and status transitions", () => {
  let store: Store;
  beforeEach(() => {
    store = freshStore();
  });

  it("assigns a created shipment to a driver", () => {
    const s = store.assignDriver(7, 3); // CYD-100007 created → Tharindu
    expect(s.status).toBe("assigned");
    expect(s.assignedDriverId).toBe(3);
    expect(s.assignedAt).toBe(new Date(NOW).toISOString());
    expect(s.routeOrder).toBe(2); // Tharindu already has one active stop
  });

  it("refuses to assign shipments that are already moving or finished", () => {
    expect(() => store.assignDriver(3, 1)).toThrow(/in_transit/);
    expect(() => store.assignDriver(1, 1)).toThrow(/delivered/);
  });

  it("walks the happy path created → assigned → in_transit → delivered", () => {
    store.assignDriver(10, 3);
    const started = store.startDelivery(10);
    expect(started.status).toBe("in_transit");
    expect(started.etaMinutes).toBeGreaterThan(0);
    expect(store.getState().drivers.find((d) => d.id === 3)?.status).toBe("en_route");

    const delivered = store.markDelivered(10, "Left at the counter");
    expect(delivered.status).toBe("delivered");
    expect(delivered.deliveredAt).toBe(new Date(NOW).toISOString());
    expect(delivered.deliveryMins).toBeGreaterThanOrEqual(1);
    expect(delivered.onTime).toBe(true); // delivered on its scheduled day
  });

  it("enforces legal transitions only", () => {
    expect(() => store.startDelivery(7)).toThrow(/created/);
    expect(() => store.markDelivered(5)).toThrow(/assigned/);
    expect(() => store.markFailed(1, "x")).toThrow(/delivered/);
  });

  it("returns the driver to idle after their last active stop", () => {
    // Tharindu (driver 3) has exactly one active stop: shipment 6.
    store.startDelivery(6);
    store.markDelivered(6);
    expect(store.getState().drivers.find((d) => d.id === 3)?.status).toBe("idle");
  });

  it("records fuel use on delivery", () => {
    const before = store.getState().drivers.find((d) => d.id === 3)!.fuelUsedTodayL;
    store.startDelivery(6);
    store.markDelivered(6);
    expect(store.getState().drivers.find((d) => d.id === 3)!.fuelUsedTodayL).toBeGreaterThan(before);
  });

  it("marks failed deliveries and alerts both ops and the customer", () => {
    const s = store.markFailed(4, "Nobody home");
    expect(s.status).toBe("failed");
    expect(s.onTime).toBe(false);
    const [customerNote, opsNote] = store.getState().notifications;
    expect(opsNote.audience).toBe("ops");
    expect(customerNote.audience).toBe("customer");
    expect(customerNote.body).toContain("Nobody home");
  });
});

describe("issues", () => {
  it("reports and resolves an issue", () => {
    const store = freshStore();
    const issue = store.reportIssue(4, "vehicle", "Flat tyre on the lorry");
    expect(issue.driverId).toBe(2);
    expect(store.getState().notifications[0].title).toContain("CYD-100004");

    store.resolveIssue(issue.id);
    const resolved = store.getState().issues.find((i) => i.id === issue.id)!;
    expect(resolved.resolvedAt).not.toBeNull();
    expect(() => store.resolveIssue(issue.id)).toThrow(/already resolved/i);
  });

  it("requires a note", () => {
    expect(() => freshStore().reportIssue(4, "delay", "  ")).toThrow(/note/i);
  });
});

describe("customer self-service", () => {
  let store: Store;
  beforeEach(() => {
    store = freshStore();
  });

  it("reschedules an active shipment", () => {
    const s = store.reschedule(5, "2026-06-15");
    expect(s.scheduledFor).toBe("2026-06-15");
    expect(s.history.at(-1)?.note).toContain("Rescheduled");
  });

  it("puts a failed shipment back into the dispatch pool on reschedule", () => {
    const s = store.reschedule(9, "2026-06-15");
    expect(s.status).toBe("created");
    expect(s.assignedDriverId).toBeNull();
  });

  it("blocks rescheduling delivered shipments and bad dates", () => {
    expect(() => store.reschedule(1, "2026-06-15")).toThrow(/delivered/);
    expect(() => store.reschedule(5, "15/06/2026")).toThrow(/yyyy-mm-dd/);
  });

  it("updates special instructions on open shipments only", () => {
    const s = store.updateInstructions(5, "  Gate code 4321 ");
    expect(s.specialInstructions).toBe("Gate code 4321");
    expect(() => store.updateInstructions(1, "x")).toThrow(/delivered/);
  });

  it("notification channels follow customer preferences", () => {
    // customer 2 (Perera & Sons) starts email-only
    store.reschedule(8, "2026-06-20"); // shipment 8 belongs to customer 2
    expect(store.getState().notifications[0].channels).toEqual(["in_app", "email"]);

    store.setCustomerPref(2, "sms", true);
    store.setCustomerPref(2, "email", false);
    store.reschedule(8, "2026-06-21");
    expect(store.getState().notifications[0].channels).toEqual(["in_app", "sms"]);
  });
});

describe("Resend email updates", () => {
  function storeWithFakeSender(result: { status: "sent" | "error"; detail: string | null }) {
    const sent: EmailMessage[] = [];
    const store = createStore({
      now: () => NOW,
      emailSender: async (msg) => {
        sent.push(msg);
        return result;
      },
    });
    return { store, sent };
  }
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("builds a branded, HTML-escaped email", () => {
    const msg = buildUpdateEmail({
      customerName: "Perera & Sons <Bakers>",
      to: "dispatch@pererasons.lk",
      title: "CYD-100008 rescheduled",
      body: "New delivery date: 2026-06-20.",
    });
    expect(msg.subject).toBe("CYD-100008 rescheduled");
    expect(msg.html).toContain("CeylonDispatch");
    expect(msg.html).toContain("Perera &amp; Sons &lt;Bakers&gt;");
    expect(msg.html).not.toContain("<Bakers>");
  });

  it("sends an email when a customer with email enabled is notified", async () => {
    const { store, sent } = storeWithFakeSender({ status: "sent", detail: "re_123" });
    store.reschedule(8, "2026-06-20"); // customer 2, email-only
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("dispatch@pererasons.lk");
    expect(sent[0].subject).toBe("CYD-100008 rescheduled");

    await flush();
    const entry = store.getState().emailLog[0];
    expect(entry.status).toBe("sent");
    expect(entry.detail).toBe("re_123");
    expect(entry.notificationId).toBe(store.getState().notifications[0].id);
  });

  it("does not email customers who disabled the email channel", () => {
    const { store, sent } = storeWithFakeSender({ status: "sent", detail: null });
    // customer 3 (TechZone) is SMS-only; shipment 7 belongs to them
    store.reschedule(7, "2026-06-20");
    expect(sent).toHaveLength(0);
  });

  it("records errors from the sender in the email log", async () => {
    const { store } = storeWithFakeSender({ status: "error", detail: "Resend HTTP 401" });
    store.reschedule(8, "2026-06-20");
    await flush();
    expect(store.getState().emailLog[0].status).toBe("error");
    expect(store.getState().emailLog[0].detail).toContain("401");
  });

  it("simulates (does not throw) when no API key is configured", async () => {
    const store = freshStore(); // default sender, RESEND_API_KEY is empty
    store.reschedule(8, "2026-06-20");
    await flush();
    expect(store.getState().emailLog[0].status).toBe("simulated");
  });
});

describe("route optimisation", () => {
  it("nearest-neighbour visits stops in distance order", () => {
    const order = nearestNeighbourOrder({ lat: 6.9, lng: 79.85 }, [
      { lat: 6.9, lng: 79.95 }, // far
      { lat: 6.9, lng: 79.87 }, // nearest
      { lat: 6.9, lng: 79.91 }, // middle
    ]);
    expect(order).toEqual([1, 2, 0]);
  });

  it("never produces a longer route than the input order", () => {
    const from = { lat: 6.96, lng: 79.89 };
    const stops = [
      { lat: 6.77, lng: 79.88 },
      { lat: 6.95, lng: 79.92 },
      { lat: 6.85, lng: 79.86 },
      { lat: 6.93, lng: 79.85 },
    ];
    const order = nearestNeighbourOrder(from, stops);
    const optimised = routeLengthKm(from, order.map((i) => stops[i]));
    expect(optimised).toBeLessThanOrEqual(routeLengthKm(from, stops));
  });

  it("re-sequences a driver's stops and reports savings in km", () => {
    const store = freshStore();
    // Give Kasun (driver 1) a third stop so ordering matters.
    store.assignDriver(10, 1);
    const result = store.optimizeRoute(1);
    expect(result.order).toHaveLength(3);
    expect(result.savedKm).toBeGreaterThanOrEqual(0);

    const stops = store
      .getState()
      .shipments.filter(
        (s) => s.assignedDriverId === 1 && (s.status === "assigned" || s.status === "in_transit"),
      )
      .sort((a, b) => (a.routeOrder ?? 0) - (b.routeOrder ?? 0));
    expect(stops.map((s) => s.routeOrder)).toEqual([1, 2, 3]);
    expect(stops.map((s) => s.trackingId)).toEqual(result.order);
  });

  it("throws when the driver has nothing to optimise", () => {
    const store = freshStore();
    store.startDelivery(6);
    store.markDelivered(6); // Tharindu now has no active stops
    expect(() => store.optimizeRoute(3)).toThrow(/no active stops/i);
  });
});

describe("notifications", () => {
  it("marks a single notification read, then all", () => {
    const store = freshStore();
    const unreadBefore = store.getState().notifications.filter((n) => !n.readAt).length;
    expect(unreadBefore).toBeGreaterThan(0);

    const first = store.getState().notifications.find((n) => !n.readAt)!;
    store.markNotificationRead(first.id);
    expect(store.getState().notifications.find((n) => n.id === first.id)?.readAt).not.toBeNull();

    store.markAllNotificationsRead();
    expect(store.getState().notifications.every((n) => n.readAt)).toBe(true);
  });
});

describe("live simulation", () => {
  it("moves en-route drivers toward their next stop and updates ETA", () => {
    const store = freshStore();
    const before = store.getState().drivers.find((d) => d.id === 1)!;
    const target = store.getState().shipments.find((s) => s.id === 3)!.destCoord;
    const distBefore = distanceKm(before.location, target);

    store.simulateTick();

    const after = store.getState().drivers.find((d) => d.id === 1)!;
    expect(distanceKm(after.location, target)).toBeLessThan(distBefore);
    expect(store.getState().shipments.find((s) => s.id === 3)!.etaMinutes).toBeGreaterThan(0);
  });
});

describe("reporting selectors (live data only)", () => {
  it("computes dashboard KPIs from state", () => {
    const store = freshStore();
    const k = computeKpis(store.getState(), NOW);
    expect(k.active).toBe(7); // 10 live − 2 delivered − 1 failed
    expect(k.inTransit).toBe(2);
    expect(k.deliveredToday).toBe(2);
    expect(k.unassigned).toBe(3);
    expect(k.openIssues).toBe(2);
    // 20 deliveries in the last 7 days, 3 of them late (seeded as real records)
    expect(k.onTimePct7d).toBe(85);
  });

  it("derives daily stats purely from shipment records", () => {
    const trend = computeDailyStats(freshStore().getState(), NOW, 7);
    expect(trend).toHaveLength(7);
    expect(trend.at(-1)?.date).toBe(TODAY);
    // per-day delivery counts follow the seeded historical records: 2,3,4,2,3,4 then 2 today
    expect(trend.map((d) => d.deliveries)).toEqual([2, 3, 4, 2, 3, 4, 2]);
    // today's fuel is the live sum of the drivers' counters
    expect(trend.at(-1)?.fuelL).toBeCloseTo(11.5, 1);
  });

  it("reflects new deliveries immediately — no pre-baked stats", () => {
    const store = freshStore();
    const before = computeTodayStat(store.getState(), NOW);
    store.startDelivery(6);
    store.markDelivered(6);
    const after = computeTodayStat(store.getState(), NOW);
    expect(after.deliveries).toBe(before.deliveries + 1);
    expect(after.fuelL).toBeGreaterThan(before.fuelL);
  });

  it("summarises per-driver performance", () => {
    const perf = driverPerformance(freshStore().getState(), NOW);
    const kasun = perf.find((p) => p.name === "Kasun Perera")!;
    expect(kasun.deliveredToday).toBe(1);
    expect(kasun.activeStops).toBe(2);
    const nuwan = perf.find((p) => p.name === "Nuwan Silva")!;
    expect(nuwan.failed).toBe(1);
  });

  it("flags bottlenecks: stale unassigned, failures, open issues", () => {
    const flags = findBottlenecks(freshStore().getState(), NOW);
    const labels = flags.map((f) => f.label).join(" | ");
    expect(labels).toContain("CYD-100007 unassigned for over 24h");
    expect(labels).toContain("CYD-100009 failed");
    expect(flags.some((f) => f.label.includes("issue"))).toBe(true);
  });

  it("exports a well-formed CSV", () => {
    const csv = buildReportCsv(freshStore().getState(), NOW);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("date,deliveries,avg_delivery_mins,on_time_pct,delayed,fuel_litres");
    expect(lines).toHaveLength(8); // header + 7 days
    expect(lines.at(-1)).toContain(TODAY);
  });
});
