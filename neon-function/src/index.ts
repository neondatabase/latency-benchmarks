import { attachDatabasePool } from "@neon/functions";
import { parseTriggerInvocation } from "@neon/functions/triggers";
import { Pool } from "pg";
import { measureLatency } from "./measure";
import type { ConnectionMethod } from "./regions";

/**
 * Long-lived pool for the control plane, created once at module scope as the
 * Neon Functions runtime recommends. Benchmark targets are deliberately not
 * pooled - see measure.ts.
 *
 * This is not `DATABASE_URL`: that is injected automatically and points at the
 * function's own host branch, which is not where the benchmark data lives.
 */
const controlPlane = new Pool({
  connectionString: process.env.CONTROL_PLANE_URL,
  max: 3,
});
attachDatabasePool(controlPlane);

interface DatabaseRow {
  id: number;
  region_label: string;
  connection_method: ConnectionMethod;
  connection_url: string;
}

async function runBenchmark(functionRegion: string) {
  const fnResult = await controlPlane.query<{ id: number; region_label: string }>(
    `SELECT id, region_label FROM functions
     WHERE platform = 'neon' AND region_code = $1`,
    [functionRegion],
  );
  const fn = fnResult.rows[0];
  if (!fn) {
    throw new Error(`no 'neon' function registered for region ${functionRegion}`);
  }

  const { rows: databases } = await controlPlane.query<DatabaseRow>(
    `SELECT id, region_label, connection_method, connection_url
     FROM databases WHERE function_id = $1 ORDER BY id`,
    [fn.id],
  );

  let measured = 0;
  const failures: string[] = [];

  for (const db of databases) {
    try {
      const cold = await measureLatency(db.connection_url, db.connection_method);
      await record(fn.id, db.id, cold, "cold");

      const hot = await measureLatency(db.connection_url, db.connection_method);
      await record(fn.id, db.id, hot, "hot");

      measured++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `failed measuring database ${db.id} (${db.region_label} via ${db.connection_method}): ${message}`,
      );
      failures.push(`${db.region_label}/${db.connection_method}`);
    }
  }

  return {
    success: failures.length === 0,
    function: fn.region_label,
    databases: databases.length,
    measured,
    failures,
  };
}

async function record(
  functionId: number,
  databaseId: number,
  latencyMs: number,
  queryType: "cold" | "hot",
) {
  await controlPlane.query(
    `INSERT INTO stats (date_time, function_id, database_id, latency_ms, query_type)
     VALUES (NOW(), $1, $2, $3, $4)`,
    [functionId, databaseId, latencyMs.toFixed(2), queryType],
  );
}

/**
 * A scheduled run arrives as a Neon Function Trigger delivery. The Functions
 * proxy strips client-supplied `x-neon-*` headers, so that header can only
 * come from Neon. Manual runs authenticate with the shared secret instead.
 */
async function authorize(request: Request, secret: string): Promise<Response | null> {
  if (request.headers.has("x-neon-trigger-invocation-id")) {
    const parsed = await parseTriggerInvocation(request);
    if (parsed.ok) return null;
    return new Response(parsed.error, {
      status: parsed.error === "invalid_body" ? 400 : 401,
    });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const secret = process.env.FUNCTION_SECRET;
    const functionRegion = process.env.FUNCTION_REGION;
    if (!secret || !functionRegion || !process.env.CONTROL_PLANE_URL) {
      console.error(
        "FUNCTION_SECRET, FUNCTION_REGION, and CONTROL_PLANE_URL must all be set",
      );
      return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }

    const rejected = await authorize(request, secret);
    if (rejected) return rejected;

    try {
      const result = await runBenchmark(functionRegion);
      return Response.json(result, { status: result.success ? 200 : 207 });
    } catch (error) {
      console.error("benchmark run failed:", error);
      return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }
  },
};
