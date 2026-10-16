"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Crosshair, MapPin, PanelLeftClose, PanelLeftOpen, Search, Smartphone, Watch, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { freshness, sourceLabel, type Tracker } from "@/lib/dashboard";
import { TrackerManager } from "./tracker-manager";
import { TrackerHistory } from "./tracker-history";
import type { HistoryPoint } from "@/lib/dashboard";

const TrackerMap = dynamic(() => import("./tracker-map"), { ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-muted p-6 text-muted-foreground" role="status">Loading map…</div> });

export function Dashboard({ initialItems, initialTime, account }: { initialItems: Tracker[]; initialTime: number; account: ReactNode }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [now, setNow] = useState(initialTime);
  const [lastRefresh, setLastRefresh] = useState(initialTime);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [trail, setTrail] = useState<{ trackerId: string; points: HistoryPoint[] } | null>(null);
  const inFlight = useRef(false);
  const selected = items.find((item) => item.id === selectedId) ?? null;

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    setNow(Date.now());
    try {
      const response = await fetch("/api/v1/trackers", { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (response.status === 401) { router.replace("/login"); return; }
      if (!response.ok) throw new Error();
      setItems((await response.json()).items);
      setLastRefresh(Date.now());
      setFailed(false);
    } catch { setFailed(true); }
    finally { inFlight.current = false; setRefreshing(false); }
  }, [router]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    function resume() {
      clearInterval(timer);
      if (document.visibilityState === "visible") {
        void refresh();
        timer = setInterval(() => { void refresh(); }, 20000);
      }
    }
    resume();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", resume); window.removeEventListener("focus", resume); };
  }, [refresh]);

  const select = useCallback((id: string) => { setSelectedId(id); setMobileOpen(false); }, []);
  const visible = items.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()) && (filter === "All" || freshness(item, now) === filter));
  const location = selected?.latestLocation;
  const panel = <div className="space-y-5 p-5">
    <header><p className="text-xs font-semibold tracking-widest text-primary">PRIVATE LOCATOR</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Your things <span className="text-muted-foreground">{items.length}</span></h1>
      <p className="mt-1 text-xs text-muted-foreground">Last known positions. Refreshed every 20 seconds.</p></header>
    <div className="relative"><Search className="absolute top-3 left-3 size-4 text-muted-foreground" aria-hidden="true" />
      <Input aria-label="Search your things" placeholder="Search your things" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
    <div className="flex flex-wrap gap-1" aria-label="Filter by reporting status">
      {["All", "Recent", "Stale", "Offline", "On demand", "Phone-assisted", "Never reported"].map((status) =>
        <Button key={status} size="sm" variant={filter === status ? "secondary" : "ghost"} aria-pressed={filter === status} onClick={() => setFilter(status)}>{status}</Button>)}
    </div>
    <div role="status" className="text-xs text-muted-foreground">
      {failed ? <><span className="text-caution">Refresh failed; showing saved positions.</span> <Button size="sm" variant="ghost" disabled={refreshing} onClick={() => void refresh()}>Retry</Button></> : refreshing ? "Refreshing…" : "Up to date with server"}
      <p>Last refreshed <time dateTime={new Date(lastRefresh).toISOString()}>{new Date(lastRefresh).toISOString().slice(11, 19)} UTC</time></p>
    </div>
    <ul className="space-y-2" aria-label="Your trackers">
      {visible.map((item) => {
        const status = freshness(item, now);
        const Icon = item.type === "IPHONE" ? Smartphone : item.type === "APPLE_WATCH" ? Watch : Radio;
        return <li key={item.id}><Button variant="ghost" aria-pressed={selectedId === item.id} className={`h-auto w-full justify-start gap-3 whitespace-normal rounded-xl border p-3 text-left ${selectedId === item.id ? "border-primary bg-primary/5" : "bg-card"}`} onClick={() => select(item.id)}>
          <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" /><span className="min-w-0 flex-1"><strong className="block break-words">{item.name}</strong>
            <span className="mt-1 block text-xs font-normal text-muted-foreground">{item.latestLocation ? `Last reported ${new Date(item.latestLocation.reportedAt).toISOString().replace("T", " ").replace(".000Z", " UTC")}` : "Waiting for its first report"}</span>
            {item.latestLocation && <span className="block text-xs font-normal text-muted-foreground">{item.latestLocation.latitude.toFixed(5)}, {item.latestLocation.longitude.toFixed(5)}</span>}
            <Badge variant="secondary" className={`mt-2 ${status === "Recent" ? "text-healthy" : status === "Stale" ? "text-caution" : "text-muted-foreground"}`}>{status}</Badge>
          </span></Button></li>;
      })}
    </ul>
    {visible.length === 0 && <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
      {items.length === 0 ? "Add your first tracker, then send a location from its device." : <>No matching things. <Button variant="link" onClick={() => { setSearch(""); setFilter("All"); }}>Reset filters</Button></>}
    </div>}
    {selected && <section className="space-y-3 border-t pt-5" aria-label="Selected tracker details">
      <h2 className="break-words text-xl font-semibold">{selected.name}</h2>
      <p className="text-sm text-muted-foreground">{selected.type === "APPLE_WATCH" ? "Apple Watch · Phone-assisted; this may be the phone’s position." : selected.type === "IPHONE" ? "iPhone Shortcut" : "ESP32 GPS"} · {selected.reportingMode === "ON_DEMAND" ? "On demand" : `Expected every ${selected.expectedIntervalSeconds}s`}</p>
      {location ? <dl className="space-y-2 text-sm">
        <div><dt className="text-muted-foreground">Coordinates</dt><dd className="font-mono">{location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</dd></div>
        <div><dt className="text-muted-foreground">Observed</dt><dd>{location.reportedAt} · {sourceLabel(location.source)}</dd></div>
        {Date.parse(location.receivedAt) - Date.parse(location.reportedAt) > 60000 && <div><dt className="text-muted-foreground">Received (delayed upload)</dt><dd>{location.receivedAt}</dd></div>}
        {location.accuracyMeters !== null && <div><dt className="inline text-muted-foreground">Accuracy: </dt><dd className="inline">{location.accuracyMeters} m</dd></div>}
        {location.batteryPercent !== null && <div><dt className="inline text-muted-foreground">Battery: </dt><dd className="inline">{location.batteryPercent}%</dd></div>}
        {location.speedMps !== null && <div><dt className="inline text-muted-foreground">Speed: </dt><dd className="inline">{location.speedMps} m/s</dd></div>}
      </dl> : <p className="text-sm text-muted-foreground">Never reported. Issue a token and configure the device to send its first fix.</p>}
      <TrackerHistory key={selected.id} trackerId={selected.id} onTrail={setTrail} />
    </section>}
    <TrackerManager selected={selected} refresh={refresh} />
    <footer className="border-t pt-4 md:hidden">{account}</footer>
  </div>;

  return <main className="flex h-dvh flex-col overflow-hidden bg-background md:flex-row">
    <Toaster />
    <nav aria-label="Dashboard" className="hidden w-16 shrink-0 flex-col items-center gap-5 border-r bg-card py-5 md:flex">
      <MapPin className="size-7 text-primary" aria-label="Private locator" />
      <Button size="icon" variant="secondary" aria-label="All things" onClick={() => { setCollapsed(false); setFilter("All"); setSearch(""); }}><Crosshair /></Button>
      <Button size="icon" variant="ghost" aria-label="Recently reporting things" onClick={() => { setCollapsed(false); setFilter("Recent"); }}><Radio /></Button>
      <Button size="icon" variant="ghost" aria-label={collapsed ? "Expand asset panel" : "Collapse asset panel"} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</Button>
      <div className="mt-auto w-full px-2">{account}</div>
    </nav>
    <aside className={`${collapsed ? "hidden" : "hidden md:block"} w-96 shrink-0 overflow-y-auto border-r bg-card`} aria-label="Asset panel">{panel}</aside>
    <header className="flex items-center justify-between gap-3 border-b bg-card p-3 md:hidden"><span className="flex items-center gap-2 font-semibold"><MapPin className="size-5 text-primary" />Your things</span><Button variant="outline" onClick={() => setMobileOpen(true)}>Search / details ({items.length})</Button></header>
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}><SheetContent side="left" className="w-[min(92vw,24rem)] overflow-y-auto pb-[env(safe-area-inset-bottom)]">
      <SheetHeader className="sr-only"><SheetTitle>Your things</SheetTitle><SheetDescription>Search trackers, inspect reports, and manage devices.</SheetDescription></SheetHeader>{panel}
    </SheetContent></Sheet>
    <section className="relative min-h-0 flex-1 bg-muted" aria-label="Last known location map">
      <TrackerMap items={items} selectedId={selected?.id ?? null} onSelect={select} trail={trail && trail.trackerId === selected?.id ? trail.points : []} />
      {!items.some((item) => item.latestLocation) && <div className="pointer-events-none absolute top-5 left-1/2 w-64 -translate-x-1/2 rounded-xl border bg-card p-4 text-center text-sm shadow-sm">No locations yet. Add a tracker and send its first report.</div>}
      {selected && <Button className="absolute bottom-12 left-3 md:hidden" variant="secondary" onClick={() => setMobileOpen(true)}>Details: {selected.name}</Button>}
    </section>
  </main>;
}
