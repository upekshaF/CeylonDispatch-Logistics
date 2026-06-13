import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";
import { useAppState } from "../lib/mock/react.js";
import { DEPOT } from "../lib/mock/store.js";
import type { State } from "../lib/mock/types.js";

const STOP_COLOR: Record<string, string> = {
  assigned: "#2563eb",
  in_transit: "#d97706",
};

/**
 * Real interactive map of Colombo (Leaflet + OpenStreetMap tiles — no API
 * key required). Leaflet is loaded dynamically inside an effect so the
 * component stays SSR/test-safe.
 */
export function LiveMap() {
  const state = useAppState();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layerRef = useRef<Leaflet.LayerGroup | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);

  // create the map once
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      import("leaflet"),
      // @ts-expect-error — CSS import handled by Vite
      import("leaflet/dist/leaflet.css"),
    ]).then(([mod]: [typeof Leaflet, unknown]) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const L = ((mod as { default?: typeof Leaflet }).default ?? mod) as typeof Leaflet;
      leafletRef.current = L;
      const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView(
        [6.9, 79.89],
        12,
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      const layer = L.layerGroup().addTo(map);
      layerRef.current = layer;
      mapRef.current = map;
      draw(L, layer, stateRef.current);
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep latest state for the initial draw
  const stateRef = useRef(state);
  stateRef.current = state;

  // redraw markers whenever state changes
  useEffect(() => {
    const L = leafletRef.current;
    if (L && layerRef.current) draw(L, layerRef.current, state);
  }, [state]);

  return <div ref={containerRef} className="live-map" aria-label="Live fleet map" />;
}

function draw(L: typeof Leaflet, layer: Leaflet.LayerGroup, state: State) {
  layer.clearLayers();

  // depot
  L.marker([DEPOT.lat, DEPOT.lng], {
    icon: L.divIcon({ className: "", html: '<div class="pin depot">🏭</div>', iconSize: [28, 28], iconAnchor: [14, 14] }),
  })
    .bindTooltip("Depot — Peliyagoda")
    .addTo(layer);

  const stops = state.shipments.filter(
    (s) => s.status === "assigned" || s.status === "in_transit",
  );

  // delivery stops
  for (const s of stops) {
    L.circleMarker([s.destCoord.lat, s.destCoord.lng], {
      radius: 7,
      color: STOP_COLOR[s.status] ?? "#64748b",
      weight: 2,
      fillColor: "#ffffff",
      fillOpacity: 1,
    })
      .bindTooltip(`${s.trackingId} · ${s.destination} (${s.status.replace("_", " ")})`)
      .addTo(layer);
  }

  // route line from each driver to their next stop
  for (const d of state.drivers) {
    const next = stops
      .filter((s) => s.assignedDriverId === d.id)
      .sort((a, b) => (a.routeOrder ?? 99) - (b.routeOrder ?? 99))[0];
    if (next) {
      L.polyline(
        [
          [d.location.lat, d.location.lng],
          [next.destCoord.lat, next.destCoord.lng],
        ],
        { color: "#7a1f3d", weight: 2, dashArray: "6 6", opacity: 0.7 },
      ).addTo(layer);
    }
  }

  // drivers
  for (const d of state.drivers) {
    L.marker([d.location.lat, d.location.lng], {
      icon: L.divIcon({
        className: "",
        html: `<div class="pin driver ${d.status}">🚚</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      }),
    })
      .bindTooltip(`${d.name} · ${d.vehicle} (${d.plate}) — ${d.status.replace("_", " ")}`)
      .addTo(layer);
  }
}
