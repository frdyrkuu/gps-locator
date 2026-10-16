# Architecture

## Boundaries and runtime

```text
Owner browser ── Auth.js cookie ──► Next.js App Router ── Prisma ──► Neon PostgreSQL
     │                                │       ▲
     └─ MapLibre + OSM-derived tiles  │       │
ESP32 / iPhone Shortcut ── token ────► Route Handler: POST /api/v1/locations
Scheduled retention job ── private credential ──► delete old history rows
```

Use Next.js 16 App Router and TypeScript. Render authenticated shell/data on the
server; initialize MapLibre GL JS in a client component. Route Handlers provide
the JSON API. Keep user/session checks close to data access and in each server
mutation; `proxy.ts`, if added for redirects, is only an optimistic gate. Avoid
caching private tracker responses across users; use request-time data and
`no-store` for browser polling. Use the Node.js runtime for Prisma and password
hashing. Do not run database access in the browser or Proxy.

## Identity and access

- **Owner:** Auth.js/NextAuth Credentials provider with an email and password
  from an idempotent seed. Seed stores an Argon2id password hash in `User`; never
  stores or echoes the raw seed password. No public registration. Use secure
  cookie-backed JWT sessions (no Auth.js adapter needed for this single-owner
  credentials flow); load the `User` by the stable user ID in the session token
  when accessing owner data. Seeding with the same email must not change an
  existing password; if a different owner already exists, fail rather than
  silently creating a second account.
   Session authorization and tracker ownership checks apply to reads and writes.
  Login attempts are atomically limited to five per normalized email in a
  15-minute window in PostgreSQL; a successful sign-in clears the counter.
  Expired counters are pruned on later sign-in attempts. Invalid credentials
  and throttled attempts use the same sign-in error.
- **Device:** generate a high-entropy random bearer token bound to one tracker.
  Format it as `<tokenId>.<randomSecret>`; look up by token ID and store only a
  SHA-256 digest of the high-entropy secret. Show the full token only at
  creation/rotation, compare digests safely, and revoke old tokens on rotation.
  Device tokens authorize ingestion only, not owner APIs. Avoid tokens in URLs,
  query strings, logs, error payloads, or analytics.
- Require HTTPS outside local development, rate-limit login and device ingest,
  and validate content type and maximum body size. Owner-facing API responses
  contain only the current owner's records. Return a generic not-found for IDs
  belonging to other owners.

## Database (Prisma + Neon PostgreSQL)

| Model | Essential fields and invariants |
| --- | --- |
| `User` | `id`, unique normalized `email`, `passwordHash`, `createdAt`; seeded owner only |
| `LoginAttempt` | SHA-256 email key, attempt count, window start; server-side sign-in throttle, no raw email stored |
| `Tracker` | `id`, `ownerId` FK, `name`, `type` (`ESP32`/`IPHONE`/`APPLE_WATCH`), `reportingMode` (`INTERVAL`/`ON_DEMAND`), nullable `expectedIntervalSeconds`, `createdAt`, `updatedAt`; cascade-delete related data |
| `DeviceCredential` | `id`, `trackerId` FK, unique `tokenId`, `tokenDigest`, `createdAt`, nullable `revokedAt`; never store bearer token plaintext |
| `LocationPoint` | `id`, `trackerId` FK, `latitude`, `longitude`, `reportedAt` (device observation), `receivedAt` (server ingestion), nullable `accuracyMeters`, `batteryPercent`, `speedMps`, `messageId`, and source (`ESP32`/`IPHONE_SHORTCUT`/`WATCH_PHONE_ASSISTED`); unique `(trackerId, messageId)` when message ID is present |
| `LatestLocation` | one-to-one with `Tracker`; snapshot of the newest observation's coordinates, source, telemetry, `reportedAt`, and `receivedAt`; stores `pointId` as an unfollowed tie-breaker (no FK to pruned history); survives history pruning until tracker deletion |

Index `(trackerId, reportedAt DESC, id DESC)` for history. Use PostgreSQL
`timestamptz` and UTC application timestamps. The initial migration enforces a
single owner ID and database checks for coordinate/telemetry ranges and
reporting-mode intervals.
Write the new history point and conditionally advance `LatestLocation` within a
transaction only when its `reportedAt` is newer (break ties consistently); do
not replace it based on arrival order. Validate `latitude` -90..90, `longitude`
-180..180, `accuracyMeters` and `speedMps` non-negative, `batteryPercent` 0..100,
and sane payload sizes. Accept delayed uploads at most seven days old and at most
five minutes in the future, with server time as the reference. Bound history
queries to the last seven days and pages of at most 100 points. A scheduled job
deletes historical points older than 30 days; the one last-known snapshot is
retained until tracker deletion so offline items do not become "never reported."
Deploy on Vercel with a daily `GET /api/cron/retention` at `0 3 * * *` UTC,
authorized by the Vercel-provided `Authorization: Bearer <CRON_SECRET>` header.
Add the cron configuration with the implemented handler in phase 3; cron is
best-effort and has no automatic retries. Cleanup must be idempotent.

For Neon, use the pooled connection via the Prisma Neon adapter for application
queries and `DIRECT_URL` for migrations, following the installed Prisma 7.10.1
guides. Auth.js is pinned in `package.json`; read the installed Next.js guides
before writing integration code. Apply versioned migrations, not schema push,
in deployed environments.

## HTTP contract (v1)

Owner endpoints require an Auth.js session. Device ingest uses only a bearer
token; v1 endpoints with response bodies return JSON and consistent errors such as
`{ "error": { "code": "VALIDATION_ERROR", "message": "..." } }` without secrets.

| Method and path | Credential | Purpose |
| --- | --- | --- |
| `GET /api/v1/trackers` | Owner session | Owned trackers with latest reported point and status inputs; no token data |
| `POST /api/v1/trackers` | Owner session | Create a named tracker with type and reporting mode |
| `PATCH /api/v1/trackers/{id}` | Owner session | Rename or update tracker settings |
| `DELETE /api/v1/trackers/{id}` | Owner session | Delete tracker, history, credentials |
| `POST /api/v1/trackers/{id}/credentials` | Owner session | Issue or rotate a token; raw token appears once in response |
| `DELETE /api/v1/trackers/{id}/credentials` | Owner session | Revoke all active tokens without deleting the tracker |
| `GET /api/v1/trackers/{id}/locations?cursor=…&limit=…` | Owner session | Paginated last-seven-day history (maximum 100/page) |
| `POST /api/v1/locations` | Device bearer token | Submit one GPS observation for that token's tracker |

Tracker create/update accepts `{ "name": "Motorcycle", "type": "ESP32",
"reportingMode": "INTERVAL", "expectedIntervalSeconds": 30 }`; an on-demand
Shortcut tracker uses `"reportingMode": "ON_DEMAND"` and a null interval.
Validate trimmed names (1–100 characters) and interval bounds (10–86400 seconds)
on the server. In v1 PATCH supplies all mutable settings. JSON write bodies are
limited to 4096 bytes; non-JSON bodies return `415`, oversize bodies return
`413`. `GET /api/v1/trackers` returns
owned tracker IDs, names, settings, and the nullable `latestLocation` snapshot
with observed/received time and source; it never includes credentials. History
returns `{ "items": [<location-point>], "nextCursor": "<opaque-or-null>" }`
and requires an owned tracker ID. Creating a tracker returns `201`, changes
return `200`, and deletion returns `204`. Token issuance returns `201` with
`{ "token": "<tokenId>.<randomSecret>" }` and `Cache-Control: no-store`;
rotating revokes previous credentials for that tracker atomically. Never return
the token again from any GET endpoint. `DELETE` on credentials revokes them all
and returns `204`; a later `POST` can issue a replacement. Owner write requests
with an `Origin` header must match the request origin.

Ingest example (the token's tracker must match `trackerId`):

```http
POST /api/v1/locations
Authorization: Bearer <one-time-device-token>
Content-Type: application/json

{
  "trackerId": "<tracker-id>",
  "latitude": 14.6760,
  "longitude": 121.0437,
  "reportedAt": "2026-10-17T08:30:00Z",
  "accuracyMeters": 8,
  "batteryPercent": 82,
  "messageId": "fix-001",
  "source": "ESP32"
}
```

Use `IPHONE_SHORTCUT` for an iPhone tracker and `WATCH_PHONE_ASSISTED` for a
watch-labeled on-demand tracker. Reject a source inconsistent with the tracker
type; watch-labeled submissions do not assert independent watch GPS. `messageId`
is optional (1–128 characters when present) but strongly recommended for retrying ESP32 uploads. Repeating an
accepted `messageId` with different contents does not mutate the stored fix.

Return `201` with `{ "id": "<location-id>", "receivedAt": "<ISO-UTC>" }`
on first acceptance. If `(trackerId, messageId)` was already accepted, return
`200` with the existing ID and `duplicate: true` without a second insert.
Malformed input returns `400`, invalid/missing bearer `401`, a token/ID or
source mismatch `403`, oversized JSON `413`, non-JSON `415`, excessive requests
`429`; session endpoints use `401`
for unauthenticated and `404` for non-owned IDs. Avoid retrying a `400`/`403`
device request unchanged. The executable source of truth for payloads, errors,
and examples is [`contracts/openapi.yaml`](contracts/openapi.yaml); validate it
before implementing firmware/Shortcut clients and keep both representations current.
Ingest is limited to 60 authenticated requests per token per minute (PostgreSQL
atomic counter); `429` includes `Retry-After: 60`. Duplicate message IDs return
their original receipt even if the retried position differs. Non-local HTTP
ingest is rejected with `403 HTTPS_REQUIRED`.

## Freshness and delivery semantics

- Browser refetch: every **20 seconds while visible** and on visibility return.
  Stop interval polling in background; use a bounded retry after network errors.
- Interval trackers: `Recent` if now minus `reportedAt` is at most
  `max(3 × expectedIntervalSeconds, 60 seconds)`; `Offline` if it exceeds
  `max(10 × expectedIntervalSeconds, 15 minutes)`; `Stale` between those bounds.
  Never reported is a separate state. Display last observation and optional
  last receipt when reporting was delayed.
- On-demand trackers: show `Last reported <time>` and source, without a live
  badge. Watch phone-assisted reports cannot imply independent watch GPS.
- Delayed fixes may appear in history. Both API and UI choose the latest by
  observation timestamp, not ingestion timestamp. The status is derived at read
  time from `LatestLocation` so it becomes stale without a new write. Clamp
  negative elapsed time from small accepted device clock skew to zero for status
  calculation; retain and display the actual reported timestamp.

## Map, validation, and operational concerns

MapLibre is open-source; tiles must come from a configured OSM-derived source.
The public [OSM raster tile service](https://operations.osmfoundation.org/policies/tiles/)
is for modest interactive use, with visible attribution, caching, and a usable
HTTP referrer; it is not a guaranteed production tile backend or a source for
bulk download. Do not transmit tracked coordinates to geocoding/search
providers without a deliberate feature decision. Map failures must not hide the
server-rendered/listed last positions.

Use shared Zod schemas for API and form shape where appropriate, but always
validate on the server. Use parameterized Prisma access, owner-scoped queries,
and bounded pagination. Retain minimal location metadata, avoid storing raw
authorization headers, and do not expose private coordinates in public pages or
metadata. Logs should contain non-sensitive IDs and error codes, never payloads
or secrets.

## Environment contract

Placeholder names are committed in `.env.example`; real `.env*` values remain
ignored. Required server-only values:

```text
DATABASE_URL=<Neon application connection URL>
DIRECT_URL=<Neon direct migration URL, if required by selected Prisma setup>
AUTH_SECRET=<high-entropy session secret>
SEED_OWNER_EMAIL=<initial owner email>
SEED_OWNER_PASSWORD=<initial owner password; seed-time only>
CRON_SECRET=<private Vercel scheduled-job credential>
```

`NEXT_PUBLIC_MAP_TILE_URL` may contain a **public** configurable tile template;
`NEXT_PUBLIC_MAP_TILE_ATTRIBUTION` supplies the provider's required public
attribution HTML. OSM credit is always displayed. Both are build-time public values;
if a provider needs a secret, do not put that secret in `NEXT_PUBLIC_` variables.
Seed variables are required only when running the explicit seed command, not on
each request or deployment startup. Store deployment values in the hosting
provider's secret manager. Never commit a real connection string, password, or
device token.

See [MVP scope](docs/MVP.md), [design](DESIGNS.md), and
[implementation order](docs/implementation-plan.md).
