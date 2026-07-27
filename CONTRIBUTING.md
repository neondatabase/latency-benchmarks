# Contributing

Read [README.md](./README.md) first for what this project is and how the pieces fit together.

## Prerequisites

- **Node.js 22** — both Vercel projects run on 22.x
- **npm** — both packages use `package-lock.json`; do not switch package managers
- **Bun** — only for running the one-off scripts in `dashboard/scripts/`
- **[Neon CLI](https://neon.com/docs/reference/neon-cli)** (`neonctl`) — the setup script shells out to it
- **[Vercel CLI](https://vercel.com/docs/cli)** — for deploying and pulling environment variables

## Repository layout

```
dashboard/          Next.js UI + schema + migrations + setup/cleanup scripts
  app/              single page, statically rendered with ISR
  lib/schema.ts     Drizzle schema (databases, functions, stats)
  lib/vercel.ts     Vercel region code <-> AWS region code mapping
  migrations/       Drizzle migrations
  scripts/setup.ts  provisions functions, benchmark projects, and database rows
  scripts/cleanup.ts DESTRUCTIVE - deletes every benchmark project and all history

cron-vercel/        Vercel-platform measurement functions
  app/api/<region>/ one route per Vercel region
  app/api/neonfn/   trigger only - forwards a cron tick to the Neon Function
  lib/meta-db.ts    reads config from, and writes measurements to, the control plane
  lib/bench-db.ts   opens a connection to a benchmark database and times SELECT 1
  lib/measure.ts    shared request handler with the region guard
  vercel.json       per-route region pinning + cron schedules
  scripts/verify-regions.mjs  asserts the build matches vercel.json (runs in CI)

neon-function/      Neon-platform measurement worker
  src/index.ts      the function handler
  src/regions.ts    target regions and project naming
  scripts/provision.ts  creates its benchmark projects and database rows
  scripts/deploy.ts     bundles and deploys via @neon/sdk
```

## Environment variables

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | dashboard, cron-vercel | Pooled connection string for the **control plane** database, not a benchmark database. |
| `NEXT_PUBLIC_REWRITE_PREFIX` | dashboard | Sets `basePath` and `assetPrefix` in production. Currently `/demos/regional-latency`. |
| `CRON_SECRET` | cron-vercel | Vercel Cron sends this as `Authorization: Bearer …`. Requests without it get a 401. |
| `NEON_ORG_ID` | provisioning scripts | The Neon organization new benchmark projects are created in. |
| `VERCEL_REGION` | cron-vercel | Injected by Vercel. Each route asserts this matches its own name. |
| `NEON_FUNCTION_URL` | cron-vercel | Invocation URL of the deployed Neon Function, called by `/api/neonfn`. |
| `CONTROL_PLANE_URL` | neon-function | Control plane connection string. Deliberately **not** `DATABASE_URL`, which Neon injects automatically and points at the function's own host branch. |
| `FUNCTION_SECRET` | neon-function | Shared secret for invoking the function. Set to the same value as `CRON_SECRET` so the trigger route can forward it. |
| `NEON_API_KEY` | provisioning and deploy scripts | A personal Neon API key. |
| `BENCH_DATABASE_URL` | dashboard | Pooled connection to the **connection-method benchmark** database. A different Neon project from the control plane — see below. |
| `BENCH_DATABASE_URL_UNPOOLED` | dashboard | Direct TCP connection to the same database, used by the `pg.Pool` method. |
| `BENCH_NEON_AUTH_URL`, `BENCH_NEON_AUTH_EMAIL`, `BENCH_NEON_AUTH_PASSWORD` | dashboard | Neon Auth credentials the server exchanges for a Data API JWT. |
| `BENCH_NEON_DATA_API_URL` | dashboard | Data API endpoint for the benchmark database. |
| `NEXT_PUBLIC_BENCH_*` | dashboard (browser) | The same four Neon Auth / Data API values, exposed to the browser so it can query the Data API directly. |

> **Two databases.** `DATABASE_URL` is the *control plane* that stores regional latency measurements. `BENCH_DATABASE_URL` is the *benchmark target* the connection-method page queries. They are different Neon projects and must not be swapped.
>
> The `NEXT_PUBLIC_BENCH_*` credentials are visible to anyone loading the page. That is deliberate: they belong to a read-only demo account holding 100 rows of synthetic data.

Pull the real values rather than inventing them:

```bash
cd dashboard && vercel env pull .env.local --environment production
```

> `API_SECRET` is currently set on the `cron-vercel` Vercel project but is not referenced anywhere in the code. It can be removed.

## Local development

### Dashboard

```bash
cd dashboard
npm install
vercel env pull .env.local --environment production   # or point DATABASE_URL at your own control plane
npm run dev
```

`next dev` runs without a `basePath`, so the page is at `http://localhost:3000/`. A production build applies `NEXT_PUBLIC_REWRITE_PREFIX`, so after `npm run build && npm run start` it lives at `http://localhost:3000/demos/regional-latency`. Getting a 404 at `/` after a production build is expected, not a bug.

### Cron

The routes refuse to run outside Vercel — they require `VERCEL_REGION` to be set and to match the route name — so they cannot be exercised end to end locally. Test the pieces instead by importing `lib/meta-db.ts` and `lib/bench-db.ts` directly.

### Never write test measurements to production

`stats` is the published dataset. A latency measured from a laptop is meaningless and there is no flag distinguishing it from real data. If you need to verify the write path, do it in a transaction you roll back:

```ts
await client.query("BEGIN");
// ... insert ...
await client.query("ROLLBACK");
```

## Database changes

The schema lives in `dashboard/lib/schema.ts` and is managed with Drizzle:

```bash
cd dashboard
npm run db:generate   # generate a migration from schema changes
npm run db:push       # apply to the database in DATABASE_URL
npm run db:studio     # browse
```

### Never recreate database rows

`stats` has foreign keys into both. Deleting a row means deleting its measurements, and inserting a replacement row orphans the history from the UI even if the old rows survive.

When a benchmark database moves or is replaced, **update the existing row in place** — keep `id`, change `connection_url` and `neon_project_id`. `scripts/cleanup.ts` deletes everything including all history; it is for tearing the whole benchmark down, not for maintenance.

## Adding a Vercel region

1. Create `cron-vercel/app/api/<region>/route.ts`:

   ```ts
   import { handleRegionBenchmarkRequest } from "@/lib/measure";

   export const dynamic = "force-dynamic";
   export const maxDuration = 600;

   export async function GET(request: Request) {
     return handleRegionBenchmarkRequest(request, "<region>");
   }
   ```

2. Add the region to `vercelRegionMap` in **both** `cron-vercel/lib/vercel.ts` and `dashboard/lib/vercel.ts`.
3. Add a `functions` entry and a `crons` entry in `cron-vercel/vercel.json`. **Both are required** — a missing `functions` entry means the route runs in the project's default region and fails its own guard; a missing `crons` entry means it never runs at all.
4. Insert a `functions` row and its `databases` rows, creating one Neon project per target region and connection method.

Removing a region is the reverse, but leave the `functions` row alone unless you also intend to delete its history.

`scripts/verify-regions.mjs` catches all three mistakes — a wrong region, a `functions` entry whose path does not match any built route, and a route with a region but no cron. Run it after `vercel build`; CI runs it before every deploy.

## Working on the Neon Functions platform

Everything for this platform lives in `neon-function/`. See its [README](./neon-function/README.md) for the full workflow. In short:

```bash
cd neon-function
NEON_API_KEY=… NEON_ORG_ID=… CONTROL_PLANE_URL=… npm run provision
NEON_API_KEY=… NEON_FUNCTION_PROJECT_ID=… NEON_FUNCTION_BRANCH_ID=… \
  CONTROL_PLANE_URL=… FUNCTION_SECRET=… npm run deploy
```

`provision` is idempotent: it reuses projects by name and upserts database rows, so an interrupted run can be repeated.

## Adding a benchmark

The app is a set of benchmarks behind a shared tab bar. To add one:

1. Create `dashboard/app/<slug>/page.tsx` and render `<BenchNav title="…" />` at the top.
2. Add `{ href: "/<slug>", label: "…" }` to `BENCHES` in `dashboard/components/bench-nav.tsx`. That is the only place the tab list lives.
3. Put server work in route handlers under `dashboard/app/api/…` and keep any long-lived clients at module scope so warm functions reuse them.

The regional benchmark reads pre-aggregated history at build time; the connection-method benchmark measures live in the browser. Both shapes are fine — pick whichever matches the question the benchmark answers.

### Adding a platform

The dashboard derives everything from the `platform` column on `functions`, so a new platform needs:

1. a value added to the `platform` enum in `dashboard/lib/schema.ts`, plus a generated migration
2. a label in `PLATFORM_LABELS` and an entry in `PLATFORM_ORDER` in `dashboard/components/latency-table.tsx`
3. `functions` and `databases` rows, and something that invokes the measurement on a schedule

The platform filter, the per-platform table sections, and the counts in the card description all follow from those.

## Deployment

Both projects deploy independently.

**Cron** — pushes to `main` that touch `cron-vercel/**` trigger `.github/workflows/region-deploy.yml`, which builds, fails the run if any route is pinned to the wrong region, and deploys. It can also be run from the Actions tab via `workflow_dispatch`.

The workflow needs the `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` repository secrets. If it does not fire or the secrets are missing, deploy by hand — the result is identical, since the regions come from `vercel.json` either way:

```bash
cd cron-vercel
vercel deploy --prod
```

Either way, verify placement afterwards rather than trusting a green deploy.

**Dashboard** — deploys from `main` through Vercel's Git integration.

Environment variable changes do not reach running functions until the project is redeployed.

## Verifying a cron deploy

A deploy that looks successful can still be silently wrong, because a route running in the wrong region fails only at runtime. Check placement directly.

An unauthenticated request is rejected inside the handler before it touches a database, so it is a free way to see where a function actually ran — `x-vercel-id` names the execution region:

```bash
for r in arn1 bom1 cdg1 cle1 cpt1 dub1 fra1 gru1 hkg1 hnd1 iad1 icn1 kix1 lhr1 pdx1 sfo1 sin1 syd1; do
  vid=$(curl -s -D - -o /dev/null "https://cron-vercel-neondatabase.vercel.app/api/$r" \
        | grep -i '^x-vercel-id:' | tr -d '\r' | sed 's/.*: //')
  region=$(echo "$vid" | tr ':' '\n' | grep -E '^[a-z]{3}[0-9]$' | tail -1)
  [ "$region" = "$r" ] && echo "ok  $r" || echo "BAD $r ran in $region"
done
```

Then confirm measurements are actually landing, one row per database per query type:

```sql
SELECT f.region_label, count(*)
FROM stats s JOIN functions f ON f.id = s.function_id
WHERE s.date_time > now() - interval '20 minutes'
GROUP BY 1 ORDER BY 1;
```

Crons run at `:17`, `:32`, and `:47`. They do not run on preview deployments.

## Lockfile hygiene

**Check that no lockfile entry points at a private registry before committing.**

Both `package-lock.json` files must reference `registry.npmjs.org` and nothing else. npm rewrites a `resolved` host back to your configured registry only when it already points at `registry.npmjs.org` — any other host is written verbatim. So installing behind a corporate proxy or private mirror silently bakes an internal hostname into the lockfile.

This fails invisibly: local installs keep working, and only CI and Vercel builds break, with an eight-minute hang followed by `ETIMEDOUT`. It has broken production here before.

```bash
grep -o '"resolved": "https://[^/]*' */package-lock.json | sort -u
# every line must be registry.npmjs.org
```

To fix, rewrite the hosts. Integrity hashes are content hashes of the tarball and stay valid:

```bash
perl -pi -e 's{https://your-proxy\.example\.com/}{https://registry.npmjs.org/}g' */package-lock.json
```

## Style

Prettier is available in the dashboard (`npm run fmt`). Match the surrounding code; there is no enforced linter beyond the TypeScript compiler, which runs as part of `next build`.
