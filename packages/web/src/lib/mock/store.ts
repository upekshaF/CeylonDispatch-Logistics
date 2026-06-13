/**
 * In-memory mock store with framework-free, unit-testable business logic.
 *
 * The store owns a single `State` object. Every action validates input,
 * mutates a draft, stamps history, generates notifications (and Resend
 * emails), and notifies subscribers. React binds via useSyncExternalStore.
 *
 * Geometry is real: coordinates are WGS84 lat/lng around Colombo and all
 * distances are kilometres.
 */
import type {
  AppNotification,
  Channel,
  Customer,
  DailyStat,
  Driver,
  EmailLogEntry,
  Issue,
  IssueType,
  Point,
  Priority,
  Shipment,
  ShipmentStatus,
  State,
} from "./types.js";
import { makeSeed, DEPOT, DEPOT_NAME } from "./seed.js";
import {
  buildUpdateEmail,
  sendWithResend,
  type EmailSender,
} from "../email/resend.js";

const H = 3_600_000;
const DAY = 24 * H;

export interface StoreOptions {
  now?: () => number;
  seed?: State;
  /** Injectable for tests; defaults to the real Resend client. */
  emailSender?: EmailSender;
}

export interface CreateShipmentInput {
  customerId: number;
  origin?: string;
  destination: string;
  destCoord?: Point;
  weightKg: number;
  priority?: Priority;
  scheduledFor?: string; // yyyy-mm-dd
  specialInstructions?: string | null;
}

/** Great-circle distance in km (equirectangular approximation — fine at city scale). */
export function distanceKm(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * Math.cos(((a.lat + b.lat) / 2) * rad) * 111.32;
  const y = (b.lat - a.lat) * 110.57;
  return Math.hypot(x, y);
}

/** Nearest-neighbour ordering of stops starting from `from`. Returns indices into `stops`. */
export function nearestNeighbourOrder(from: Point, stops: Point[]): number[] {
  const remaining = stops.map((_, i) => i);
  const order: number[] = [];
  let cursor = from;
  while (remaining.length > 0) {
    let best = 0;
    for (let i = 1; i < remaining.length; i++) {
      if (distanceKm(cursor, stops[remaining[i]]) < distanceKm(cursor, stops[remaining[best]])) {
        best = i;
      }
    }
    const idx = remaining.splice(best, 1)[0];
    order.push(idx);
    cursor = stops[idx];
  }
  return order;
}

export function routeLengthKm(from: Point, stops: Point[]): number {
  let total = 0;
  let cursor = from;
  for (const s of stops) {
    total += distanceKm(cursor, s);
    cursor = s;
  }
  return total;
}

/** Demo fuel model: litres for a leg of `km` city driving (vans ≈ 5.5 km/L). */
export function fuelForKm(km: number): number {
  return Math.round((km * 0.18 + 0.3) * 10) / 10;
}

/** Demo ETA model: ~3 min per km in Colombo traffic. */
export function etaMinutesForKm(km: number): number {
  return Math.max(4, Math.round(km * 3));
}

export function createStore(opts: StoreOptions = {}) {
  const now = opts.now ?? (() => Date.now());
  const emailSender = opts.emailSender ?? sendWithResend;
  let state: State = opts.seed ?? makeSeed(now());
  const listeners = new Set<() => void>();

  const iso = () => new Date(now()).toISOString();
  const today = () => new Date(now()).toISOString().slice(0, 10);

  function emit() {
    state = { ...state };
    listeners.forEach((l) => l());
  }

  function getState(): State {
    return state;
  }

  function subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  // ---------- internal helpers ----------

  function shipment(id: number): Shipment {
    const s = state.shipments.find((s) => s.id === id);
    if (!s) throw new Error(`Shipment ${id} not found`);
    return s;
  }

  function driver(id: number): Driver {
    const d = state.drivers.find((d) => d.id === id);
    if (!d) throw new Error(`Driver ${id} not found`);
    return d;
  }

  function customer(id: number): Customer {
    const c = state.customers.find((c) => c.id === id);
    if (!c) throw new Error(`Customer ${id} not found`);
    return c;
  }

  function touch(s: Shipment, status: ShipmentStatus | null, note: string | null, actor: string) {
    if (status) s.status = status;
    s.updatedAt = iso();
    s.history = [...s.history, { at: iso(), status: s.status, note, actor }];
  }

  function notify(input: {
    kind: string;
    title: string;
    body: string;
    audience: "ops" | "customer";
    customerId?: number | null;
  }) {
    const channels: Channel[] = ["in_app"];
    let cust: Customer | null = null;
    if (input.audience === "customer" && input.customerId != null) {
      cust = customer(input.customerId);
      if (cust.prefs.email) channels.push("email");
      if (cust.prefs.sms) channels.push("sms");
    }
    const n: AppNotification = {
      id: ++state.counters.notification,
      kind: input.kind,
      title: input.title,
      body: input.body,
      audience: input.audience,
      customerId: input.customerId ?? null,
      channels,
      createdAt: iso(),
      readAt: null,
    };
    state.notifications = [n, ...state.notifications];
    if (cust && channels.includes("email")) {
      dispatchEmail(n, cust);
    }
    return n;
  }

  /** Queues an email for the notification and sends it via Resend (async). */
  function dispatchEmail(n: AppNotification, cust: Customer) {
    const msg = buildUpdateEmail({
      customerName: cust.name,
      to: cust.email,
      title: n.title,
      body: n.body,
    });
    const entry: EmailLogEntry = {
      id: ++state.counters.email,
      notificationId: n.id,
      customerId: cust.id,
      to: msg.to,
      subject: msg.subject,
      status: "queued",
      detail: null,
      createdAt: iso(),
    };
    state.emailLog = [entry, ...state.emailLog];
    void emailSender(msg).then((result) => {
      state.emailLog = state.emailLog.map((e) =>
        e.id === entry.id ? { ...e, status: result.status, detail: result.detail } : e,
      );
      emit();
    });
  }

  function activeStopsFor(driverId: number): Shipment[] {
    return state.shipments
      .filter(
        (s) =>
          s.assignedDriverId === driverId &&
          (s.status === "assigned" || s.status === "in_transit"),
      )
      .sort((a, b) => (a.routeOrder ?? 99) - (b.routeOrder ?? 99));
  }

  // ---------- actions ----------

  function createShipment(input: CreateShipmentInput): Shipment {
    if (!input.destination.trim()) throw new Error("Destination is required");
    if (!(input.weightKg > 0)) throw new Error("Weight must be positive");
    customer(input.customerId); // validates existence
    const id = ++state.counters.shipment;
    const trackingId = `CYD-${++state.counters.tracking}`;
    const s: Shipment = {
      id,
      trackingId,
      customerId: input.customerId,
      origin: input.origin?.trim() || DEPOT_NAME,
      destination: input.destination.trim(),
      // default: deterministic spot in the greater-Colombo area
      destCoord:
        input.destCoord ?? {
          lat: 6.79 + ((id * 37) % 17) / 100,
          lng: 79.85 + ((id * 23) % 13) / 100,
        },
      weightKg: input.weightKg,
      priority: input.priority ?? "standard",
      status: "created",
      specialInstructions: input.specialInstructions?.trim() || null,
      scheduledFor: input.scheduledFor ?? today(),
      assignedDriverId: null,
      assignedAt: null,
      routeOrder: null,
      etaMinutes: null,
      createdAt: iso(),
      updatedAt: iso(),
      deliveredAt: null,
      deliveryMins: null,
      onTime: null,
      history: [{ at: iso(), status: "created", note: null, actor: "dispatcher" }],
    };
    state.shipments = [...state.shipments, s];
    notify({
      kind: "created",
      title: `Shipment ${trackingId} created`,
      body: `${s.origin} → ${s.destination}, scheduled ${s.scheduledFor}.`,
      audience: "customer",
      customerId: s.customerId,
    });
    emit();
    return s;
  }

  function assignDriver(shipmentId: number, driverId: number): Shipment {
    const s = shipment(shipmentId);
    const d = driver(driverId);
    if (s.status !== "created" && s.status !== "assigned") {
      throw new Error(`Cannot assign a shipment that is ${s.status}`);
    }
    s.assignedDriverId = d.id;
    s.assignedAt = iso();
    s.routeOrder = activeStopsFor(d.id).filter((x) => x.id !== s.id).length + 1;
    touch(s, "assigned", `Assigned to ${d.name}`, "dispatcher");
    notify({
      kind: "assigned",
      title: `${s.trackingId} assigned to ${d.name}`,
      body: `Your delivery to ${s.destination} is scheduled for ${s.scheduledFor}.`,
      audience: "customer",
      customerId: s.customerId,
    });
    emit();
    return s;
  }

  function startDelivery(shipmentId: number): Shipment {
    const s = shipment(shipmentId);
    if (s.status !== "assigned") {
      throw new Error(`Cannot start a shipment that is ${s.status}`);
    }
    const d = driver(s.assignedDriverId!);
    d.status = "en_route";
    s.etaMinutes = etaMinutesForKm(distanceKm(d.location, s.destCoord));
    touch(s, "in_transit", null, d.name);
    notify({
      kind: "status",
      title: `${s.trackingId} out for delivery`,
      body: `${d.name} is on the way to ${s.destination}. ETA ${s.etaMinutes} min.`,
      audience: "customer",
      customerId: s.customerId,
    });
    emit();
    return s;
  }

  function markDelivered(shipmentId: number, note?: string): Shipment {
    const s = shipment(shipmentId);
    if (s.status !== "in_transit") {
      throw new Error(`Cannot deliver a shipment that is ${s.status}`);
    }
    const d = driver(s.assignedDriverId!);
    const startMs = Date.parse(s.assignedAt ?? s.createdAt);
    s.deliveredAt = iso();
    s.deliveryMins = Math.max(1, Math.round((now() - startMs) / 60_000));
    s.onTime = s.deliveredAt.slice(0, 10) <= s.scheduledFor;
    s.etaMinutes = null;
    d.fuelUsedTodayL =
      Math.round((d.fuelUsedTodayL + fuelForKm(distanceKm(d.location, s.destCoord))) * 10) / 10;
    d.location = { ...s.destCoord };
    touch(s, "delivered", note ?? null, d.name);
    if (activeStopsFor(d.id).length === 0) d.status = "idle";
    notify({
      kind: "delivered",
      title: `${s.trackingId} delivered`,
      body: `Delivered to ${s.destination}${note ? ` — ${note}` : ""}.`,
      audience: "customer",
      customerId: s.customerId,
    });
    emit();
    return s;
  }

  function markFailed(shipmentId: number, reason: string): Shipment {
    const s = shipment(shipmentId);
    if (s.status !== "assigned" && s.status !== "in_transit") {
      throw new Error(`Cannot fail a shipment that is ${s.status}`);
    }
    const d = s.assignedDriverId != null ? driver(s.assignedDriverId) : null;
    s.onTime = false;
    s.etaMinutes = null;
    s.routeOrder = null;
    touch(s, "failed", reason, d?.name ?? "system");
    if (d && activeStopsFor(d.id).length === 0) d.status = "idle";
    notify({
      kind: "failed",
      title: `Delivery failed for ${s.trackingId}`,
      body: `${reason}. Reschedule required.`,
      audience: "ops",
    });
    notify({
      kind: "failed",
      title: `We missed you — ${s.trackingId}`,
      body: `${reason}. Please reschedule or add delivery instructions.`,
      audience: "customer",
      customerId: s.customerId,
    });
    emit();
    return s;
  }

  function reportIssue(shipmentId: number, type: IssueType, note: string): Issue {
    const s = shipment(shipmentId);
    if (!note.trim()) throw new Error("Issue note is required");
    const issue: Issue = {
      id: ++state.counters.issue,
      shipmentId: s.id,
      driverId: s.assignedDriverId,
      type,
      note: note.trim(),
      createdAt: iso(),
      resolvedAt: null,
    };
    state.issues = [issue, ...state.issues];
    touch(s, null, `Issue (${type}): ${note.trim()}`, s.assignedDriverId != null ? driver(s.assignedDriverId).name : "system");
    notify({
      kind: "issue",
      title: `Issue reported on ${s.trackingId}`,
      body: `${type.replace("_", " ")}: ${note.trim()}`,
      audience: "ops",
    });
    emit();
    return issue;
  }

  function resolveIssue(issueId: number): Issue {
    const issue = state.issues.find((i) => i.id === issueId);
    if (!issue) throw new Error(`Issue ${issueId} not found`);
    if (issue.resolvedAt) throw new Error("Issue already resolved");
    issue.resolvedAt = iso();
    state.issues = [...state.issues];
    emit();
    return issue;
  }

  function reschedule(shipmentId: number, newDate: string): Shipment {
    const s = shipment(shipmentId);
    if (s.status === "delivered") throw new Error("Cannot reschedule a delivered shipment");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) throw new Error("Date must be yyyy-mm-dd");
    const old = s.scheduledFor;
    s.scheduledFor = newDate;
    if (s.status === "failed") {
      // failed shipments go back into the dispatch pool
      s.status = "created";
      s.assignedDriverId = null;
      s.assignedAt = null;
      s.onTime = null;
    }
    touch(s, null, `Rescheduled ${old} → ${newDate}`, "customer");
    notify({
      kind: "reschedule",
      title: `${s.trackingId} rescheduled`,
      body: `New delivery date: ${newDate}.`,
      audience: "customer",
      customerId: s.customerId,
    });
    emit();
    return s;
  }

  function updateInstructions(shipmentId: number, text: string): Shipment {
    const s = shipment(shipmentId);
    if (s.status === "delivered" || s.status === "failed") {
      throw new Error(`Cannot update instructions on a ${s.status} shipment`);
    }
    s.specialInstructions = text.trim() || null;
    touch(s, null, "Special instructions updated", "customer");
    emit();
    return s;
  }

  function optimizeRoute(driverId: number): { order: string[]; savedKm: number } {
    const d = driver(driverId);
    const stops = activeStopsFor(driverId);
    if (stops.length === 0) throw new Error(`${d.name} has no active stops to optimise`);
    const before = routeLengthKm(d.location, stops.map((s) => s.destCoord));
    const order = nearestNeighbourOrder(d.location, stops.map((s) => s.destCoord));
    order.forEach((stopIdx, position) => {
      stops[stopIdx].routeOrder = position + 1;
      stops[stopIdx].updatedAt = iso();
    });
    const ordered = order.map((i) => stops[i]);
    const after = routeLengthKm(d.location, ordered.map((s) => s.destCoord));
    const savedKm = Math.max(0, Math.round((before - after) * 10) / 10);
    state.shipments = [...state.shipments];
    notify({
      kind: "route",
      title: `Route optimised for ${d.name}`,
      body: `${ordered.length} stops re-sequenced${savedKm > 0 ? `, est. ${savedKm} km saved` : ""}.`,
      audience: "ops",
    });
    emit();
    return { order: ordered.map((s) => s.trackingId), savedKm };
  }

  function setCustomerPref(customerId: number, channel: "email" | "sms", enabled: boolean) {
    const c = customer(customerId);
    c.prefs = { ...c.prefs, [channel]: enabled };
    state.customers = [...state.customers];
    emit();
  }

  function markNotificationRead(id: number) {
    const n = state.notifications.find((n) => n.id === id);
    if (!n) throw new Error(`Notification ${id} not found`);
    if (!n.readAt) {
      n.readAt = iso();
      state.notifications = [...state.notifications];
      emit();
    }
  }

  function markAllNotificationsRead() {
    state.notifications = state.notifications.map((n) =>
      n.readAt ? n : { ...n, readAt: iso() },
    );
    emit();
  }

  /** Moves en-route drivers a step closer to their next stop. Called on a UI interval. */
  function simulateTick() {
    let moved = false;
    for (const d of state.drivers) {
      if (d.status !== "en_route") continue;
      const next = activeStopsFor(d.id).find((s) => s.status === "in_transit")
        ?? activeStopsFor(d.id)[0];
      if (!next) continue;
      const dist = distanceKm(d.location, next.destCoord);
      if (dist < 0.15) continue;
      const step = Math.max(0.25, dist * 0.12); // km per tick
      const t = Math.min(1, step / dist);
      d.location = {
        lat: d.location.lat + (next.destCoord.lat - d.location.lat) * t,
        lng: d.location.lng + (next.destCoord.lng - d.location.lng) * t,
      };
      if (next.status === "in_transit") {
        next.etaMinutes = Math.max(1, etaMinutesForKm(distanceKm(d.location, next.destCoord)) - 3);
      }
      moved = true;
    }
    if (moved) {
      state.drivers = [...state.drivers];
      emit();
    }
  }

  return {
    getState,
    subscribe,
    createShipment,
    assignDriver,
    startDelivery,
    markDelivered,
    markFailed,
    reportIssue,
    resolveIssue,
    reschedule,
    updateInstructions,
    optimizeRoute,
    setCustomerPref,
    markNotificationRead,
    markAllNotificationsRead,
    simulateTick,
    now,
  };
}

export type Store = ReturnType<typeof createStore>;

// ---------- pure selectors (also unit-tested) ----------
// Reports are derived ONLY from live state — no pre-baked statistics.
// Each selector aggregates in a single pass over the data it needs.

export interface Kpis {
  active: number;
  inTransit: number;
  deliveredToday: number;
  unassigned: number;
  openIssues: number;
  onTimePct7d: number;
  unreadNotifications: number;
}

export function computeKpis(state: State, nowMs: number): Kpis {
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const weekAgo = nowMs - 7 * DAY;
  let active = 0;
  let inTransit = 0;
  let deliveredToday = 0;
  let unassigned = 0;
  let recentDelivered = 0;
  let recentOnTime = 0;
  for (const s of state.shipments) {
    if (s.status !== "delivered" && s.status !== "failed") active++;
    if (s.status === "in_transit") inTransit++;
    if (s.status === "created") unassigned++;
    if (s.deliveredAt) {
      if (s.deliveredAt.slice(0, 10) === today) deliveredToday++;
      if (Date.parse(s.deliveredAt) >= weekAgo) {
        recentDelivered++;
        if (s.onTime) recentOnTime++;
      }
    }
  }
  let openIssues = 0;
  for (const i of state.issues) if (!i.resolvedAt) openIssues++;
  let unreadNotifications = 0;
  for (const n of state.notifications) if (!n.readAt) unreadNotifications++;
  return {
    active,
    inTransit,
    deliveredToday,
    unassigned,
    openIssues,
    onTimePct7d: recentDelivered > 0 ? Math.round((recentOnTime / recentDelivered) * 100) : 100,
    unreadNotifications,
  };
}

/**
 * Daily performance for the last `days` days (oldest → today), aggregated
 * live from shipment records in a single pass.
 *
 * Fuel: today uses the drivers' actual fuel counters; past days are estimated
 * from each delivered shipment's depot→destination distance.
 */
export function computeDailyStats(state: State, nowMs: number, days = 7): DailyStat[] {
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const buckets = new Map<
    string,
    { deliveries: number; mins: number; onTime: number; delayed: number; fuelL: number }
  >();
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(nowMs - i * DAY).toISOString().slice(0, 10);
    dates.push(date);
    buckets.set(date, { deliveries: 0, mins: 0, onTime: 0, delayed: 0, fuelL: 0 });
  }

  for (const s of state.shipments) {
    if (s.deliveredAt) {
      const b = buckets.get(s.deliveredAt.slice(0, 10));
      if (b) {
        b.deliveries++;
        b.mins += s.deliveryMins ?? 0;
        if (s.onTime) b.onTime++;
        else b.delayed++;
        if (s.deliveredAt.slice(0, 10) !== today) {
          b.fuelL += fuelForKm(distanceKm(DEPOT, s.destCoord));
        }
      }
    } else if (s.status === "failed") {
      const b = buckets.get(s.updatedAt.slice(0, 10));
      if (b) b.delayed++;
    }
  }
  // today's fuel is the live truth from the drivers
  const todayBucket = buckets.get(today);
  if (todayBucket) {
    todayBucket.fuelL = state.drivers.reduce((a, d) => a + d.fuelUsedTodayL, 0);
  }

  return dates.map((date) => {
    const b = buckets.get(date)!;
    return {
      date,
      deliveries: b.deliveries,
      avgDeliveryMins: b.deliveries > 0 ? Math.round(b.mins / b.deliveries) : 0,
      onTimePct: b.deliveries > 0 ? Math.round((b.onTime / b.deliveries) * 100) : 100,
      delayed: b.delayed,
      fuelL: Math.round(b.fuelL * 10) / 10,
    };
  });
}

/** Today's stats — convenience wrapper around computeDailyStats. */
export function computeTodayStat(state: State, nowMs: number): DailyStat {
  return computeDailyStats(state, nowMs, 1)[0];
}

export interface DriverPerf {
  driverId: number;
  name: string;
  vehicle: string;
  activeStops: number;
  deliveredToday: number;
  failed: number;
  avgDeliveryMins: number;
  fuelL: number;
}

export function driverPerformance(state: State, nowMs: number): DriverPerf[] {
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const byDriver = new Map<number, { active: number; done: number; failed: number; mins: number }>();
  for (const d of state.drivers) byDriver.set(d.id, { active: 0, done: 0, failed: 0, mins: 0 });
  for (const s of state.shipments) {
    if (s.assignedDriverId == null) continue;
    const agg = byDriver.get(s.assignedDriverId);
    if (!agg) continue;
    if (s.status === "assigned" || s.status === "in_transit") agg.active++;
    if (s.status === "failed") agg.failed++;
    if (s.deliveredAt?.slice(0, 10) === today) {
      agg.done++;
      agg.mins += s.deliveryMins ?? 0;
    }
  }
  return state.drivers.map((d) => {
    const agg = byDriver.get(d.id)!;
    return {
      driverId: d.id,
      name: d.name,
      vehicle: d.vehicle,
      activeStops: agg.active,
      deliveredToday: agg.done,
      failed: agg.failed,
      avgDeliveryMins: agg.done > 0 ? Math.round(agg.mins / agg.done) : 0,
      fuelL: d.fuelUsedTodayL,
    };
  });
}

export interface Bottleneck {
  severity: "high" | "medium";
  label: string;
  detail: string;
}

export function findBottlenecks(state: State, nowMs: number): Bottleneck[] {
  const out: Bottleneck[] = [];
  for (const s of state.shipments) {
    if (s.status === "created" && nowMs - Date.parse(s.createdAt) > 24 * H) {
      out.push({
        severity: "high",
        label: `${s.trackingId} unassigned for over 24h`,
        detail: `${s.destination} — created ${s.createdAt.slice(0, 16).replace("T", " ")}.`,
      });
    }
    if (s.status === "failed") {
      out.push({
        severity: "high",
        label: `${s.trackingId} failed — needs reschedule`,
        detail: s.history[s.history.length - 1]?.note ?? "Delivery attempt failed.",
      });
    }
  }
  for (const i of state.issues) {
    if (i.resolvedAt) continue;
    const s = state.shipments.find((s) => s.id === i.shipmentId);
    out.push({
      severity: i.type === "delay" ? "medium" : "high",
      label: `Open ${i.type.replace("_", " ")} issue on ${s?.trackingId ?? "?"}`,
      detail: i.note,
    });
  }
  for (const d of state.drivers) {
    let stops = 0;
    for (const s of state.shipments) {
      if (s.assignedDriverId === d.id && (s.status === "assigned" || s.status === "in_transit")) {
        stops++;
      }
    }
    if (stops >= 4) {
      out.push({
        severity: "medium",
        label: `${d.name} is overloaded`,
        detail: `${stops} active stops — consider reassigning.`,
      });
    }
  }
  return out;
}

/** CSV export for the Reports tab — derived live from shipment records. */
export function buildReportCsv(state: State, nowMs: number): string {
  const rows = [
    ["date", "deliveries", "avg_delivery_mins", "on_time_pct", "delayed", "fuel_litres"],
    ...computeDailyStats(state, nowMs, 7).map((d) => [
      d.date,
      String(d.deliveries),
      String(d.avgDeliveryMins),
      String(d.onTimePct),
      String(d.delayed),
      String(d.fuelL),
    ]),
  ];
  return rows.map((r) => r.join(",")).join("\n");
}

export { DEPOT, DEPOT_NAME };
