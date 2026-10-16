# MVP: personal GPS locator

## Outcome

One owner signs in and sees the last known locations of their own things on a
map-first dashboard. An ESP32-based motorcycle tracker can submit GPS fixes over
HTTPS. An iPhone Shortcut can send the phone's location when run. The dashboard
refreshes recent server data every **20 seconds while visible** (inside the
requested 15–30 second window); it cannot make a device report more often.

The application is for the owner's devices and belongings, not for tracking other
people. It has no public sign-up, marketing homepage, or sharing feature.

## Must ship

1. **Owner access:** credentials sign-in with Auth.js/NextAuth; an initial owner
   account seeded from environment variables into Neon PostgreSQL via Prisma.
   Signed-out visitors go to `/login`; `/` opens the protected map dashboard.
   Sign-out is available in the dashboard.
2. **Trackers:** the owner can add, name, edit, and delete an item and assign its
   type (`ESP32`, `iPhone`, or `Apple Watch`) and reporting mode (`interval` or
   `on-demand`). Interval devices have an expected report interval; Shortcuts
   start in on-demand mode. A tracker may have no position yet.
3. **Device credentials:** create a separate ingest token for a tracker, reveal
   it once, and allow rotation/revocation. Never store a raw token in the DB or
   expose it from the tracker list. The Shortcut and ESP32 use these credentials.
4. **Reporting:** one authenticated HTTPS endpoint accepts coordinates, an
   observed timestamp, and optional accuracy, battery, speed, and idempotency ID.
   Reject malformed, unauthorized, implausibly future, or excessively old input;
   an older valid fix can enter history without replacing a newer latest fix.
5. **Map dashboard:** show owned trackers, last known markers and a selected-item
   detail panel. Search by item name; center/fit the map; display accurate
   timestamps and optional telemetry. Clearly indicate missing and stale data.
   Refresh automatically while visible and on tab return; show refresh failure.
6. **History:** view the last seven days of reports for one selected tracker,
   newest first, with a bounded, paginated API and a simple map trail/list.
   Automatically remove location points older than 30 days using a scheduled
   maintenance task. Keep one last-known fix per tracker until that tracker is
   deleted, even if its detailed history expires; deleting a tracker removes
   its token, snapshot, and location records.
7. **Accessible responsive UI:** desktop sidebar + dominant map, mobile Sheet,
   Tailwind styles, shadcn/ui dialogs/buttons and Sonner notifications. Keep
   OpenStreetMap attribution visible.

## Source-specific expectations

| Source | What the MVP actually knows | UI wording |
| --- | --- | --- |
| ESP32 GPS device | Its last successfully uploaded fix; availability depends on power, GPS reception, cellular/Wi-Fi, and upload schedule | `Recent`/`Stale`/`Offline` plus timestamp for an interval tracker |
| iPhone Shortcut | The iPhone position captured when the Shortcut runs and reaches the server | `Last reported …`, not continuously live |
| Apple Watch entry | A location explicitly submitted through a watch-initiated/phone-assisted Shortcut, if configured; it may represent the phone rather than an independent watch GPS fix | `Phone-assisted` with the source and observed time; no independent-live claim |

Do not assume access to Apple's Find My locations or reliable 20-second iOS/watchOS
background updates. Direct watch GPS, background reporting, and a native companion
app require a separate integration and are outside this MVP.

## Acceptance scenarios

- Given no database owner, running the documented seed with required environment
  variables creates one owner with a hashed password; running it again leaves an
  existing owner's password unchanged. Missing seed variables fail clearly.
- A signed-out visitor cannot view the map, list locations, or mutate trackers.
  An invalid sign-in is rejected without revealing whether an email exists.
- The owner registers an ESP32 tracker, copies its token once, sends a valid fix,
  and sees it on the map by the next visible refresh (within 20 seconds plus
  ordinary network/server latency). A rotated token immediately stops working.
- An iPhone Shortcut submits a fix to its own tracker; the dashboard labels it
  as on-demand and shows the actual reported time even hours later.
- An invalid latitude, missing credential, mismatched tracker ID, or duplicate
  idempotency ID cannot create a second or unauthorized location point. Delayed
  data does not move a marker backward in time.
- History returns at most a page of points from the last seven days; deleting a
  tracker makes its history and token unusable. The retention task removes
  historical records older than 30 days while preserving the one last-known fix
  of a tracker that has gone offline.
- At narrow widths, the list/details remain usable through the Sheet; keyboard
  users can sign in, select an item, and operate controls. Map attribution stays
  readable. If tiles fail, the list still gives timestamps and coordinates.

## Deliberately later

- Independent Apple Watch telemetry, native iOS/watchOS apps, Find My syncing,
  guaranteed background location from Shortcuts, and offline map downloads.
- Geofences, theft alerts, push notifications, multi-owner sharing, navigation,
  route optimization, place search, and hotels/restaurants/traffic overlays.
- Sub-second streaming/WebSockets; polling is sufficient for this first release.

The UI behavior is specified in [DESIGNS.md](../DESIGNS.md), the contract and
security model in [ARCHITECTURE.md](../ARCHITECTURE.md), and delivery milestones in
[implementation-plan.md](../implementation-plan.md).
