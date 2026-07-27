# Cron

The measurement side of the benchmark: one Vercel serverless function per region, each invoked every 15 minutes by Vercel Cron.

Each invocation reads its own configuration from the control plane database, connects to every benchmark database assigned to its region, times a `SELECT 1` twice (cold, then hot), and writes the results back to `stats`.

## Routes

There is one route per Vercel region, named after the region it runs in:

```
app/api/iad1/route.ts   →  Washington, D.C.
app/api/fra1/route.ts   →  Frankfurt
app/api/sin1/route.ts   →  Singapore
…18 regions
```

Every route is a three-line wrapper around the shared handler in `lib/measure.ts`:

```ts
import { handleRegionBenchmarkRequest } from "@/lib/measure";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function GET(request: Request) {
  return handleRegionBenchmarkRequest(request, "iad1");
}
```

## Region pinning

A measurement is only meaningful if the function actually ran in the region it claims to represent, so each route is pinned in `vercel.json`:

```json
{
  "functions": {
    "app/api/fra1/route.ts": { "regions": ["fra1"] }
  }
}
```

This is a native Vercel feature and needs no special build or deploy pipeline. Do not reintroduce one — an earlier version of this project post-processed `.vc-config.json` in the build output, and it silently stopped working, leaving every function running in `iad1` for months.

Two independent safety nets exist because that failure was invisible:

- **At runtime**, each route compares `VERCEL_REGION` against the region it is named after and returns a 500 if they disagree, rather than recording a wrong-region latency.
- **At build time**, the GitHub Actions workflow fails the deploy if any function in the build output is pinned to the wrong region.

Adding a region requires a route, a `functions` entry, and a `crons` entry. Missing the `functions` entry means the route runs in the default region and fails its own guard; missing the `crons` entry means it never runs.

## Authentication

Every route requires `Authorization: Bearer $CRON_SECRET`. Vercel Cron sends this automatically. Requests without it get a 401 from inside the handler, before any database work — which makes an unauthenticated request a cheap way to check where a function is running. See [CONTRIBUTING.md](../CONTRIBUTING.md#verifying-a-cron-deploy).

## Schedule

All routes run at `:17`, `:32`, and `:47` past the hour (`17-59/15 * * * *`). Crons only run on production deployments, never on previews.

## Local development

These routes cannot run end to end locally: they require `VERCEL_REGION` to be present and to match the route name. Import `lib/meta-db.ts` and `lib/bench-db.ts` directly to exercise the read, measure, and write paths instead — and roll back any writes, since `stats` is the published dataset.

## Deploy

Pushes to `main` touching `cron-vercel/**` deploy via `.github/workflows/region-deploy.yml`, which requires the `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` repository secrets. The same workflow can be triggered manually from the Actions tab.

Deploying by hand produces an identical result, since the region config lives in `vercel.json`:

```bash
vercel deploy --prod
```

Environment variable changes require a redeploy to take effect.
