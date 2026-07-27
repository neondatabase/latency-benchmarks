# Agent instructions

Read [README.md](./README.md) for the architecture and [CONTRIBUTING.md](./CONTRIBUTING.md) for workflows. This file covers what is easy to get wrong here and expensive to get wrong.

## What you are touching

This repository backs a **public dashboard on neon.com** and a **live measurement pipeline**. There is no staging environment. The control plane database holds ~2.5 million measurements accumulated since early 2026 that cannot be regenerated.

Treat every database write, every Neon project deletion, and every environment variable change as production.

## Hard rules

1. **Never delete or recreate rows in `databases` or `functions`.** `stats` has foreign keys into both. Update rows in place. A benchmark database that moved needs its `connection_url` and `neon_project_id` changed, not a new row.
2. **Never write measurements to `stats` from a local machine.** A latency measured from a laptop is indistinguishable from a real one in the published dataset. Verify write paths inside a transaction you roll back.
3. **Never run `dashboard/scripts/cleanup.ts` unless you intend to destroy the entire benchmark.** It deletes every Neon benchmark project and every measurement.
4. **Do not switch package managers.** Both packages use npm and `package-lock.json`.
5. **Confirm before deleting any Neon project.** Cross-check against `SELECT neon_project_id FROM databases` first. Neon keeps deleted projects recoverable only for a limited grace period.

## Failure modes that have actually happened

### Lockfile poisoned with a private registry host

Production was broken for 172 days by this. A dependency bump was installed behind a corporate npm proxy, so npm wrote that internal hostname into `package-lock.json` as the `resolved` URL for the new packages. Vercel's builders cannot route to it, so `npm install` hung for eight minutes and failed with `ETIMEDOUT`.

It fails invisibly — local installs keep working because your machine can reach the proxy. Only remote builds break.

**Always check before committing a lockfile change:**

```bash
grep -o '"resolved": "https://[^/]*' */package-lock.json | sort -u   # must be registry.npmjs.org only
```

The CI region-deploy workflow was broken by the same commit, which is why the fix never reached production on its own.

### Functions silently running in the wrong region

Every cron route executed in `iad1` regardless of its name, so 17 of 18 routes failed their own runtime region guard and returned 500. The dashboard showed an almost entirely `N/A` grid, which looks like missing data rather than a deploy bug.

Regions come from the `functions` property in `cron-vercel/vercel.json`. A route needs **both** a `functions` entry (or it runs in the default region) and a `crons` entry (or it never runs).

Never assume a deploy applied them. Verify placement using `x-vercel-id` — see [CONTRIBUTING.md](./CONTRIBUTING.md#verifying-a-cron-deploy). The deploy workflow also fails the build if any route is mispinned.

### Environment variables silently stale

`DATABASE_URL` exists on **two** Vercel projects, `latency-benchmarks-dashboard` and `cron-vercel`. They must point at the same control plane. Updating one and not the other splits reads from writes, and nothing errors — the dashboard just stops showing new data.

Environment changes do not take effect until the project is redeployed.

Also note the Vercel CLI defaults new Production and Preview variables to *sensitive*, which makes them unreadable via `vercel env pull` afterwards. Pass `--no-sensitive` when replacing an existing readable variable, or you will quietly change its behaviour for everyone else.

### `neonctl api` swallowing HTTP errors

`neonctl api <path> --method POST --data '…'` can print nothing and exit 0 while the request actually failed. A project transfer that returned `406` looked exactly like success.

**After any state-changing Neon API call, read the state back and assert it changed.** When you need the status code, use `curl` with `-w "%{http_code}"` and a personal API key.

### Two platforms, one schema

`functions.platform` distinguishes `vercel` from `neon`. The dashboard groups and filters entirely on that column, so a new platform must exist in the Postgres enum *and* in `PLATFORM_LABELS` / `PLATFORM_ORDER` in `latency-table.tsx`. A platform present in the database but missing from those constants silently disappears from the UI: `availablePlatforms` is derived from `PLATFORM_ORDER`, not from the data.

Adding an enum value needs a migration — `ALTER TYPE ... ADD VALUE` — and cannot be done by editing the schema file alone.

The Neon Function reads `CONTROL_PLANE_URL`, not `DATABASE_URL`. Neon injects `DATABASE_URL` automatically, pointing at the function's own host branch, which is empty. Using it would connect successfully to the wrong database.

### Two databases, easy to confuse

`DATABASE_URL` is the **control plane** holding 2.5M regional latency measurements. `BENCH_DATABASE_URL` is the **connection-method benchmark target**, a separate Neon project with 100 rows of synthetic `employees` data.

They are unrelated projects. Pointing one at the other will connect successfully and behave wrongly: the regional dashboard would render empty, or the connection benchmark would start querying production measurement history.

Neon Auth issues ~15 minute JWTs. The server caches and refreshes them; if you remove that cache, every sample measures a sign-in round trip instead of a query, and the Data API method looks ~15x slower than it is. Server-side sign-in also requires an `Origin` header — Better Auth rejects requests without one.

## Verification standard

Compilation and type checks prove nothing here. Before claiming something works:

- **Schema or data change** — compare row counts *and* checksums against the source, not just counts.
- **Cron change** — confirm the route runs in its own region, then confirm rows actually land in `stats` for that function.
- **Dashboard change** — build it, serve it, and load the real page. Remember a production build serves under `/demos/regional-latency`, not `/`.
- **Deploy** — check the deployment reached `Ready` *and* exercise the deployed thing. Preview deployments are SSO-gated and do not run crons.

## Cost awareness

Each of the 18 regions wakes its 12 benchmark computes every 15 minutes, and each compute is pinned at 1 CU. Fixing the region bug increased compute roughly 18x. Anything that adds regions, adds target databases, or shortens the cron interval multiplies recurring spend — call it out before doing it.

## Things that look broken but are not

- **A production build 404s at `/`.** `basePath` is set from `NEXT_PUBLIC_REWRITE_PREFIX`; the page is at `/demos/regional-latency`.
- **`suspend_timeout_seconds: 0`** on a Neon endpoint means *use the default* (5 minutes), not *never suspend*. Benchmark computes are supposed to suspend — that is what makes the "cold" measurement meaningful.
- **The `me-south-1` / `dxb1` function row has no route.** It is stale and will always show `N/A`. Do not add a route to "fix" it without checking whether Vercel still offers the region.
