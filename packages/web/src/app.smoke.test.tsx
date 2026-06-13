/**
 * SSR smoke tests: render every section of the unified UI to static HTML and
 * assert key content appears. Catches runtime errors in components without
 * needing a browser. (The Leaflet map loads lazily, so it is SSR-safe.)
 */
import { describe, it, expect, vi } from "vitest";

// Tests must behave the same whether or not a real Resend key is configured.
vi.mock("./lib/email/config.js", () => ({ RESEND_API_KEY: "", EMAIL_FROM: "" }));
import React from "react";
import { renderToString } from "react-dom/server";
import { StoreProvider } from "./lib/mock/react.js";
import App from "./App.js";
import { Shipments } from "./sections/Shipments.js";
import { Drivers } from "./sections/Drivers.js";
import { Customers } from "./sections/Customers.js";
import { Reports } from "./sections/Reports.js";

function render(C: React.ComponentType): string {
  return renderToString(React.createElement(StoreProvider, null, React.createElement(C)));
}

describe("UI smoke (SSR)", () => {
  it("App shell + Overview", () => {
    const html = render(App);
    for (const s of ["CeylonDispatch", "Colombo", "CYD-100003", "Needs attention", "Recent activity"]) {
      expect(html).toContain(s);
    }
  });

  it("Shipments", () => {
    const html = render(Shipments);
    for (const s of ["CYD-100007", "Cargills", "Dehiwala", "Last updated", "Assigned"]) {
      expect(html).toContain(s);
    }
  });

  it("Drivers & Routes", () => {
    const html = render(Drivers);
    for (const s of ["Kasun Perera", "Nuwan Silva", "Tharindu Fernando", "Optimise route", "Report issue"]) {
      expect(html).toContain(s);
    }
  });

  it("Customers", () => {
    const html = render(Customers);
    for (const s of ["Osu Sala", "Email delivery log", "Simulation mode", "simulated", "Automatic updates"]) {
      expect(html).toContain(s);
    }
  });

  it("Reports", () => {
    const html = render(Reports);
    for (const s of ["Deliveries per day", "Fuel usage", "Derived live", "Bottlenecks", "Driver performance"]) {
      expect(html).toContain(s);
    }
  });
});
