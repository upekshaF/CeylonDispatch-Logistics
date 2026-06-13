import { useMemo } from "react";
import { useAppState, useStore } from "../lib/mock/react.js";
import {
  buildReportCsv,
  computeDailyStats,
  driverPerformance,
  findBottlenecks,
} from "../lib/mock/store.js";
import { BarChart, LineChart } from "../components/Charts.js";

function dayLabel(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" });
}

export function Reports() {
  const state = useAppState();
  const store = useStore();
  // All report data is derived live from the current shipment records,
  // memoised so the aggregation runs once per state change.
  const { trend, today, perf, bottlenecks } = useMemo(() => {
    const nowMs = store.now();
    const trend = computeDailyStats(state, nowMs, 7);
    return {
      trend,
      today: trend[trend.length - 1],
      perf: driverPerformance(state, nowMs),
      bottlenecks: findBottlenecks(state, nowMs),
    };
  }, [state, store]);

  function exportCsv() {
    const csv = buildReportCsv(state, store.now());
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logistics-report-${today.date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="card">
        <div className="row between">
          <h2>Fleet performance — last 7 days</h2>
          <button className="ghost" onClick={exportCsv}>
            ⬇ Export CSV
          </button>
        </div>
        <div className="muted">
          Derived live from current shipment records — no pre-baked stats. Today so far:{" "}
          {today.deliveries} delivered · avg {today.avgDeliveryMins} min · {today.onTimePct}% on
          time · {today.fuelL} L fuel
        </div>
      </div>

      <div className="report-grid">
        <div className="card">
          <h2>Deliveries per day</h2>
          <BarChart data={trend.map((d) => ({ label: dayLabel(d.date), value: d.deliveries }))} />
        </div>
        <div className="card">
          <h2>Avg delivery time (min)</h2>
          <LineChart
            data={trend.map((d) => ({ label: dayLabel(d.date), value: d.avgDeliveryMins }))}
            color="#d97706"
            unit=" min"
          />
        </div>
        <div className="card">
          <h2>On-time rate (%)</h2>
          <LineChart
            data={trend.map((d) => ({ label: dayLabel(d.date), value: d.onTimePct }))}
            color="#16a34a"
            unit="%"
          />
        </div>
        <div className="card">
          <h2>Fuel usage (L)</h2>
          <BarChart
            data={trend.map((d) => ({ label: dayLabel(d.date), value: d.fuelL }))}
            color="#7c3aed"
            unit=" L"
          />
        </div>
      </div>

      <div className="card">
        <h2>Driver performance today</h2>
        <table>
          <thead>
            <tr>
              <th>Driver</th>
              <th>Vehicle</th>
              <th>Active stops</th>
              <th>Delivered today</th>
              <th>Failed</th>
              <th>Avg time</th>
              <th>Fuel</th>
            </tr>
          </thead>
          <tbody>
            {perf.map((p) => (
              <tr key={p.driverId}>
                <td>{p.name}</td>
                <td className="muted">{p.vehicle}</td>
                <td>{p.activeStops}</td>
                <td>{p.deliveredToday}</td>
                <td>{p.failed > 0 ? <span className="error-text">{p.failed}</span> : 0}</td>
                <td>{p.avgDeliveryMins > 0 ? `${p.avgDeliveryMins} min` : "—"}</td>
                <td>{p.fuelL.toFixed(1)} L</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Bottlenecks &amp; delays</h2>
        {bottlenecks.length === 0 && <div className="muted">No bottlenecks detected.</div>}
        <ul className="attn-list">
          {bottlenecks.map((b, i) => (
            <li key={i} className={"attn " + b.severity}>
              <strong>{b.label}</strong>
              <div className="muted">{b.detail}</div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
