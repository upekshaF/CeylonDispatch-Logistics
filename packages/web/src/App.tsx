import { useState } from "react";
import { useAppState } from "./lib/mock/react.js";
import { NotificationBell } from "./components/NotificationBell.js";
import { Overview } from "./sections/Overview.js";
import { Shipments } from "./sections/Shipments.js";
import { Drivers } from "./sections/Drivers.js";
import { Customers } from "./sections/Customers.js";
import { Reports } from "./sections/Reports.js";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "shipments", label: "Shipments" },
  { key: "drivers", label: "Drivers & Routes" },
  { key: "customers", label: "Customers" },
  { key: "reports", label: "Reports" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function App() {
  const [tab, setTab] = useState<TabKey>("overview");
  // token increments on every search so repeated searches (even for the
  // same tracking ID) always re-sync the Shipments tab state
  const [focus, setFocus] = useState<{ trackingId: string; token: number } | null>(null);
  const state = useAppState();
  const [query, setQuery] = useState("");

  function trackSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim().toUpperCase();
    if (!q) return;
    const hit = state.shipments.find((s) => s.trackingId.toUpperCase() === q);
    setFocus((prev) => ({ trackingId: hit ? hit.trackingId : q, token: (prev?.token ?? 0) + 1 }));
    setTab("shipments");
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">CD</span>
          <div>
            <div className="brand-name">CeylonDispatch</div>
            <div className="brand-sub">Control Center · Colombo</div>
          </div>
        </div>
        <form className="track-search" onSubmit={trackSearch}>
          <input
            placeholder="Track a shipment (e.g. CYD-100003)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="primary sm">Track</button>
        </form>
        <NotificationBell />
      </header>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={"tab" + (tab === t.key ? " active" : "")}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="main">
        {tab === "overview" && <Overview goTo={(t) => setTab(t as TabKey)} />}
        {tab === "shipments" && (
          <Shipments focusTrackingId={focus?.trackingId ?? null} focusToken={focus?.token ?? 0} />
        )}
        {tab === "drivers" && <Drivers />}
        {tab === "customers" && <Customers />}
        {tab === "reports" && <Reports />}
      </main>
    </div>
  );
}
