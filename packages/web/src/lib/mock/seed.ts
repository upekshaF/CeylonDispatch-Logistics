/**
 * Deterministic mock data seed — CeylonDispatch demo, Colombo, Sri Lanka.
 *
 * Timestamps are computed relative to `nowMs` so the demo always looks "live".
 * Historical deliveries are real shipment records (not synthetic aggregates):
 * the Reports tab derives every chart from this data.
 */
import type {
  Customer,
  Driver,
  EmailLogEntry,
  HistoryEvent,
  Issue,
  AppNotification,
  Point,
  Shipment,
  ShipmentStatus,
  State,
} from "./types.js";

const iso = (ms: number) => new Date(ms).toISOString();
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const H = 3_600_000;
const D = 24 * H;

/** Main depot — Peliyagoda logistics hub, north of Colombo. */
export const DEPOT: Point = { lat: 6.9612, lng: 79.887 };
export const DEPOT_NAME = "Depot — Peliyagoda";

/** Real Colombo-area delivery locations. */
export const PLACES: Array<{ name: string; coord: Point }> = [
  { name: "Pettah", coord: { lat: 6.9355, lng: 79.85 } },
  { name: "Kollupitiya", coord: { lat: 6.9115, lng: 79.8485 } },
  { name: "Borella", coord: { lat: 6.9146, lng: 79.8779 } },
  { name: "Nugegoda", coord: { lat: 6.8649, lng: 79.8997 } },
  { name: "Rajagiriya", coord: { lat: 6.9088, lng: 79.8945 } },
  { name: "Bambalapitiya", coord: { lat: 6.893, lng: 79.8553 } },
  { name: "Dehiwala", coord: { lat: 6.8511, lng: 79.865 } },
  { name: "Mount Lavinia", coord: { lat: 6.839, lng: 79.863 } },
  { name: "Maharagama", coord: { lat: 6.848, lng: 79.9265 } },
  { name: "Wellawatte", coord: { lat: 6.874, lng: 79.8606 } },
  { name: "Sri Jayawardenepura Kotte", coord: { lat: 6.889, lng: 79.917 } },
  { name: "Kelaniya", coord: { lat: 6.9553, lng: 79.922 } },
  { name: "Moratuwa", coord: { lat: 6.773, lng: 79.8816 } },
  { name: "Battaramulla", coord: { lat: 6.8964, lng: 79.9181 } },
  { name: "Kaduwela", coord: { lat: 6.933, lng: 79.984 } },
];

function place(name: string): Point {
  const p = PLACES.find((p) => p.name === name);
  if (!p) throw new Error(`Unknown place: ${name}`);
  return { ...p.coord };
}

function history(
  nowMs: number,
  steps: Array<{ hoursAgo: number; status: ShipmentStatus; note?: string; actor?: string }>,
): HistoryEvent[] {
  return steps.map((s) => ({
    at: iso(nowMs - s.hoursAgo * H),
    status: s.status,
    note: s.note ?? null,
    actor: s.actor ?? "system",
  }));
}

export function makeSeed(nowMs: number): State {
  const customers: Customer[] = [
    { id: 1, name: "Cargills Food City — Borella", email: "meenufernando18@gmail.com", phone: "+94 77 123 4501", address: "T.B. Jayah Mawatha, Borella", prefs: { email: true, sms: true } },
    { id: 2, name: "Perera & Sons Bakers", email: "dispatch@pererasons.lk", phone: "+94 77 123 4502", address: "Galle Rd, Kollupitiya", prefs: { email: true, sms: false } },
    { id: 3, name: "TechZone Lanka", email: "ops@techzonelanka.lk", phone: "+94 76 123 4503", address: "Duplication Rd, Bambalapitiya", prefs: { email: false, sms: true } },
    { id: 4, name: "Osu Sala Pharmacy — Nugegoda", email: "orders@osusala.lk", phone: "+94 71 123 4504", address: "High Level Rd, Nugegoda", prefs: { email: true, sms: true } },
    { id: 5, name: "Dilmah Tea Boutique", email: "store@dilmahboutique.lk", phone: "+94 70 123 4505", address: "Chatham St, Fort", prefs: { email: true, sms: false } },
  ];

  const drivers: Driver[] = [
    { id: 1, name: "Kasun Perera", vehicle: "Toyota HiAce", plate: "WP CAB-4071", status: "en_route", location: { lat: 6.928, lng: 79.868 }, shiftEnds: iso(nowMs + 6 * H), fuelUsedTodayL: 6.4 },
    { id: 2, name: "Nuwan Silva", vehicle: "Isuzu Elf", plate: "WP LF-2354", status: "en_route", location: { lat: 6.898, lng: 79.886 }, shiftEnds: iso(nowMs + 5 * H), fuelUsedTodayL: 5.1 },
    { id: 3, name: "Tharindu Fernando", vehicle: "EV Cargo Tuk", plate: "WP TUK-1188", status: "idle", location: { lat: 6.958, lng: 79.889 }, shiftEnds: iso(nowMs + 7 * H), fuelUsedTodayL: 0 },
  ];

  const shipments: Shipment[] = [
    {
      id: 1, trackingId: "CYD-100001", customerId: 1, origin: DEPOT_NAME, destination: "Pettah",
      destCoord: place("Pettah"), weightKg: 12.5, priority: "standard", status: "delivered",
      specialInstructions: "Leave with the storekeeper.", scheduledFor: day(nowMs),
      assignedDriverId: 1, assignedAt: iso(nowMs - 6 * H), routeOrder: 1, etaMinutes: null,
      createdAt: iso(nowMs - 8 * H), updatedAt: iso(nowMs - 2 * H),
      deliveredAt: iso(nowMs - 2 * H), deliveryMins: 240, onTime: true,
      history: history(nowMs, [
        { hoursAgo: 8, status: "created", actor: "dispatcher" },
        { hoursAgo: 6, status: "assigned", note: "Assigned to Kasun Perera", actor: "dispatcher" },
        { hoursAgo: 4, status: "in_transit", actor: "Kasun Perera" },
        { hoursAgo: 2, status: "delivered", note: "Signed by R. Jayasuriya", actor: "Kasun Perera" },
      ]),
    },
    {
      id: 2, trackingId: "CYD-100002", customerId: 2, origin: DEPOT_NAME, destination: "Kollupitiya",
      destCoord: place("Kollupitiya"), weightKg: 4.2, priority: "express", status: "delivered",
      specialInstructions: null, scheduledFor: day(nowMs),
      assignedDriverId: 2, assignedAt: iso(nowMs - 5 * H), routeOrder: 1, etaMinutes: null,
      createdAt: iso(nowMs - 7 * H), updatedAt: iso(nowMs - 1.5 * H),
      deliveredAt: iso(nowMs - 1.5 * H), deliveryMins: 210, onTime: true,
      history: history(nowMs, [
        { hoursAgo: 7, status: "created", actor: "dispatcher" },
        { hoursAgo: 5, status: "assigned", note: "Assigned to Nuwan Silva", actor: "dispatcher" },
        { hoursAgo: 3, status: "in_transit", actor: "Nuwan Silva" },
        { hoursAgo: 1.5, status: "delivered", note: "Left at the bakery counter", actor: "Nuwan Silva" },
      ]),
    },
    {
      id: 3, trackingId: "CYD-100003", customerId: 3, origin: DEPOT_NAME, destination: "Borella",
      destCoord: place("Borella"), weightKg: 22.0, priority: "standard", status: "in_transit",
      specialInstructions: "Call on arrival.", scheduledFor: day(nowMs),
      assignedDriverId: 1, assignedAt: iso(nowMs - 4 * H), routeOrder: 1, etaMinutes: 25,
      createdAt: iso(nowMs - 9 * H), updatedAt: iso(nowMs - 0.5 * H),
      deliveredAt: null, deliveryMins: null, onTime: null,
      history: history(nowMs, [
        { hoursAgo: 9, status: "created", actor: "dispatcher" },
        { hoursAgo: 4, status: "assigned", note: "Assigned to Kasun Perera", actor: "dispatcher" },
        { hoursAgo: 0.5, status: "in_transit", note: "Traffic near Town Hall — running late", actor: "Kasun Perera" },
      ]),
    },
    {
      id: 4, trackingId: "CYD-100004", customerId: 4, origin: DEPOT_NAME, destination: "Nugegoda",
      destCoord: place("Nugegoda"), weightKg: 8.7, priority: "express", status: "in_transit",
      specialInstructions: "Fragile — medical supplies.", scheduledFor: day(nowMs),
      assignedDriverId: 2, assignedAt: iso(nowMs - 3 * H), routeOrder: 2, etaMinutes: 15,
      createdAt: iso(nowMs - 5 * H), updatedAt: iso(nowMs - 0.3 * H),
      deliveredAt: null, deliveryMins: null, onTime: null,
      history: history(nowMs, [
        { hoursAgo: 5, status: "created", actor: "dispatcher" },
        { hoursAgo: 3, status: "assigned", note: "Assigned to Nuwan Silva", actor: "dispatcher" },
        { hoursAgo: 0.3, status: "in_transit", actor: "Nuwan Silva" },
      ]),
    },
    {
      id: 5, trackingId: "CYD-100005", customerId: 5, origin: DEPOT_NAME, destination: "Rajagiriya",
      destCoord: place("Rajagiriya"), weightKg: 16.4, priority: "standard", status: "assigned",
      specialInstructions: null, scheduledFor: day(nowMs),
      assignedDriverId: 1, assignedAt: iso(nowMs - 2 * H), routeOrder: 2, etaMinutes: null,
      createdAt: iso(nowMs - 6 * H), updatedAt: iso(nowMs - 2 * H),
      deliveredAt: null, deliveryMins: null, onTime: null,
      history: history(nowMs, [
        { hoursAgo: 6, status: "created", actor: "dispatcher" },
        { hoursAgo: 2, status: "assigned", note: "Assigned to Kasun Perera", actor: "dispatcher" },
      ]),
    },
    {
      id: 6, trackingId: "CYD-100006", customerId: 1, origin: DEPOT_NAME, destination: "Bambalapitiya",
      destCoord: place("Bambalapitiya"), weightKg: 3.1, priority: "express", status: "assigned",
      specialInstructions: "Ring the back-door bell twice.", scheduledFor: day(nowMs),
      assignedDriverId: 3, assignedAt: iso(nowMs - 1 * H), routeOrder: 1, etaMinutes: null,
      createdAt: iso(nowMs - 3 * H), updatedAt: iso(nowMs - 1 * H),
      deliveredAt: null, deliveryMins: null, onTime: null,
      history: history(nowMs, [
        { hoursAgo: 3, status: "created", actor: "dispatcher" },
        { hoursAgo: 1, status: "assigned", note: "Assigned to Tharindu Fernando", actor: "dispatcher" },
      ]),
    },
    {
      id: 7, trackingId: "CYD-100007", customerId: 3, origin: DEPOT_NAME, destination: "Dehiwala",
      destCoord: place("Dehiwala"), weightKg: 45.0, priority: "standard", status: "created",
      specialInstructions: null, scheduledFor: day(nowMs + D),
      assignedDriverId: null, assignedAt: null, routeOrder: null, etaMinutes: null,
      createdAt: iso(nowMs - 26 * H), updatedAt: iso(nowMs - 26 * H),
      deliveredAt: null, deliveryMins: null, onTime: null,
      history: history(nowMs, [{ hoursAgo: 26, status: "created", actor: "dispatcher" }]),
    },
    {
      id: 8, trackingId: "CYD-100008", customerId: 2, origin: DEPOT_NAME, destination: "Mount Lavinia",
      destCoord: place("Mount Lavinia"), weightKg: 6.8, priority: "standard", status: "created",
      specialInstructions: "Birthday cake — keep level.", scheduledFor: day(nowMs + D),
      assignedDriverId: null, assignedAt: null, routeOrder: null, etaMinutes: null,
      createdAt: iso(nowMs - 4 * H), updatedAt: iso(nowMs - 4 * H),
      deliveredAt: null, deliveryMins: null, onTime: null,
      history: history(nowMs, [{ hoursAgo: 4, status: "created", actor: "dispatcher" }]),
    },
    {
      id: 9, trackingId: "CYD-100009", customerId: 4, origin: DEPOT_NAME, destination: "Maharagama",
      destCoord: place("Maharagama"), weightKg: 9.9, priority: "standard", status: "failed",
      specialInstructions: null, scheduledFor: day(nowMs - D),
      assignedDriverId: 2, assignedAt: iso(nowMs - 28 * H), routeOrder: null, etaMinutes: null,
      createdAt: iso(nowMs - 30 * H), updatedAt: iso(nowMs - 22 * H),
      deliveredAt: null, deliveryMins: null, onTime: false,
      history: history(nowMs, [
        { hoursAgo: 30, status: "created", actor: "dispatcher" },
        { hoursAgo: 28, status: "assigned", note: "Assigned to Nuwan Silva", actor: "dispatcher" },
        { hoursAgo: 25, status: "in_transit", actor: "Nuwan Silva" },
        { hoursAgo: 22, status: "failed", note: "Address not found — customer unreachable", actor: "Nuwan Silva" },
      ]),
    },
    {
      id: 10, trackingId: "CYD-100010", customerId: 5, origin: DEPOT_NAME, destination: "Wellawatte",
      destCoord: place("Wellawatte"), weightKg: 2.4, priority: "express", status: "created",
      specialInstructions: null, scheduledFor: day(nowMs),
      assignedDriverId: null, assignedAt: null, routeOrder: null, etaMinutes: null,
      createdAt: iso(nowMs - 1 * H), updatedAt: iso(nowMs - 1 * H),
      deliveredAt: null, deliveryMins: null, onTime: null,
      history: history(nowMs, [{ hoursAgo: 1, status: "created", actor: "dispatcher" }]),
    },
  ];

  // --- Historical deliveries: real shipment records over the past 6 days. ---
  // The Reports tab aggregates these live; nothing below is a pre-baked stat.
  let id = 10;
  let tracking = 100010;
  for (let daysAgo = 6; daysAgo >= 1; daysAgo--) {
    const perDay = 2 + ((daysAgo * 5) % 3); // 2–4 deliveries per day, deterministic
    for (let k = 0; k < perDay; k++) {
      id += 1;
      tracking += 1;
      const p = PLACES[(id * 7 + k * 3) % PLACES.length];
      const driverId = ((id + k) % 3) + 1;
      const customerId = ((id * 3 + k) % 5) + 1;
      const late = id % 5 === 0; // a few deterministic late deliveries
      const deliveredMs = nowMs - daysAgo * D - (2 + k * 2) * H;
      const deliveryMins = 35 + ((id * 13 + k * 17) % 51); // 35–85 min
      const startMs = deliveredMs - deliveryMins * 60_000;
      const driverName = drivers.find((d) => d.id === driverId)!.name;
      shipments.push({
        id, trackingId: `CYD-${tracking}`, customerId, origin: DEPOT_NAME,
        destination: p.name, destCoord: { ...p.coord },
        weightKg: 2 + ((id * 11 + k) % 30), priority: (id + k) % 4 === 0 ? "express" : "standard",
        status: "delivered", specialInstructions: null,
        scheduledFor: day(late ? deliveredMs - D : deliveredMs),
        assignedDriverId: driverId, assignedAt: iso(startMs), routeOrder: null, etaMinutes: null,
        createdAt: iso(startMs - 2 * H), updatedAt: iso(deliveredMs),
        deliveredAt: iso(deliveredMs), deliveryMins, onTime: !late,
        history: [
          { at: iso(startMs - 2 * H), status: "created", note: null, actor: "dispatcher" },
          { at: iso(startMs), status: "assigned", note: `Assigned to ${driverName}`, actor: "dispatcher" },
          { at: iso(deliveredMs), status: "delivered", note: null, actor: driverName },
        ],
      });
    }
  }

  const issues: Issue[] = [
    {
      id: 1, shipmentId: 3, driverId: 1, type: "delay",
      note: "Heavy traffic near Town Hall, ~30 min behind schedule.",
      createdAt: iso(nowMs - 0.5 * H), resolvedAt: null,
    },
    {
      id: 2, shipmentId: 9, driverId: 2, type: "wrong_address",
      note: "No such lane number in Maharagama. Needs customer confirmation.",
      createdAt: iso(nowMs - 22 * H), resolvedAt: null,
    },
  ];

  const notifications: AppNotification[] = [
    {
      id: 1, kind: "issue", title: "Issue reported on CYD-100003",
      body: "Kasun Perera: heavy traffic near Town Hall, ~30 min behind schedule.",
      audience: "ops", customerId: null, channels: ["in_app"],
      createdAt: iso(nowMs - 0.5 * H), readAt: null,
    },
    {
      id: 2, kind: "delivered", title: "CYD-100002 delivered",
      body: "Delivered to Kollupitiya — left at the bakery counter.",
      audience: "customer", customerId: 2, channels: ["in_app", "email"],
      createdAt: iso(nowMs - 1.5 * H), readAt: null,
    },
    {
      id: 3, kind: "delivered", title: "CYD-100001 delivered",
      body: "Delivered to Pettah — signed by R. Jayasuriya.",
      audience: "customer", customerId: 1, channels: ["in_app", "email", "sms"],
      createdAt: iso(nowMs - 2 * H), readAt: iso(nowMs - 1 * H),
    },
    {
      id: 4, kind: "failed", title: "Delivery failed for CYD-100009",
      body: "Address not found — customer unreachable. Reschedule required.",
      audience: "ops", customerId: null, channels: ["in_app"],
      createdAt: iso(nowMs - 22 * H), readAt: null,
    },
    {
      id: 5, kind: "status", title: "CYD-100004 out for delivery",
      body: "Nuwan Silva is on the way to Nugegoda. ETA 15 min.",
      audience: "customer", customerId: 4, channels: ["in_app", "email", "sms"],
      createdAt: iso(nowMs - 0.3 * H), readAt: null,
    },
  ];

  const emailLog: EmailLogEntry[] = [
    {
      id: 1, notificationId: 3, customerId: 1, to: "orders@cargillsfc.lk",
      subject: "CYD-100001 delivered", status: "simulated",
      detail: "No Resend API key configured", createdAt: iso(nowMs - 2 * H),
    },
    {
      id: 2, notificationId: 2, customerId: 2, to: "dispatch@pererasons.lk",
      subject: "CYD-100002 delivered", status: "simulated",
      detail: "No Resend API key configured", createdAt: iso(nowMs - 1.5 * H),
    },
    {
      id: 3, notificationId: 5, customerId: 4, to: "orders@osusala.lk",
      subject: "CYD-100004 out for delivery", status: "simulated",
      detail: "No Resend API key configured", createdAt: iso(nowMs - 0.3 * H),
    },
  ];

  return {
    shipments,
    drivers,
    customers,
    issues,
    notifications,
    emailLog,
    counters: { shipment: id, notification: 5, issue: 2, tracking, email: 3 },
  };
}

export { iso as toIso, day as toDay, H };
