# Neon Benchmarks

The home for Neon's public latency benchmarks. Each benchmark is a tab in one app.

Live at **[neon.com/demos/regional-latency](https://neon.com/demos/regional-latency)**.

| Benchmark | What it answers | How it runs |
|---|---|---|
| **Regional latency** | How far is my database, from where my code runs? | Scheduled every 15 minutes, 30-day averages |
| **Connection methods** | Which way of talking to Postgres is fastest? | On demand, in your browser, when you click Run |

## Regional latency

Continuously measures query latency from serverless compute to Neon Postgres databases around the world, across two compute platforms: **Vercel Functions** and **Neon Functions**.

Every 15 minutes, a serverless function in each region opens a connection to a dedicated Neon database in each AWS region and times a `SELECT 1`. The results are written to a central Postgres database and rendered as a latency grid you can filter by platform.

## How it works

```
   Vercel Cron                                  Neon Function Triggers
   every 15 min                                 every 15 min, one per region
        │                                                │
        ▼                                                ▼
   ┌──────────────────────────────────┐        ┌────────────────────────────┐
   │   cron-vercel (Vercel project)   │        │  neon-function             │
   │                                  │        │  one host project per      │
   │  /api/iad1   pinned to iad1      │        │  Neon Functions region     │
   │  /api/fra1   pinned to fra1      │        │  … 4 regions total         │
   │  … 18 regions total              │        │                            │
   └───────┬──────────────────┬───────┘        └──────┬──────────────┬──────┘
           │                  │                       │              │
   read config                │  SELECT 1, timed      │              │
           │                  │  (cold, then hot)     │              │
           ▼                  ▼                       ▼              ▼
   ┌────────────────────┐   ┌────────────────────────────────────────────┐
   │   control plane    │   │   324 benchmark databases (Neon projects)  │
   │   (Neon project)   │   │                                            │
   │  databases         │   │   228 for Vercel   ·   96 for Neon         │
   │  functions         │   │   empty; exist only to be connected to     │
   │  stats  ◄──────────┼───┤                                            │
   └─────────┬──────────┘   └────────────────────────────────────────────┘
             │ write measurements
             │ read + aggregate
             ▼
   ┌────────────────────────────────────┐
   │  dashboard (Vercel project)        │
   │  Next.js, ISR, revalidate 15m      │
   │  → neon.com/demos/regional-latency │
   └────────────────────────────────────┘
```

The benchmark databases hold no data. Their only job is to accept a connection from a known region so the round trip can be timed.

## Components

| Path | What it is |
|---|---|
| [`cron-vercel/`](./cron-vercel/) | One API route per Vercel region, each pinned to that region and invoked by Vercel Cron. Performs the Vercel-side measurements. |
| [`neon-function/`](./neon-function/) | The measurement worker running on Neon Functions, plus `npm run setup`, which creates or repairs every Neon-side project, row, deployment, and trigger through `@neon/sdk`. |
| [`dashboard/`](./dashboard/) | Next.js app that renders the latency grid. Also owns the database schema, migrations, and the setup/cleanup scripts. |

## Platforms

| Platform | Regions | Compute |
|---|---|---|
| Vercel Functions | 18 | Vercel serverless, one function pinned per region |
| Neon Functions | 4 (`us-east-1`, `us-east-2`, `eu-central-1`, `ap-southeast-1`) | Node.js 24 on Neon compute, next to the database |

Neon Functions covers the regions where it is available today. Both platforms measure against the same target regions using the same methodology, so the rows are directly comparable.

## Data model

The control plane database has three tables, defined in [`dashboard/lib/schema.ts`](./dashboard/lib/schema.ts):

| Table | Rows | Purpose |
|---|---|---|
| `functions` | one per platform region | Where measurements are taken *from*. `platform` is `vercel` or `neon`. |
| `databases` | one per (function × AWS region × connection method) | Where measurements are taken *to*. Holds the connection string and Neon project id of each benchmark database. |
| `stats` | one per measurement | `date_time`, `function_id`, `database_id`, `latency_ms`, `query_type`. |

`stats` references both `functions` and `databases` by foreign key, so those rows must never be deleted or recreated while history is worth keeping. See [CONTRIBUTING.md](./CONTRIBUTING.md#never-recreate-database-rows).

### Coverage

Both platforms target the same 8 AWS regions: `us-east-1`, `us-east-2`, `us-west-2`, `ap-southeast-1`, `ap-southeast-2`, `eu-central-1`, `eu-west-2`, `sa-east-1`.

- **Vercel Functions** — each region measures 12 benchmark databases: all 8 over HTTP, plus `us-east-1` and `us-west-2` over WebSocket and TCP.
- **Neon Functions** — each region measures 24 benchmark databases: all 8 over HTTP, WebSocket, and TCP.

Each measurement is taken twice in a row: **cold** (the first query, which may include a compute cold start, since Neon computes suspend when idle) and **hot** (immediately after, on the warm connection).

The grid does not show the most recent measurement. It shows the **mean over the last 30 days**, grouped by function, database, and query type, so a single slow sample does not move a cell. A cell reads `N/A` when there are no measurements in that window at all — which usually means the function is not running, not that latency is unmeasurable.

## Connection methods

An interactive benchmark comparing four ways of running the *same* query against the *same* Neon database, all within `us-east-1`:

| Method | Path |
|---|---|
| Data API (browser) | Browser → Data API, with a Neon Auth JWT. No server hop. |
| Data API (server) | Route handler → Data API, reusing a cached JWT. |
| Serverless driver + Drizzle | Route handler → `@neondatabase/serverless` over HTTP. |
| node-postgres + Drizzle | Route handler → `pg.Pool` over direct TCP, kept warm with `attachDatabasePool`. |

You choose the sample count and how many queries each sample issues back to back — the waterfall setting, which shows how per-round-trip overhead compounds. Results are reported as end-to-end time (what the browser sees) or server-only time (what the route handler spends), with a chart per sample and avg/median/p95 summary.

Each sample runs every method concurrently so they see the same database conditions, and a warm-up round runs first so sign-in and cold starts don't distort the first result.

Unlike the regional benchmark, nothing here is stored — it measures live, from wherever you are, and the numbers depend on your own connection.

## Infrastructure

- **Neon** — all benchmark projects and the control plane live in one dedicated Neon organization, kept separate from other work so their cost and blast radius are isolated.
- **Vercel** — two projects in the same team: `cron-vercel` (the measurement functions) and `latency-benchmarks-dashboard` (the UI).
- The dashboard sets `basePath` and `assetPrefix` from `NEXT_PUBLIC_REWRITE_PREFIX` so it can be served under `neon.com/demos/regional-latency` rather than at a domain root.

## Getting started

See **[CONTRIBUTING.md](./CONTRIBUTING.md)** for local development, environment variables, how to add a region, deployment, and how to verify a deploy actually worked.

If you are an AI coding agent, read **[AGENTS.md](./AGENTS.md)** first — it documents the failure modes in this repo that are easy to miss and expensive to get wrong.

## Known gaps

- **`me-south-1` / `dxb1` is stale.** The `functions` table still has a row for Dubai, but the route was removed and Vercel no longer runs it. Its 12 `databases` rows will never receive measurements and show as permanent `N/A` under "All Function Regions".
- **Cost scales with regions.** Each of the 18 Vercel regions wakes its 12 benchmark computes every 15 minutes, and each of the 4 Neon Functions regions wakes its 24. Adding a region adds real, recurring compute spend.

## License

[Apache-2.0](./LICENSE)
