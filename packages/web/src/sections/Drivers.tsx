import { useState } from "react";
import { useAppState, useStore } from "../lib/mock/react.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { LiveMap } from "../components/LiveMap.js";
import type { Driver, IssueType, Shipment } from "../lib/mock/types.js";

const DRIVER_STATUS: Record<string, string> = {
  idle: "Idle",
  en_route: "En route",
  on_break: "On break",
};

export function Drivers() {
  const state = useAppState();
  const store = useStore();
  const [toast, setToast] = useState<string | null>(null);

  function optimize(d: Driver) {
    try {
      const r = store.optimizeRoute(d.id);
      setToast(
        `Route optimised for ${d.name}: ${r.order.join(" → ")}` +
          (r.savedKm > 0 ? ` (est. ${r.savedKm} km saved)` : ""),
      );
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Could not optimise");
    }
    setTimeout(() => setToast(null), 5000);
  }

  return (
    <>
      {toast && <div className="toast">{toast}</div>}
      <div className="card">
        <div className="row between">
          <h2>Live fleet map — Colombo</h2>
          <span className="muted">OpenStreetMap · simulated positions</span>
        </div>
        <LiveMap />
      </div>

      <div className="driver-grid">
        {state.drivers.map((d) => {
          const stops = state.shipments
            .filter(
              (s) =>
                s.assignedDriverId === d.id &&
                (s.status === "assigned" || s.status === "in_transit"),
            )
            .sort((a, b) => (a.routeOrder ?? 99) - (b.routeOrder ?? 99));
          const doneToday = state.shipments.filter(
            (s) =>
              s.assignedDriverId === d.id &&
              s.deliveredAt?.slice(0, 10) === new Date(store.now()).toISOString().slice(0, 10),
          ).length;
          return (
            <div className="card" key={d.id}>
              <div className="row between">
                <h2>
                  {d.name} <span className="muted">· {d.vehicle} ({d.plate})</span>
                </h2>
                <span className={"chip driver-" + d.status}>{DRIVER_STATUS[d.status]}</span>
              </div>
              <div className="muted" style={{ marginBottom: 8 }}>
                {stops.length} stop{stops.length === 1 ? "" : "s"} remaining · {doneToday} delivered
                today · {d.fuelUsedTodayL.toFixed(1)} L fuel today
              </div>
              <button
                className="ghost"
                disabled={stops.length === 0}
                onClick={() => optimize(d)}
              >
                ⚡ Optimise route
              </button>
              <ol className="stop-list">
                {stops.length === 0 && <div className="muted">No active stops.</div>}
                {stops.map((s) => (
                  <StopItem key={s.id} s={s} />
                ))}
              </ol>
            </div>
          );
        })}
      </div>
    </>
  );
}

function StopItem({ s }: { s: Shipment }) {
  const store = useStore();
  const state = useAppState();
  const [reporting, setReporting] = useState(false);
  const [issueType, setIssueType] = useState<IssueType>("delay");
  const [note, setNote] = useState("");
  const customer = state.customers.find((c) => c.id === s.customerId);

  return (
    <li className="stop">
      <div className="row between">
        <div>
          <code>{s.trackingId}</code> → <strong>{s.destination}</strong>
          <span className="muted"> · {customer?.name}</span>
        </div>
        <StatusBadge status={s.status} />
      </div>
      {s.specialInstructions && <div className="instructions">📋 {s.specialInstructions}</div>}
      {s.status === "in_transit" && s.etaMinutes != null && (
        <div className="muted">ETA {s.etaMinutes} min</div>
      )}
      <div className="row mt" style={{ gap: 8 }}>
        {s.status === "assigned" && (
          <button className="primary sm" onClick={() => store.startDelivery(s.id)}>
            ▶ Start
          </button>
        )}
        {s.status === "in_transit" && (
          <button className="primary sm" onClick={() => store.markDelivered(s.id)}>
            ✓ Delivered
          </button>
        )}
        <button className="ghost sm" onClick={() => setReporting((v) => !v)}>
          ⚠ Report issue
        </button>
      </div>
      {reporting && (
        <div className="issue-form">
          <select value={issueType} onChange={(e) => setIssueType(e.target.value as IssueType)}>
            <option value="delay">Delay</option>
            <option value="damaged">Damaged parcel</option>
            <option value="wrong_address">Wrong address</option>
            <option value="vehicle">Vehicle problem</option>
            <option value="other">Other</option>
          </select>
          <input
            placeholder="What happened?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            className="danger sm"
            disabled={!note.trim()}
            onClick={() => {
              store.reportIssue(s.id, issueType, note.trim());
              setNote("");
              setReporting(false);
            }}
          >
            Submit
          </button>
        </div>
      )}
    </li>
  );
}
