"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as LibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Button } from "@/components/ui/button";
import { accuracyRing, type HistoryPoint, type Tracker } from "@/lib/dashboard";

// MapLibre's relative worker URL does not survive Next.js bundling.
maplibregl.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);

function fit(map: LibreMap, items: Tracker[]) {
  const bounds = new maplibregl.LngLatBounds();
  for (const { latestLocation: point } of items) if (point) bounds.extend([point.longitude, point.latitude]);
  if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 70, maxZoom: 15, duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 600 });
}

export default function TrackerMap({ items, selectedId, onSelect, trail }: { items: Tracker[]; selectedId: string | null; onSelect: (id: string) => void; trail: HistoryPoint[] }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LibreMap | null>(null);
  const centeredId = useRef<string | null>(null);
  const fitted = useRef(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!container.current) return;
    let map: LibreMap;
    try {
      map = new maplibregl.Map({ container: container.current, center: [0, 20], zoom: 2,
        style: { version: 8, sources: { tiles: { type: "raster", tiles: [process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256,
          attribution: process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION || '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors' } },
          layers: [{ id: "tiles", type: "raster", source: "tiles" }] },
        attributionControl: { compact: false },
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.on("error", () => setFailed(true));
      map.on("idle", () => { if (map.areTilesLoaded()) setFailed(false); });
      map.on("load", () => {
        map.addSource("trail", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "trail", type: "line", source: "trail", paint: { "line-color": "#1a73e8", "line-width": 3, "line-opacity": 0.7 } });
        map.addSource("accuracy", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "accuracy", type: "fill", source: "accuracy", paint: { "fill-color": "#1a73e8", "fill-opacity": 0.12 } });
        setReady(true);
      });
    } catch { queueMicrotask(() => setFailed(true)); return; }
    const timeout = setTimeout(() => { if (!map.loaded()) setFailed(true); }, 15000);
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container.current);
    return () => { clearTimeout(timeout); observer.disconnect(); map.remove(); mapRef.current = null; };
  }, [attempt]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const markers = items.flatMap((item) => {
      const point = item.latestLocation;
      if (!point) return [];
      const element = document.createElement("button");
      element.type = "button";
      element.className = `tracker-marker${selectedId === item.id ? " tracker-marker-selected" : ""}`;
      element.textContent = item.name.slice(0, 1).toUpperCase();
      element.setAttribute("aria-label", `Select ${item.name}`);
      element.setAttribute("aria-pressed", String(selectedId === item.id));
      element.addEventListener("click", () => onSelect(item.id));
      return [new maplibregl.Marker({ element }).setLngLat([point.longitude, point.latitude]).addTo(map)];
    });
    if (!fitted.current && markers.length) { fit(map, items); fitted.current = true; }
    const point = items.find((item) => item.id === selectedId)?.latestLocation;
    if (point && centeredId.current !== selectedId) {
      map.easeTo({ center: [point.longitude, point.latitude], zoom: 15, duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 600 });
      centeredId.current = selectedId;
    }
    if (!selectedId) centeredId.current = null;
    (map.getSource("accuracy") as GeoJSONSource).setData({ type: "FeatureCollection", features: point?.accuracyMeters ? [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [accuracyRing(point)] } }] : [] });
    return () => { markers.forEach((marker) => marker.remove()); };
  }, [items, selectedId, onSelect, ready]);

  useEffect(() => {
    if (!ready) return;
    (mapRef.current?.getSource("trail") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: trail.length > 1 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [...trail].reverse().map((point) => [point.longitude, point.latitude]) } }] : [] });
  }, [trail, ready]);

  return <>
    <div ref={container} className="h-full w-full" aria-label="Interactive map of reported positions" />
    <Button variant="secondary" disabled={!ready || !items.some((item) => item.latestLocation)} className="absolute top-3 left-3 shadow-sm" onClick={() => { if (mapRef.current) fit(mapRef.current, items); }}>Fit all things</Button>
    {failed && <div role="status" className="absolute top-16 right-3 left-3 rounded-xl border bg-card p-4 text-sm shadow-sm md:left-auto md:max-w-sm">
      <p>Map unavailable or tiles failed. Your coordinates and reports are still available in the asset panel.</p>
      <Button variant="outline" size="sm" className="mt-2" onClick={() => { setReady(false); setFailed(false); fitted.current = false; centeredId.current = null; setAttempt(attempt + 1); }}>Retry map</Button>
    </div>}
    <a className="absolute right-0 bottom-0 bg-card/95 px-2 py-1 text-xs text-foreground underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>
  </>;
}
