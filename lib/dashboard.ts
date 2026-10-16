export type Location = {
  latitude: number; longitude: number; reportedAt: string; receivedAt: string;
  source: "ESP32" | "IPHONE_SHORTCUT" | "WATCH_PHONE_ASSISTED";
  accuracyMeters: number | null; batteryPercent: number | null; speedMps: number | null;
};
export type Tracker = {
  id: string; name: string; type: "ESP32" | "IPHONE" | "APPLE_WATCH";
  reportingMode: "INTERVAL" | "ON_DEMAND"; expectedIntervalSeconds: number | null;
  latestLocation: Location | null;
};
export type HistoryPoint = Location & { id: string };

export function freshness(tracker: Tracker, now: number) {
  if (!tracker.latestLocation) return "Never reported";
  if (tracker.type === "APPLE_WATCH") return "Phone-assisted";
  if (tracker.reportingMode === "ON_DEMAND") return "On demand";
  const age = Math.max(0, (now - Date.parse(tracker.latestLocation.reportedAt)) / 1000);
  const interval = tracker.expectedIntervalSeconds ?? 30;
  if (age <= Math.max(3 * interval, 60)) return "Recent";
  return age > Math.max(10 * interval, 900) ? "Offline" : "Stale";
}

export function sourceLabel(source: Location["source"]) {
  return source === "WATCH_PHONE_ASSISTED" ? "Phone-assisted Shortcut" : source === "IPHONE_SHORTCUT" ? "iPhone Shortcut" : "ESP32 GPS";
}

export function accuracyRing(point: Location): [number, number][] {
  const latitude = point.latitude * Math.PI / 180;
  const distance = (point.accuracyMeters ?? 0) / 6371008.8;
  return Array.from({ length: 65 }, (_, i) => {
    const bearing = i / 64 * 2 * Math.PI;
    const lat = Math.asin(Math.sin(latitude) * Math.cos(distance) + Math.cos(latitude) * Math.sin(distance) * Math.cos(bearing));
    const lon = point.longitude * Math.PI / 180 + Math.atan2(Math.sin(bearing) * Math.sin(distance) * Math.cos(latitude), Math.cos(distance) - Math.sin(latitude) * Math.sin(lat));
    return [lon * 180 / Math.PI, lat * 180 / Math.PI];
  });
}
