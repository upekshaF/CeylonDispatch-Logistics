import type { ShipmentStatus } from "../lib/mock/types.js";

const LABELS: Record<ShipmentStatus, string> = {
  created: "Created",
  assigned: "Assigned",
  in_transit: "In transit",
  delivered: "Delivered",
  failed: "Failed",
};

export function StatusBadge({ status }: { status: ShipmentStatus }) {
  return <span className={"badge " + status}>{LABELS[status]}</span>;
}
