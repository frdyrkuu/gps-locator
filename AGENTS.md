<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project: personal GPS tracker

This repository is a private, map-first tracker for the owner's belongings. Start with
[`docs/MVP.md`](docs/MVP.md), then consult [`ARCHITECTURE.md`](ARCHITECTURE.md),
[`DESIGNS.md`](DESIGNS.md), and [`implementation-plan.md`](docs/implementation-plan.md)
for scope, data flows, UI behavior, and delivery order. The current app is a starter;
these documents describe intended behavior, not features already implemented.

### Implementation conventions

- Use the Next.js App Router and TypeScript. Before implementing a Next.js feature,
  read the corresponding guide under `node_modules/next/dist/docs/`; in Next.js 16,
  `proxy.ts` replaces `middleware.ts`, and Proxy is not the sole authorization layer.
- Use Tailwind CSS for application styling, with design tokens in CSS. Do not use
  JSX `style` props or inline CSS. Import required map-library CSS separately.
- Use shadcn/ui components for controls, Dialog/AlertDialog for confirmations,
  Sheet for mobile panels, and its Sonner integration for toast notifications.
  Validate forms and API input on the server; client validation is supplemental.
- Protect every owner-facing page, Route Handler, and data access operation with
  Auth.js/NextAuth session checks and owner-scoped queries. There is no public
  signup. Authenticate device submissions using per-device credentials, never
  the owner's session or seed password.
- Keep secrets server-side and out of source control, logs, and responses. Seed
  only the owner from environment variables, hash passwords and device tokens,
  and make the seed idempotent without resetting an existing password.
- Store timestamps in UTC; expose observed time and freshness rather than
  claiming that a tracker is live when it has stopped reporting. Shortcuts do
  not provide a guaranteed background feed or an independent Apple Watch fix.
- Map rendering uses open-source tooling and OpenStreetMap-derived tiles. Keep
  attribution visible, respect the chosen provider's usage policy, and allow
  switching tile providers without redesigning the dashboard.
- Keep the ingest endpoint's request/response contract and examples in
  `ARCHITECTURE.md` current whenever changing its behavior. Add tests for auth,
  ownership, validation, deduplication, and freshness logic; run lint, typecheck,
  build, and applicable tests before considering a feature complete.

Do not replace or remove the Next.js-generated block at the top of this file.
