# Product design: private map dashboard

## Direction

The reference image informs the **composition**, not the branding: a full-screen
interactive map with a narrow navigation rail, a substantial left details panel,
compact floating controls, and minimal chrome. Make it feel precise, calm, and
expensive through alignment, typography, whitespace, and restrained depth. This is
not a Google Maps replica and does not need restaurants, hotels, traffic, or a
marketing landing page. The only public screen is sign-in.

## Screen structure

### Desktop and tablet landscape

```text
┌──────┬──────────────────────────────┬──────────────────────────────────────┐
│ rail │ asset search + list/details  │ map: marker(s) + floating controls   │
│ 64px │ ~360–400px; collapsible      │ fills remaining viewport             │
└──────┴──────────────────────────────┴──────────────────────────────────────┘
```

- **Rail:** logo/locator mark, All things, Recent, and Settings shortcuts, with
  active state and accessible labels; keep features not yet shipped out of the UI.
- **Asset panel:** search by item name, status filter, compact rows with type icon,
  last reported time and status, and a selected-item detail view. Collapse without
  losing the current selection or map position.
- **Map canvas:** one viewport-sized, client-rendered map. Distinct selected and
  unselected markers, accuracy circle if provided, a visible attribution control,
  and an empty state when no location exists. Clicking a marker selects its asset;
  selecting an asset centers the map without constantly recentering while the
  owner is panning.
- **Map controls:** fit to all tracked things, zoom, and optional locate-me
  (permission-based browser location; never silently save it). Float in a safe
  corner away from attribution. Keep controls reachable by keyboard.
- **Selected asset:** name and device type, last observed coordinates or an
  approachable location summary, reported time, received time when delayed,
  accuracy/battery when available, and a link to recent history. Provide token
  rotation and delete actions in explicit confirmation dialogs.

### Mobile

- Map occupies the screen below a compact search/header row; an accessible
  shadcn/ui Sheet/bottom panel exposes the asset list and selected details.
- Do not let overlays hide map attribution or the active marker. Use sufficiently
  large touch targets, safe-area spacing, and stable controls as the panel moves.
- Sign-in is a centered, focused form with no app navigation until authenticated.

## Visual system

| Token | Value / intent |
| --- | --- |
| Primary blue | `#1A73E8` for selection, links, focus-adjacent emphasis; `#4285F4` for softer accents |
| Healthy green | `#34A853` or deeper `#0F9D58` for recently reporting interval devices |
| Surfaces | Warm white and subtle cool-gray elevation above the map |
| Text | Deep charcoal for primary text, muted gray for secondary timestamps |
| Caution | Amber for stale data; neutral gray for offline or never reported |
| Radius/shadow | Quiet, consistent rounding and soft shadows; no heavy glass effects |

Define these as semantic Tailwind v4/CSS theme tokens so components do not repeat
hex values. Use the existing Geist font family or another clearly documented
choice. Use text plus icons, never color alone, to communicate freshness. Respect
reduced-motion preferences for map fly-to and panel animation. No JSX inline
styles; map configuration objects passed to MapLibre are map data, not CSS.

## Component behavior

- **Controls:** shadcn/ui Button, Input, Badge, Tabs/Select as needed, Dialog or
  AlertDialog for destructive actions, Sheet on mobile, and Sonner for toasts.
  Toasts acknowledge saves or errors; validation errors appear beside fields.
- **Search:** searches owned tracker names; empty results have a clear reset.
  No general web/place search is planned for MVP.
- **Freshness:** interval trackers display `Recent`, `Stale`, or `Offline` based
  on their expected reporting interval. On-demand Shortcuts display a last-
  reported timestamp rather than a green live badge. The watch entry must
  explicitly say `Phone-assisted` if the report came from the iPhone.
- **Latency:** refresh latest locations every 20 seconds while the dashboard is
  visible, immediately on return to the tab, and after successful writes; pause
  background polling. Keep the existing map and markers during transient errors,
  but show a discreet reconnect state and the last successful refresh time.
- **States:** skeleton for first load, helpful add-tracker empty state, no-signal
  state for an unreported tracker, retry for data errors, and a no-WebGL/map-load
  fallback with a readable list and coordinates.

## Map sources and attribution

Use MapLibre GL JS (open-source) with a configurable OpenStreetMap-derived raster
tile source for MVP; richer vector styles can be added later. During low-traffic
personal development, the standard OSM raster tiles may be used only under the
[OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/):
visible attribution, normal interactive loading, browser caching, valid referrer,
and no bulk prefetch/offline downloads. OSM's public tile service is best-effort,
so choose a compliant alternative or self-host tiles before depending on it for
availability. Tile-provider changes must not change the asset UI.

## Design acceptance

1. After sign-in, the map is the dominant view at desktop and mobile widths.
2. The owner can find and select a thing, see its most recent report time and
   source, and distinguish recent, stale, offline, and on-demand data.
3. Every action has clear keyboard focus, label, loading/disabled state, and
   appropriate confirmation or feedback; map attribution remains visible.
4. A loss of map tiles or WebGL does not hide the last known location list.

See [MVP scope](docs/MVP.md) and [architecture](ARCHITECTURE.md).
