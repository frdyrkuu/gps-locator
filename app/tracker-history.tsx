"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { sourceLabel, type HistoryPoint } from "@/lib/dashboard";

export function TrackerHistory({ trackerId, onTrail }: { trackerId: string; onTrail: (trail: { trackerId: string; points: HistoryPoint[] }) => void }) {
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function load(more = false) {
    setBusy(true); setError(false); setOpened(true);
    try {
      const query = new URLSearchParams({ limit: "50" });
      if (more && cursor) query.set("cursor", cursor);
      const response = await fetch(`/api/v1/trackers/${encodeURIComponent(trackerId)}/locations?${query}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error();
      const page: { items: HistoryPoint[]; nextCursor: string | null } = await response.json();
      const next = more ? [...points, ...page.items.filter((point) => !points.some((existing) => existing.id === point.id))] : page.items;
      setPoints(next); setCursor(page.nextCursor); onTrail({ trackerId, points: next });
    } catch { setError(true); }
    finally { setBusy(false); }
  }
  return <div className="space-y-3">
    <Button variant="outline" disabled={busy} onClick={() => void load()}>{busy ? "Loading history…" : opened ? "Refresh seven-day history" : "View seven-day history"}</Button>
    {error && <p role="alert" className="text-sm text-destructive">Could not load history. <Button variant="link" disabled={busy} onClick={() => void load(points.length > 0)}>Retry</Button></p>}
    {opened && !busy && !error && points.length === 0 && <p className="text-sm text-muted-foreground">No reports in the last seven days. Older last-known positions remain available.</p>}
    {points.length > 0 && <><p className="text-xs text-muted-foreground">{points.length} loaded reports, newest first. Trail connects observations; it is not a recorded route.</p>
      <ol className="max-h-64 space-y-3 overflow-y-auto text-xs" aria-label="Location history">{points.map((point) => <li key={point.id} className="border-l-2 border-primary/30 pl-3">
        <time dateTime={point.reportedAt}>{point.reportedAt}</time><p className="font-mono">{point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}</p><p className="text-muted-foreground">{sourceLabel(point.source)}</p>
      </li>)}</ol>
      {cursor && <Button variant="outline" disabled={busy} onClick={() => void load(true)}>Load older reports</Button>}</>}
  </div>;
}
