/**
 * Domain types for the unified demo UI.
 * Everything runs on in-memory mock data — no backend required.
 */

export type ShipmentStatus =
  | "created"
  | "assigned"
  | "in_transit"
  | "delivered"
  | "failed";

export type DriverStatus = "idle" | "en_route" | "on_break";

export type Priority = "standard" | "express";

export type Channel = "in_app" | "email" | "sms";

export type IssueType = "delay" | "damaged" | "wrong_address" | "vehicle" | "other";

/** Real-world coordinate (WGS84). The demo operates around Colombo, Sri Lanka. */
export interface Point {
  lat: number;
  lng: number;
}

export interface Customer {
  id: number;
  name: string;
  email: string;
  phone: string;
  address: string;
  prefs: { email: boolean; sms: boolean };
}

export interface Driver {
  id: number;
  name: string;
  vehicle: string;
  plate: string;
  status: DriverStatus;
  location: Point;
  shiftEnds: string; // ISO
  fuelUsedTodayL: number;
}

export interface HistoryEvent {
  at: string; // ISO
  status: ShipmentStatus;
  note: string | null;
  actor: string;
}

export interface Shipment {
  id: number;
  trackingId: string;
  customerId: number;
  origin: string;
  destination: string;
  destCoord: Point;
  weightKg: number;
  priority: Priority;
  status: ShipmentStatus;
  specialInstructions: string | null;
  scheduledFor: string; // ISO date (yyyy-mm-dd)
  assignedDriverId: number | null;
  assignedAt: string | null;
  routeOrder: number | null;
  etaMinutes: number | null;
  createdAt: string;
  updatedAt: string;
  deliveredAt: string | null;
  deliveryMins: number | null;
  onTime: boolean | null;
  history: HistoryEvent[];
}

export interface Issue {
  id: number;
  shipmentId: number;
  driverId: number | null;
  type: IssueType;
  note: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AppNotification {
  id: number;
  kind: string;
  title: string;
  body: string;
  audience: "ops" | "customer";
  customerId: number | null;
  channels: Channel[];
  createdAt: string;
  readAt: string | null;
}

export type EmailStatus = "queued" | "sent" | "simulated" | "error";

/** One outbound email (Resend). "simulated" means no API key is configured yet. */
export interface EmailLogEntry {
  id: number;
  notificationId: number | null;
  customerId: number | null;
  to: string;
  subject: string;
  status: EmailStatus;
  detail: string | null;
  createdAt: string;
}

/** One day of performance, derived live from shipment records (Reports tab). */
export interface DailyStat {
  date: string; // yyyy-mm-dd
  deliveries: number;
  avgDeliveryMins: number;
  onTimePct: number; // 0..100
  delayed: number; // late + failed that day
  fuelL: number;
}

export interface State {
  shipments: Shipment[];
  drivers: Driver[];
  customers: Customer[];
  issues: Issue[];
  notifications: AppNotification[];
  emailLog: EmailLogEntry[];
  counters: {
    shipment: number;
    notification: number;
    issue: number;
    tracking: number;
    email: number;
  };
}
