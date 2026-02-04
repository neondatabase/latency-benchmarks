import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { avg, desc, gte } from "drizzle-orm";
import {
  databases,
  functions,
  stats,
  type Function,
  type PublicDatabase,
  type Stat,
} from "./schema";

config({ path: ".env" });

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql);

export async function getAllDatabases(): Promise<PublicDatabase[]> {
  return db
    .select({
      id: databases.id,
      name: databases.name,
      provider: databases.provider,
      regionCode: databases.regionCode,
      regionLabel: databases.regionLabel,
      functionId: databases.functionId,
      connectionMethod: databases.connectionMethod,
    })
    .from(databases);
}

export async function getAllFunctions(): Promise<Function[]> {
  return await db.select().from(functions);
}

export type AvgStat = {
  functionId: number;
  databaseId: number;
  queryType: "cold" | "hot";
  avgLatencyMs: string | null; // `decimal` columns come back as strings
};

export async function getLast30DaysAvgLatency(): Promise<AvgStat[]> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return db
    .select({
      functionId: stats.functionId,
      databaseId: stats.databaseId,
      queryType: stats.queryType,
      avgLatencyMs: avg(stats.latencyMs).as("avg_latency_ms"),
    })
    .from(stats)
    .where(gte(stats.dateTime, thirtyDaysAgo))
    .groupBy(stats.functionId, stats.databaseId, stats.queryType);
}
