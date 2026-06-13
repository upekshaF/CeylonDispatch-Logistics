/**
 * Shared types and constants for all services and the web app.
 * Kept dependency-free so any package can import without extra installs.
 */

export type Role = "dispatcher" | "driver" | "customer";

export type ShipmentStatus =
  | "created"
  | "assigned"
  | "in_transit"
  | "delivered"
  | "failed";

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  created_at: string;
}

export interface AuthTokenPayload {
  sub: number;
  email: string;
  role: Role;
  name: string;
}

export interface Shipment {
  id: number;
  tracking_id: string;
  customer_id: number;
  origin: string;
  destination: string;
  weight_kg: number;
  status: ShipmentStatus;
  special_instructions: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShipmentHistory {
  id: number;
  shipment_id: number;
  status: ShipmentStatus;
  note: string | null;
  actor_id: number | null;
  created_at: string;
}

export interface Assignment {
  id: number;
  shipment_id: number;
  driver_id: number;
  sequence: number;
  status: ShipmentStatus;
  created_at: string;
  completed_at: string | null;
}

export interface Notification {
  id: number;
  user_id: number;
  kind: string;
  title: string;
  body: string;
  payload: string;
  read_at: string | null;
  created_at: string;
}

export const PORTS = {
  gateway: 4000,
  auth: 4001,
  shipments: 4002,
  routes: 4003,
  notifications: 4004,
  web: 5173,
} as const;

export const USER_CONTEXT_HEADER = "x-user-context";
