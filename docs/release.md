# Verification and release

## Repeatable local checks

```sh
npm ci
npm run check
postman spec lint contracts/openapi.yaml --issueType=syntax --no-report-events
postman collection lint "postman/collections/Personal GPS locator v1"
npx prisma validate
npx prisma migrate status
npm audit --omit=dev
npx playwright install chromium
npm run test:e2e
```

`check` runs lint, typecheck, unit tests, production build, and a scan for configured
server secret literals in client assets. The scan does not check absent environment
values or replace deployment configuration review. Git tracks only `.env.example`.

The browser/HTTP suite starts the production build at `http://localhost:3100`,
using `.env.local`. Keep this port free. It needs a migrated, seeded database and
`AUTH_SECRET`; the valid-login test also needs the existing owner's correct
`SEED_OWNER_EMAIL`/`SEED_OWNER_PASSWORD`. Other owner tests use short-lived signed
test sessions. The test server trusts its fixed local host explicitly.

If `TEST_DATABASE_URL` is set, the E2E server uses it instead of `DATABASE_URL`.
Otherwise it uses the configured application database: it creates uniquely named
temporary trackers and deletes only those fixtures. It never successfully invokes
global retention. Do not interrupt a run if you want fixture cleanup to finish.
The rate-limit test creates and removes only its own credential's counter.

On Windows with Microsoft Edge already installed, browser installation can be skipped:

```powershell
$env:PLAYWRIGHT_CHANNEL = "msedge"
npm run test:e2e
```

Browser tests use local placeholder tiles to avoid repeated requests to the public
OSM service. They verify the real bundled worker, map dimensions and hit-testable
controls/markers, not the availability of an external provider. Test results are
ignored; traces, screenshots, and videos are off. Keep failure reports local because
page snapshots can contain private information.

### Destructive database checks

Create a **separate disposable Neon database/branch**, apply migrations using its
direct URL, and seed its owner explicitly. Set `TEST_DATABASE_URL` to its pooled
URL in your ignored local environment, then run:

```sh
npm run test:db
```

Both integration tests skip if that setting is absent and reject the configured
application database (including its pooled/direct hostname variants). They verify
seed idempotency, throttling, ownership, token rotation/revocation, deduplication,
delayed reports, history pagination, retention and cascade deletion. Retention
deletes all expired history in the selected test database, hence the isolation.
Do not count a skipped run as a pass.

## Deployment

1. Configure Vercel server secrets: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`,
   and `CRON_SECRET`. Use a new high-entropy value for each secret. Seed variables
   are only needed for the explicit owner-seed command; never reset an existing
   owner's password during deploy.
2. Choose a policy-compliant OSM-derived **raster XYZ** tile provider. Set public
   `NEXT_PUBLIC_MAP_TILE_URL` and its required `NEXT_PUBLIC_MAP_TILE_ATTRIBUTION`
   before building. Public OSM tiles are development defaults, not a production
   availability guarantee. Provider keys used here must be browser-public keys.
3. Apply `npm run db:migrate` to the intended deployment database, then check
   `npx prisma migrate status`. For a new database, explicitly seed the owner once.
4. Build/deploy. Vercel sets Auth.js host trust automatically; self-hosted production
   needs `AUTH_TRUST_HOST=true` only behind a reverse proxy you control and trust.
5. Confirm HTTPS works and `/` redirects signed-out visitors to `/login`. Sign in,
   check the map/attribution on desktop and mobile, and complete the device smoke
   test in [device setup](device-setup.md).
6. Rotate the temporary device's token, confirm the old one returns `401`, inspect
   its seven-day history, then delete it. Check that no token is present in list
   responses, URLs, application logs, or committed files.
7. Confirm `vercel.json` schedules `/api/cron/retention` at **03:00 UTC daily**.
   Vercel sends `Authorization: Bearer <CRON_SECRET>` automatically. Check the actual
   invocation result in Vercel logs after deployment. Cron is best-effort, without
   automatic retries; a configured schedule alone does not prove it ran.

## Evidence and remaining release gates

Phase 5 adds production-mode browser/HTTP checks for anonymous access, missing
owners/non-owned IDs, device binding, token lifecycle, origin checks, validation,
idempotency, observation ordering, history limits, rate limiting, sign-in/out,
tracker forms, keyboard selection, mobile Sheet, phone-assisted labels, refresh
recovery, visible-tab polling, tile failure and no-WebGL fallback. Map regression
checks include the worker asset and nonzero container dimensions.

The malformed non-ASCII cron credential test exposed a byte-length mismatch in
constant-time comparison; the handler now rejects it with `401` instead of `500`.

Local evidence for this implementation: **14 unit tests, all 12 production-mode
HTTP/browser tests (headless Microsoft Edge), and the five-value client secret
scan pass**. Lint, typecheck, production build, Prisma validation, OpenAPI syntax
and collection lint pass; the configured Neon database has both migrations applied.
The production dependency audit reports zero vulnerabilities. Both destructive
database tests were skipped because `TEST_DATABASE_URL` was not configured.

Release is still gated on an actual deployed smoke test, successful disposable-DB
tests, production tile-provider selection, cron invocation evidence, and actual
hardware submissions. An ESP32-shaped HTTP test proves the server contract, not
GPS reception, modem connectivity, device time, power stability or TLS on hardware.
The owner reported a successful real iPhone Shortcut fix during development;
repeat that test against the final deployed URL.
