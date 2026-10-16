# Personal GPS locator

Private tracker for the owner's belongings. Persistence, owner sign-in, tracker
management, reporting APIs, and the map-first dashboard are implemented. Read
[`docs/MVP.md`](docs/MVP.md) and [`docs/implementation-plan.md`](docs/implementation-plan.md)
for the staged implementation.

## Local foundation

1. Use Node.js 20.19+, 22.12+, or 24+ and run `npm ci`.
2. Copy `.env.example` to `.env.local` and replace placeholders with your own
   values. Keep `.env.local` out of Git.
   Neon `DATABASE_URL` is the pooled application connection, `DIRECT_URL` is
   the direct migration connection. Set `SEED_OWNER_EMAIL` and a password of at
   least 12 characters only when running the explicit owner seed.
3. For a **new or known development** Neon database, run `npm run db:migrate`,
    then `npm run db:seed`. The migrations create the tracker and login tables; the seed prints
   `Owner created` or `Owner already exists`. Running it again with the same
   email never changes the existing password. A different email fails. Do not
   use `prisma db push` in deployment; use `npm run db:migrate` for versioned
   migrations, then explicitly run the seed once for the intended database.
4. Set a high-entropy `AUTH_SECRET` distinct from the seed password. Run
   `npm run dev`, visit http://localhost:3000/login and sign in with the seeded
   email and password. `/` redirects signed-out visitors to `/login`. Sign-out
   is in the dashboard. Apply migrations before signing in: the login throttle
    uses its own database table. Add, edit, and delete trackers in the protected
    dashboard; confirm before rotating/revoking a device token or deleting a tracker.

Auth.js uses an app-specific `gps-locator.session-token` cookie so unrelated
localhost sessions cannot interfere. After upgrading from the default Auth.js
cookie name, sign in again; existing sessions are not migrated.

Login attempts are limited to five per normalized email in a rolling 15-minute
window, shared across server instances. A successful login clears the counter;
stale counters are removed during subsequent login attempts. Invalid credentials
and throttled requests show the same generic message.

On a disposable development database, `npm run test:db` checks the seeded
owner, verifies the Argon2id password, confirms repeat seeding and a different
email cannot change the stored account, and exercises history/snapshot retention
and tracker cascade deletion with a temporary tracker. It never prints the
email, password, or hash.

`npm ci` regenerates the ignored Prisma client via `postinstall`. After changing
`prisma/schema.prisma`, run `npm run db:generate`. The Neon adapter uses the
pooled URL for application queries; migrations use the direct URL through
`prisma.config.ts`. An optional migration dry run is `npx prisma migrate status`
against the database chosen in `.env.local`. If direct migrations/status fail
with `P1001` after Neon has gone idle, set `connect_timeout=20` on `DIRECT_URL`
as in `.env.example`; the pooled application URL is separate.

Deployment target: Vercel, backed by Neon. `vercel.json` runs the private
`GET /api/cron/retention` daily at `0 3 * * *` (UTC); set `CRON_SECRET` in Vercel
for its Bearer authorization header and check cron logs after deployment.
Set a compliant OSM-derived map tile template in
`NEXT_PUBLIC_MAP_TILE_URL` and its required public attribution HTML in
`NEXT_PUBLIC_MAP_TILE_ATTRIBUTION` before building for production; the example OSM public service is
for modest interactive development with attribution, caching and no bulk use.

## Dashboard

Search or filter your things, select a row or map marker to center its last known
position, and use **Fit all things** to see every reported tracker. The desktop
asset panel collapses without moving the map; on mobile, **Search / details**
opens an accessible Sheet. Coordinates remain readable if WebGL or tiles fail.

Latest positions refresh every 20 seconds while the tab is visible, immediately
on refocus, and after changes. Failed refreshes retain existing positions and show
a retry control plus the last successful refresh time. Interval freshness uses
the observation time; on-demand and phone-assisted reports never claim to be live.
Select **View seven-day history** for a newest-first, paginated list and a trail
of the loaded observations. Connecting those points does not imply a recorded route.

## API contract checks

[`contracts/openapi.yaml`](contracts/openapi.yaml) is the authoritative v1
request/response contract. Its generated-and-curated Postman collection contains
ordered success, duplicate-retry and invalid-coordinate assertions, with bearer
credentials and owner cookie values left blank. Set `trackerId`, `bearerToken`
and `ownerSessionCookie` only in a local Postman environment. Never commit tokens.
The owner API supports tracker CRUD, token issuance/rotation/revocation and
seven-day history; device tokens authorize only `POST /api/v1/locations`.
Copy issued tokens immediately; they are never returned from list requests.
For database lifecycle tests, set `TEST_DATABASE_URL` to a migrated, seeded
**disposable** database, then run
`node --import tsx --test tests/integration/phase3.test.ts`.

```sh
postman spec lint contracts/openapi.yaml --issueType=syntax --no-report-events
postman collection lint "postman/collections/Personal GPS locator v1"
npm test
npx prisma validate
npm run lint
npx tsc --noEmit
npm run build
```

The Postman spec lint above checks syntax locally; it does not run API behavior.
See [`ARCHITECTURE.md`](ARCHITECTURE.md) for authentication, ingestion, history,
and freshness semantics.
