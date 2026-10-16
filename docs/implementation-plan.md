# Implementation plan

This is a staged delivery plan for the documentation-defined MVP, not a claim
that the app has already been built. Current baseline: Next.js 16 / React 19 /
Tailwind v4 with phases 0–4 implemented: contracts, persistence/seed,
authentication, tracker APIs, and the map-first dashboard. Release verification
and real-device checks remain in phase 5.

## 0. Confirm foundations and contract

- Read the installed Next.js guides for each feature before coding (auth, Route
  Handlers, environment variables, and Proxy as applicable). Confirm compatible
  Auth.js, Prisma, Neon, MapLibre, Zod, and shadcn/ui versions at install time.
- Set up a committed placeholder `.env.example` with an explicit `.gitignore`
  exception; keep real `.env*` files ignored. Decide deployment target and how
  its daily retention scheduler will invoke the private cleanup task.
- Turn the v1 table and ingest example in `ARCHITECTURE.md` into an executable
  contract/test fixture before writing ESP32 or Shortcut payload producers.

**Done when:** environment names, JSON payloads/error codes, dependencies, tile
source, and retention scheduling are reproducible without any committed secret.

Foundation choices: deploy on Vercel with Neon PostgreSQL. `DATABASE_URL` uses
Neon's pooled URL via the Prisma Neon adapter; Prisma migrations use the direct
`DIRECT_URL`. Configure a Vercel cron to send `GET /api/cron/retention` daily at
`0 3 * * *` (UTC). Set `CRON_SECRET` in Vercel: it is sent automatically as a
Bearer header and the handler must compare it before deleting history. Add the
cron entry in `vercel.json` together with the authenticated handler in phase 3,
so a deployment cannot schedule a nonexistent or unprotected cleanup route.
The cleanup is idempotent (delete rows older than 30 days); Vercel cron is
best-effort and does not retry failures. Check its invocation logs after deploy.

Pinned versions are in `package.json`/`package-lock.json`: Auth.js (`next-auth`
5.0.0-beta.32), Prisma Client/CLI/Neon adapter (7.10.1), Neon driver (1.2.0),
MapLibre (6.14.0), and Zod (4.6.7). Use the shadcn/ui CLI at pinned version
`shadcn@4.22.0` when adding actual UI components in phase 4. Use Node.js 20.19+,
22.12+, or 24+ (not Node 21/23); run `npm ci` for reproducible installation.
The authoritative
v1 HTTP contract and executable examples live in `contracts/openapi.yaml`;
run `postman spec lint contracts/openapi.yaml --issueType=syntax --no-report-events`
to check it without a Postman login. The collection in `postman/collections/`
was generated from that spec (`.postman/workflows.yaml` records the direction)
and then corrected to send owner cookies and dynamic device fixture timestamps.
Lint it with `postman collection lint "postman/collections/Personal GPS locator v1"`.
After a contract change, regenerate the collection, then reapply the cookie,
dynamic-field and assertion adjustments before running it. Live requests require
an implemented API, an owned `trackerId`, and locally supplied credentials.
OSM public raster tiles in `.env.example` are for modest interactive development
only: configure a policy-compliant OSM-derived provider before production,
keeping visible attribution and no bulk tile downloads.

## 1. Persistence and owner seed

- Add Prisma schema and migrations for User, Tracker, DeviceCredential,
  LocationPoint, and LatestLocation with ownership relationships, indexes, and
  cascade deletion.
- Connect Prisma to Neon; account for pooled application traffic and direct
  migrations according to the installed Prisma/Neon version.
- Add an explicit idempotent owner-seed command reading `SEED_OWNER_EMAIL` and
  `SEED_OWNER_PASSWORD`; normalize email and hash the password with Argon2id.
  Existing owner credentials must not be reset by subsequent seeds; reject a
  different email if an owner already exists.

**Done when:** migrations apply to a clean database, seed creates one login,
repeat seed does not change its password, and missing settings fail clearly.

The initial migration, Neon adapter client, and explicit `npm run db:migrate`
and `npm run db:seed` commands are implemented. The seed uses a fixed owner ID,
normalized email, and Argon2id; it does not reset an existing password. Local
unit tests verify creation/repeat/rejection. On a disposable Neon database,
`npm run db:migrate`, `npm run db:seed` (twice), and `npm run test:db` verified
the migration, password-preserving behavior, history deduplication constraint,
snapshot persistence after history deletion, and tracker cascade deletion.

## 2. Authentication and protected shell

- Configure Auth.js/NextAuth Credentials and server-side session validation.
  Replace the starter `/` with the protected map shell; create `/login` and
  sign-out. There is no public registration or landing page.
- Centralize session/owner checks in data access. Add login rate limiting and
  verify protected routes and mutations at their server boundary. Proxy can
  redirect early but never replaces these checks.

**Done when:** valid owner login works; invalid credentials reveal no account
details; anonymous users cannot read or change tracker data.

Phase 2 implementation: Auth.js credentials JWT sessions, a protected `/` shell,
`/login`, sign-out, a server-side owner lookup for future data access, and an
atomic PostgreSQL per-email login throttle. The tracker API and map remain for
phases 3–4. Run `npm run db:migrate` for the login-throttle table before sign-in.

## 3. Tracker management and ingestion

- Add validated tracker create/edit/delete and owner-only list/history Route
  Handlers. Build high-entropy one-time token issuance, digest storage, rotation,
  and revocation with suitable confirmation UI.
- Implement `POST /api/v1/locations` using a device token, tracker/source binding,
  Zod validation, rate/body limits, observation vs receipt timestamps, and
  idempotent `messageId` handling. Advance the last-known snapshot only for
  newer observations, atomically with history insertion. Include sample ESP32
  HTTPS and iPhone Shortcut setup steps in
  a follow-up integration guide once their requests have been exercised.
- Implement seven-day bounded history and a daily authenticated task to remove
  historical reports older than 30 days without erasing last-known snapshots;
  wire the scheduler for the chosen deployment.

**Done when:** token rotation invalidates the old token, malformed or cross-
tracker input fails, a duplicate does not create a second point, and delayed
fixes do not move the latest marker backward. Verify history limits, deletion,
and retention against the database.

## 4. Map-first dashboard and interaction

- Add Tailwind theme tokens and shadcn/ui primitives. Build desktop rail,
  searchable asset panel, selected asset details, mobile Sheet, sign-in form,
  dialogs, and Sonner feedback per `DESIGNS.md`.
- Add a client-only MapLibre map with configurable OSM-derived tiles and visible
  attribution. Connect markers, selection, fit-to-assets, history trail/list,
  and map-load failure fallback. Avoid JSX inline styling.
- Poll latest owned points every 20 seconds while the tab is visible; refresh
  immediately when refocused. Show never-reported, interval freshness states,
  and on-demand/phone-assisted wording without suggesting constant GPS updates.

**Done when:** the map is primary on desktop and mobile, markers correspond to
DB reports, the user can still read locations without tiles, and the watch is
never represented as independently live based on a phone fix.

Phase 4 implementation: server-loaded owned snapshots, a client-only MapLibre
raster map, selected markers and accuracy area, fit/zoom controls, searchable
status-filtered panel, mobile Sheet, selected telemetry, and paginated seven-day
history with a loaded-observation trail. Existing management/token confirmations
and Sonner feedback are reused. Polling pauses in hidden tabs and refreshes on
focus/visibility return; failures preserve existing data with a visible retry.
Provider attribution is configurable alongside the tile URL, with OSM credit
always visible. Unit tests cover freshness thresholds, future clock skew,
phone-assisted wording, and accuracy geometry. Lint, typecheck, unit tests, and
production build pass; interactive browser and real-device checks remain phase 5.

## 5. Verification and release

- Test credentials and ownership boundaries, input ranges, token lifecycle,
  duplicate and delayed reports, freshness thresholds, retention, and protected
  history. Check sign-in, tracker management, search, mobile layout, keyboard
  controls, and error states in a browser.
- Run lint, TypeScript typecheck, relevant automated tests, and production build.
  Smoke-test the deployed app, Neon migrations, scheduler, tile attribution,
  one ESP32-style request, and one actual iPhone Shortcut request.
- Confirm secrets are in deployment configuration, not logs/client bundles, and
  that map tiles are served by a compliant provider for the expected usage.

**Done when:** the owner can log in, register a thing, submit and view a real
fix, see its true reporting age, inspect history, rotate the token, and delete
the thing from a deployed private instance.

Phase 5 verification tooling is implemented: production-mode Playwright HTTP/UI
checks, expanded input-boundary tests, a client secret-literal scan, and isolated
database-test gating. The suite covers auth/owner boundaries, device binding,
token lifecycle, duplicate/delayed reports, bounded history, request/rate limits,
sign-in/out, tracker forms, keyboard selection, mobile Sheet, phone-assisted
wording, polling/recovery and tile/WebGL failures. It preserves the phase 4 map
worker/sizing fixes and rejects malformed cron credentials without a server error.

See [release verification](release.md) and [device setup](device-setup.md) for
repeatable commands and smoke tests. Release remains pending until disposable-DB
tests, deployed scheduler/tile-provider checks and actual deployment/device smoke
tests are completed. Do not mark skipped integration tests as passed.

## After MVP

Evaluate a native iOS/watchOS companion for independent and more regular
location reporting, then optional geofences/alerts. Consider push updates only
if the 20-second polling experience is insufficient. See [scope](MVP.md),
[architecture](../ARCHITECTURE.md), and [design](../DESIGNS.md) for the controlling
decisions.
