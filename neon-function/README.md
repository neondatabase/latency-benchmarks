# Neon Function

The measurement worker that runs on **Neon Functions**, Neon's serverless compute, so the benchmark can compare Neon compute against Vercel compute using the same method and the same targets.

It is one function on Node.js 24, deployed once per Neon Functions region, each to the default branch of its own host project (a function runs in the region of the project hosting it). On each invocation it reads its configuration from the control plane, times a `SELECT 1` against each of its 24 benchmark databases twice (cold, then hot), and writes the results back to `stats`.

## Coverage

[`src/regions.ts`](./src/regions.ts) is the single source for what gets measured:

- `NEON_FUNCTION_REGIONS`: where the function runs: `us-east-1`, `us-east-2`, `eu-central-1`, `ap-southeast-1`
- `AWS_REGIONS`: the 8 target regions, the same set the Vercel platform measures
- `CONNECTION_METHODS`: `http`, `ws`, `tcp`, all three for every target

Every function region gets one benchmark project per target region and connection method: 4 × 8 × 3 = 96 projects.

## Scheduling

Each deployment has a Neon Function Trigger named `benchmark` on cron `17-59/15 * * * *`, the same minutes the Vercel crons use. Trigger deliveries are authenticated by the `x-neon-trigger-invocation-id` header, which the Functions proxy strips from client requests. Manual runs authenticate with `Authorization: Bearer $FUNCTION_SECRET`.

## Connection handling

Two deliberately different strategies:

- **Control plane** — a long-lived `pg` `Pool` at module scope, as the Functions runtime recommends. The runtime persists across requests, so reconnecting per invocation would waste it.
- **Benchmark targets** — a fresh client per measurement, torn down afterwards. Reusing a warm connection here would measure the runtime's pooling rather than the round trip, and would not be comparable to the Vercel numbers.

## Environment

Set on each deployment by `scripts/setup.ts`:

| Variable | Purpose |
|---|---|
| `CONTROL_PLANE_URL` | Pooled connection string for the control plane. **Not** `DATABASE_URL`, which Neon injects automatically and which points at this function's own host branch. |
| `FUNCTION_SECRET` | Shared secret for manual runs. Requests with neither a trigger header nor a matching `Authorization: Bearer` get a 401 before any database work. |
| `FUNCTION_REGION` | The region this deployment runs in. Selects its `functions` row. |

## Setup

One idempotent script creates or repairs everything, entirely through [`@neon/sdk`](https://neon.com/docs/reference/typescript-sdk):

```bash
NEON_API_KEY=… NEON_ORG_ID=… CONTROL_PLANE_URL=… FUNCTION_SECRET=… npm run setup
```

For each function region it:

1. creates or reuses the host project `benchmarking-neon-functions-host-<region>`
2. inserts or updates the `functions` row
3. creates or reuses the 24 benchmark projects `benchmarking-from-neon-<region>-to-<target>-via-<method>` and upserts their `databases` rows
4. bundles and deploys the function with `FUNCTION_REGION` set, and waits for the deployment to complete
5. creates or updates the `benchmark` schedule trigger

Projects are matched by name, rows are updated in place, and the trigger is matched by name, so an interrupted run can simply be repeated. Rerun it after any change to `src/` to redeploy every region.

Pass region codes to limit a run, for example after adding a region to `NEON_FUNCTION_REGIONS`:

```bash
npm run setup -- eu-central-1
```

```text
eu-central-1
  host project … created
  functions row id=…
  benchmark databases: 24 (24 projects created)
  deployed https://br-…-latencybench.compute.….eu-central-1.aws.neon.tech/
  trigger created (next run …)
```

## Invoking by hand

```bash
curl -H "authorization: Bearer $FUNCTION_SECRET" "<invocation_url>"
```

A successful run returns the number of databases measured and an empty `failures` array. Partial failures return `207` so a single unreachable target does not mask the rest of the run.
