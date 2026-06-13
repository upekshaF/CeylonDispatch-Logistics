import { useAppState, useStore } from "../lib/mock/react.js";
import { computeKpis, findBottlenecks } from "../lib/mock/store.js";
import { LiveMap } from "../components/LiveMap.js";
import { StatusBadge } from "../components/StatusBadge.js";

export function Overview({ goTo }: { goTo: (tab: string) => void }) {
  const state = useAppState();
  const store = useStore();
  const kpis = computeKpis(state, store.now());
  const bottlenecks = findBottlenecks(state, store.now());

  const recent = state.shipments
    .flatMap((s) =>
      s.history.map((h) => ({ ...h, trackingId: s.trackingId, destination: s.destination })),
    )
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  return (
    <>
      <div className="kpi-row">
        <Kpi label="Active shipments" value={kpis.active} onClick={() => goTo("shipments")} />
        <Kpi label="In transit" value={kpis.inTransit} onClick={() => goTo("drivers")} />
        <Kpi label="Delivered today" value={kpis.deliveredToday} tone="good" />
        <Kpi label="Awaiting driver" value={kpis.unassigned} tone={kpis.unassigned > 0 ? "warn" : undefined} onClick={() => goTo("shipments")} />
        <Kpi label="Open issues" value={kpis.openIssues} tone={kpis.openIssues > 0 ? "bad" : "good"} />
        <Kpi label="On-time (7d)" value={`${kpis.onTimePct7d}%`} tone="good" onClick={() => goTo("reports")} />
      </div>

      <div className="grid-main">
        <div className="card">
          <div className="row between">
            <h2>Live fleet map — Colombo</h2>
            <span className="muted">OpenStreetMap · simulated positions, updates every few seconds</span>
          </div>
          <LiveMap />
        </div>

        <div className="card">
          <h2>Needs attention</h2>
          {bottlenecks.length === 0 && <div className="muted">All clear. 🎉</div>}
          <ul className="attn-list">
            {bottlenecks.map((b, i) => (
              <li key={i} className={"attn " + b.severity}>
                <strong>{b.label}</strong>
                <div className="muted">{b.detail}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card">
        <h2>Recent activity</h2>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Shipment</th>
              <th>Status</th>
              <th>Note</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((e, i) => (
              <tr key={i}>
                <td className="muted">{new Date(e.at).toLocaleString()}</td>
                <td>
                  <code>{e.trackingId}</code> <span className="muted">→ {e.destination}</span>
                </td>
                <td>
                  <StatusBadge status={e.status} />
                </td>
                <td>{e.note ?? "—"}</td>
                <td className="muted">{e.actor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Kpi({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: number | string;
  tone?: "good" | "bad" | "warn";
  onClick?: () => void;
}) {
  return (
    <button className={"kpi" + (tone ? " " + tone : "") + (onClick ? " clickable" : "")} onClick={onClick}>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </button>
  );
}
