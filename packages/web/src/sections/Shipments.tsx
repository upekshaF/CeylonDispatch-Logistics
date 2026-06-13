import { useEffect, useMemo, useState } from "react";
import { useAppState, useStore } from "../lib/mock/react.js";
import { StatusBadge } from "../components/StatusBadge.js";
import type { Shipment, ShipmentStatus } from "../lib/mock/types.js";

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All" },
  { key: "created", label: "Created" },
  { key: "assigned", label: "Assigned" },
  { key: "in_transit", label: "In transit" },
  { key: "delivered", label: "Delivered" },
  { key: "failed", label: "Failed" },
];

export function Shipments({
  focusTrackingId,
  focusToken = 0,
}: {
  focusTrackingId?: string | null;
  focusToken?: number;
}) {
  const state = useAppState();
  const store = useStore();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Sync from the top-bar tracking search. Keyed on focusToken so repeated
  // searches (even for the same ID) always reset filter/search/expanded —
  // this was the "state not setting properly when searched" bug.
  useEffect(() => {
    if (!focusTrackingId) return;
    setFilter("all");
    setSearch(focusTrackingId);
    setExpanded(
      state.shipments.find(
        (s) => s.trackingId.toUpperCase() === focusTrackingId.toUpperCase(),
      )?.id ?? null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTrackingId, focusToken]);

  const customerName = (id: number) =>
    state.customers.find((c) => c.id === id)?.name ?? `#${id}`;
  const driverName = (id: number | null) =>
    id == null ? null : state.drivers.find((d) => d.id === id)?.name ?? `#${id}`;

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.shipments
      .filter((s) => filter === "all" || s.status === filter)
      .filter(
        (s) =>
          !q ||
          s.trackingId.toLowerCase().includes(q) ||
          s.destination.toLowerCase().includes(q) ||
          customerName(s.customerId).toLowerCase().includes(q),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [state, filter, search]);

  return (
    <>
      <div className="card">
        <div className="row between">
          <h2>Shipments</h2>
          <button className="primary" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Close" : "+ New shipment"}
          </button>
        </div>
        {showCreate && <CreateForm onDone={() => setShowCreate(false)} />}
        <div className="row wrap" style={{ margin: "12px 0" }}>
          <div className="filters">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                className={"chip-btn" + (filter === f.key ? " active" : "")}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <input
            className="search"
            placeholder="Search tracking ID, customer, destination…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <table>
          <thead>
            <tr>
              <th>Tracking ID</th>
              <th>Customer</th>
              <th>Route</th>
              <th>Status</th>
              <th>Driver</th>
              <th>Assigned</th>
              <th>Scheduled</th>
              <th>Last updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <Row
                key={s.id}
                s={s}
                customerName={customerName(s.customerId)}
                driverName={driverName(s.assignedDriverId)}
                expanded={expanded === s.id}
                onToggle={() => setExpanded(expanded === s.id ? null : s.id)}
              />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">
                  No shipments match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
}

function Row({
  s,
  customerName,
  driverName,
  expanded,
  onToggle,
}: {
  s: Shipment;
  customerName: string;
  driverName: string | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const state = useAppState();
  const store = useStore();
  const [driverId, setDriverId] = useState<number | "">("");

  return (
    <>
      <tr className="clickable-row" onClick={onToggle}>
        <td>
          <code>{s.trackingId}</code>
          {s.priority === "express" && <span className="chip express">express</span>}
        </td>
        <td>{customerName}</td>
        <td>
          {s.origin.replace("Depot — ", "")} → {s.destination}
        </td>
        <td>
          <StatusBadge status={s.status} />
          {s.status === "in_transit" && s.etaMinutes != null && (
            <span className="muted"> ETA {s.etaMinutes}m</span>
          )}
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          {s.status === "created" ? (
            <span className="row" style={{ gap: 6 }}>
              <select value={driverId} onChange={(e) => setDriverId(Number(e.target.value))}>
                <option value="">— driver —</option>
                {state.drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <button
                className="ghost"
                disabled={!driverId}
                onClick={() => driverId && store.assignDriver(s.id, Number(driverId))}
              >
                Assign
              </button>
            </span>
          ) : (
            driverName ?? "—"
          )}
        </td>
        <td className="muted">{fmt(s.assignedAt)}</td>
        <td className="muted">{s.scheduledFor}</td>
        <td className="muted">{fmt(s.updatedAt)}</td>
      </tr>
      {expanded && (
        <tr className="detail-row">
          <td colSpan={8}>
            <Detail s={s} />
          </td>
        </tr>
      )}
    </>
  );
}

function Detail({ s }: { s: Shipment }) {
  const store = useStore();
  const state = useAppState();
  const [newDate, setNewDate] = useState(s.scheduledFor);
  const [instructions, setInstructions] = useState(s.specialInstructions ?? "");
  const [failReason, setFailReason] = useState("");
  const issues = state.issues.filter((i) => i.shipmentId === s.id);
  const open = s.status !== "delivered" && s.status !== "failed";

  return (
    <div className="detail">
      <div className="detail-cols">
        <div>
          <h3>Timeline</h3>
          <ul className="timeline">
            {[...s.history].reverse().map((h, i) => (
              <li key={i}>
                <StatusBadge status={h.status} />
                <span className="muted"> {new Date(h.at).toLocaleString()}</span>
                {h.note && <div>{h.note}</div>}
                <div className="muted">by {h.actor}</div>
              </li>
            ))}
          </ul>
          {issues.length > 0 && (
            <>
              <h3>Issues</h3>
              {issues.map((i) => (
                <div key={i.id} className={"attn " + (i.resolvedAt ? "resolved" : "high")}>
                  <strong>{i.type.replace("_", " ")}</strong> — {i.note}{" "}
                  {i.resolvedAt ? (
                    <span className="muted">(resolved)</span>
                  ) : (
                    <button className="link-btn" onClick={() => store.resolveIssue(i.id)}>
                      Resolve
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
        <div>
          <h3>Details &amp; actions</h3>
          <div className="muted">
            {s.weightKg} kg · {s.priority} · created {new Date(s.createdAt).toLocaleString()}
          </div>

          {open && (
            <>
              <label>Special instructions</label>
              <div className="row">
                <input
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g. Leave with neighbour at no. 14"
                />
                <button className="ghost" onClick={() => store.updateInstructions(s.id, instructions)}>
                  Save
                </button>
              </div>
            </>
          )}

          {s.status !== "delivered" && (
            <>
              <label>Reschedule delivery</label>
              <div className="row">
                <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                <button className="ghost" onClick={() => store.reschedule(s.id, newDate)}>
                  Reschedule
                </button>
              </div>
            </>
          )}

          {s.status === "assigned" && (
            <button className="primary mt" onClick={() => store.startDelivery(s.id)}>
              Start delivery
            </button>
          )}
          {s.status === "in_transit" && (
            <div className="row mt">
              <button className="primary" onClick={() => store.markDelivered(s.id)}>
                Mark delivered
              </button>
              <input
                placeholder="Failure reason…"
                value={failReason}
                onChange={(e) => setFailReason(e.target.value)}
              />
              <button
                className="danger"
                disabled={!failReason.trim()}
                onClick={() => store.markFailed(s.id, failReason.trim())}
              >
                Mark failed
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const state = useAppState();
  const store = useStore();
  const [customerId, setCustomerId] = useState<number | "">("");
  const [destination, setDestination] = useState("");
  const [weight, setWeight] = useState<number | "">("");
  const [priority, setPriority] = useState<"standard" | "express">("standard");
  const [scheduledFor, setScheduledFor] = useState(
    new Date(store.now()).toISOString().slice(0, 10),
  );
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId || !destination || !weight) return;
    try {
      store.createShipment({
        customerId: Number(customerId),
        destination,
        weightKg: Number(weight),
        priority,
        scheduledFor,
        specialInstructions: instructions || null,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create shipment");
    }
  }

  return (
    <form onSubmit={submit} className="create-form">
      <div className="grid-3">
        <div>
          <label>Customer</label>
          <select value={customerId} onChange={(e) => setCustomerId(Number(e.target.value))} required>
            <option value="">— select —</option>
            {state.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Destination</label>
          <input value={destination} onChange={(e) => setDestination(e.target.value)} required />
        </div>
        <div>
          <label>Weight (kg)</label>
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={weight}
            onChange={(e) => setWeight(e.target.value === "" ? "" : Number(e.target.value))}
            required
          />
        </div>
        <div>
          <label>Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value as "standard" | "express")}>
            <option value="standard">Standard</option>
            <option value="express">Express</option>
          </select>
        </div>
        <div>
          <label>Scheduled for</label>
          <input type="date" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
        </div>
        <div>
          <label>Special instructions</label>
          <input value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        </div>
      </div>
      <button className="primary mt">Create shipment</button>
      {error && <div className="error">{error}</div>}
    </form>
  );
}
