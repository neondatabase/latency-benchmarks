import { Pool } from "pg";
import { measureLatency } from "./measure";
import { NEON_FUNCTION_REGION, type ConnectionMethod } from "./regions";

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

interface DatabaseRow {
  id: number;
  region_label: string;
  connection_method: ConnectionMethod;
  connection_url: string;
}

async function runBenchmark() {
  const fnResult = await controlPlane.query<{ id: number; region_label: string }>(
    `SELECT id, region_label FROM functions
     WHERE platform = 'neon' AND region_code = $1`,
    [NEON_FUNCTION_REGION.code],
  );
  const fn = fnResult.rows[0];
  if (!fn) {
    throw new Error(
      `no 'neon' function registered for region ${NEON_FUNCTION_REGION.code}`,
    );
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

export default {
  async fetch(request: Request): Promise<Response> {
    const secret = process.env.FUNCTION_SECRET;
    if (!secret) {
      console.error("FUNCTION_SECRET is not set");
      return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
    if (!process.env.CONTROL_PLANE_URL) {
      console.error("CONTROL_PLANE_URL is not set");
      return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }

    try {
      const result = await runBenchmark();
      return Response.json(result, { status: result.success ? 200 : 207 });
    } catch (error) {
      console.error("benchmark run failed:", error);
      return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }
  },
};

process.on("SIGINT", () => {
  controlPlane.end().then(() => process.exit(0));
});
