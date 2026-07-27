import { neon, neonConfig, Pool as NeonPool } from "@neondatabase/serverless";
import { Pool as PgPool } from "pg";
import type { ConnectionMethod } from "./regions";

/**
 * Times a single `SELECT 1` against a benchmark database.
 *
 * A fresh client is created for every measurement on purpose. The function
 * runtime is long-lived, but reusing a warm connection here would measure the
 * runtime's pooling rather than the round trip this benchmark is about, and
 * would not be comparable to the Vercel numbers.
 */
export async function measureLatency(
  connectionUrl: string,
  connectionMethod: ConnectionMethod,
): Promise<number> {
  if (connectionMethod === "tcp") {
    const pool = new PgPool({ connectionString: connectionUrl, max: 1 });
    try {
      const start = performance.now();
      await pool.query("SELECT 1");
      return performance.now() - start;
    } finally {
      await pool.end().catch(() => {});
    }
  }

  if (connectionMethod === "ws") {
    const pool = new NeonPool({ connectionString: connectionUrl, max: 1 });
    try {
      const start = performance.now();
      await pool.query("SELECT 1");
      return performance.now() - start;
    } finally {
      await pool.end().catch(() => {});
    }
  }

  neonConfig.webSocketConstructor = undefined;
  const sql = neon(connectionUrl);
  const start = performance.now();
  await sql`SELECT 1`;
  return performance.now() - start;
}
