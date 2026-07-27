# Dashboard

The Next.js app that renders the latency grid, and the home of the database schema, migrations, and provisioning scripts.

In production it is served under `neon.com/demos/regional-latency`.

## Development

```bash
npm install
vercel env pull .env.local --environment production
npm run dev
```

`next dev` runs without a `basePath`, so the page is at `http://localhost:3000/`.

A **production** build applies `basePath` and `assetPrefix` from `NEXT_PUBLIC_REWRITE_PREFIX`, so after:

```bash
npm run build && npm run start
```

the page is at `http://localhost:3000/demos/regional-latency`. A 404 at `/` after a production build is expected.

## Rendering

The page is statically generated with `revalidate = 900`, so it refreshes at most every 15 minutes — matching the cron interval. It queries the control plane at build and revalidation time, which means **a build fails if `DATABASE_URL` is wrong or its credentials are stale**. That is the intended behaviour: a dashboard that silently renders nothing would be worse.

Each cell is the mean latency over the **last 30 days** (`getLast30DaysAvgLatency` in `lib/db.ts`), grouped by function, database, and query type — not the latest sample. A cell is `N/A` only when there is no data in that window.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm run start` | Production build and serve |
| `npm run fmt` | Prettier |
| `npm run db:generate` | Generate a Drizzle migration from `lib/schema.ts` |
| `npm run db:push` | Apply the schema to `DATABASE_URL` |
| `npm run db:studio` | Browse the database |

### Provisioning

```bash
NEON_ORG_ID=<neon-org-id> bun scripts/setup.ts
```

Creates every `functions` row, provisions one Neon project per (region × connection method) via `neonctl`, and inserts the matching `databases` rows. Intended for standing the benchmark up from nothing — it inserts rather than reconciles, so running it against a populated control plane produces duplicates.

```bash
bun scripts/cleanup.ts
```

**Destructive.** Deletes every benchmark Neon project, every `databases` and `functions` row, and all of `stats`. This tears the whole benchmark down; it is not a maintenance tool.

## Schema

`lib/schema.ts` defines `databases`, `functions`, and `stats`. `stats` has foreign keys into the other two, so their rows must be updated in place rather than recreated — see [CONTRIBUTING.md](../CONTRIBUTING.md#never-recreate-database-rows).
