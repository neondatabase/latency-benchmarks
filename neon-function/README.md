# Neon Function

The measurement worker that runs on **Neon Functions**, Neon's serverless compute, so the benchmark can compare Neon compute against Vercel compute using the same method and the same targets.

It is one function on Node.js 24, deployed to a branch of a dedicated Neon project. On each invocation it reads its configuration from the control plane, times a `SELECT 1` against each of its benchmark databases twice (cold, then hot), and writes the results back to `stats`.

## Why the platform is a single region

Neon Functions are only offered in `aws-us-east-2` during beta, and a function runs in the region of the project hosting it. So this platform contributes exactly one function region, against the same eight target regions the Vercel platform measures.

Adding a region later is a one-line change in `src/regions.ts` plus a re-run of `provision.ts`.

## Scheduling

Neon Functions have no scheduler. The Vercel cron project drives this one on the same 15-minute cadence through `cron-vercel/app/api/neonfn`, which does nothing but forward an authenticated request. The measurement itself happens entirely on Neon compute.

## Connection handling

Two deliberately different strategies:

- **Control plane** — a long-lived `pg` `Pool` at module scope, as the Functions runtime recommends. The runtime persists across requests, so reconnecting per invocation would waste it.
- **Benchmark targets** — a fresh client per measurement, torn down afterwards. Reusing a warm connection here would measure the runtime's pooling rather than the round trip, and would not be comparable to the Vercel numbers.

## Environment

| Variable | Purpose |
|---|---|
| `CONTROL_PLANE_URL` | Pooled connection string for the control plane. **Not** `DATABASE_URL`, which Neon injects automatically and which points at this function's own host branch. |
| `FUNCTION_SECRET` | Shared secret. Requests without a matching `Authorization: Bearer` get a 401 before any database work. |

Both are set on the deployment by `scripts/deploy.ts`.

## Scripts

Both take the same env as above plus `NEON_API_KEY`.

```bash
# Create the benchmark projects and register them in the control plane.
# Idempotent: existing projects are reused and database rows are upserted.
NEON_ORG_ID=<org> CONTROL_PLANE_URL=<url> npm run provision

# Bundle with esbuild and deploy, then poll until live.
NEON_FUNCTION_PROJECT_ID=<project> NEON_FUNCTION_BRANCH_ID=<branch> \
  CONTROL_PLANE_URL=<url> FUNCTION_SECRET=<secret> npm run deploy
```

Both use [`@neon/sdk`](https://neon.com/docs/reference/typescript-sdk); `deploy` also uses `buildFunctionBundle` from `@neon/config-runtime`, which produces exactly the archive the deploy endpoint expects.

`provision.ts` is the Neon-platform counterpart to `dashboard/scripts/setup.ts`, with one important difference: it **upserts** rather than inserts, so re-running it after an interrupted run repairs the state instead of duplicating it.

## Invoking by hand

```bash
neon functions get latencybench --project-id <project> --branch <branch>
curl -H "authorization: Bearer $FUNCTION_SECRET" "<invocation_url>"
```

A successful run returns the number of databases measured and an empty `failures` array. Partial failures return `207` so a single unreachable target does not mask the rest of the run.
