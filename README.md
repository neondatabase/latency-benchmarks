# Neon Latency Benchmarks

Continuously measures query latency from Vercel serverless regions to Neon Postgres databases around the world.

Live at **[neon.com/demos/regional-latency](https://neon.com/demos/regional-latency)**.

Every 15 minutes, a serverless function in each Vercel region opens a connection to a dedicated Neon database in each AWS region and times a `SELECT 1`. The results are written to a central Postgres database and rendered as a latency grid.

## How it works

```
                    ┌──────────────────────────────────┐
                    │   cron-vercel (Vercel project)   │
                    │                                  │
   Vercel Cron ───► │  /api/iad1   pinned to iad1      │
   every 15 min     │  /api/fra1   pinned to fra1      │
                    │  /api/sin1   pinned to sin1      │
                    │  … 18 regions total              │
                    └───────┬──────────────────┬───────┘
                            │                  │
             1. read config │                  │ 2. SELECT 1, timed
                            │                  │    (cold, then hot)
                            ▼                  ▼
                 ┌────────────────────┐   ┌──────────────────────┐
                 │   control plane    │   │  228 benchmark DBs   │
                 │   (Neon project)   │   │  (Neon projects)     │
                 │                    │   │                      │
                 │  databases         │   │  empty; exist only   │
                 │  functions         │   │  to be connected to  │
                 │  stats  ◄──────────┼───┤                      │
                 └─────────┬──────────┘   └──────────────────────┘
                           │ 3. write measurements
                           │
                           │ 4. read + aggregate
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
| [`cron-vercel/`](./cron-vercel/) | One API route per Vercel region, each pinned to that region and invoked by Vercel Cron. Performs the measurements. |
| [`dashboard/`](./dashboard/) | Next.js app that renders the latency grid. Also owns the database schema, migrations, and the setup/cleanup scripts. |

## Data model

The control plane database has three tables, defined in [`dashboard/lib/schema.ts`](./dashboard/lib/schema.ts):

| Table | Rows | Purpose |
|---|---|---|
| `functions` | one per Vercel region | Where measurements are taken *from*. |
| `databases` | one per (function × AWS region × connection method) | Where measurements are taken *to*. Holds the connection string and Neon project id of each benchmark database. |
| `stats` | one per measurement | `date_time`, `function_id`, `database_id`, `latency_ms`, `query_type`. |

`stats` references both `functions` and `databases` by foreign key, so those rows must never be deleted or recreated while history is worth keeping. See [CONTRIBUTING.md](./CONTRIBUTING.md#never-recreate-database-rows).

### Coverage

Each Vercel region measures against 12 benchmark databases:

- **8 AWS regions over HTTP** — `us-east-1`, `us-east-2`, `us-west-2`, `ap-southeast-1`, `ap-southeast-2`, `eu-central-1`, `eu-west-2`, `sa-east-1`
- **`us-east-1` and `us-west-2` additionally over WebSocket and TCP**, to compare the three connection methods against the same target

Each measurement is taken twice in a row: **cold** (the first query, which may include a compute cold start, since Neon computes suspend when idle) and **hot** (immediately after, on the warm connection).

The grid does not show the most recent measurement. It shows the **mean over the last 30 days**, grouped by function, database, and query type, so a single slow sample does not move a cell. A cell reads `N/A` when there are no measurements in that window at all — which usually means the function is not running, not that latency is unmeasurable.

## Infrastructure

- **Neon** — all benchmark projects and the control plane live in one dedicated Neon organization, kept separate from other work so their cost and blast radius are isolated.
- **Vercel** — two projects in the same team: `cron-vercel` (the measurement functions) and `latency-benchmarks-dashboard` (the UI).
- The dashboard sets `basePath` and `assetPrefix` from `NEXT_PUBLIC_REWRITE_PREFIX` so it can be served under `neon.com/demos/regional-latency` rather than at a domain root.

## Getting started

See **[CONTRIBUTING.md](./CONTRIBUTING.md)** for local development, environment variables, how to add a region, deployment, and how to verify a deploy actually worked.

If you are an AI coding agent, read **[AGENTS.md](./AGENTS.md)** first — it documents the failure modes in this repo that are easy to miss and expensive to get wrong.

## Known gaps

- **`me-south-1` / `dxb1` is stale.** The `functions` table still has a row for Dubai, but the route was removed and Vercel no longer runs it. Its 12 `databases` rows will never receive measurements and show as permanent `N/A` under "All Function Regions".
- **Cost scales with regions.** Each of the 18 regions wakes its 12 benchmark computes every 15 minutes. Adding a region adds real, recurring compute spend.

## License

[Apache-2.0](./LICENSE)
