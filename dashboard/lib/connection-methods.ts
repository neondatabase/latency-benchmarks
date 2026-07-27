/**
 * The four ways of talking to the same Neon database that the connection
 * method benchmark compares. Shared by the client UI and the server routes so
 * the labels, colours, and ids cannot drift apart.
 */

export const BENCH_TABLE = "employees";
export const BENCH_COLUMNS = ["emp_no", "first_name", "last_name"] as const;
export const BENCH_LIMIT = 10;

/** Human-readable form of the query every method issues. */
export const BENCH_QUERY_SQL = `SELECT ${BENCH_COLUMNS.join(", ")} FROM ${BENCH_TABLE} LIMIT ${BENCH_LIMIT}`;

export type ServerMethodId = "data-api-server" | "serverless" | "pool";
export type MethodId = "data-api-browser" | ServerMethodId;

export interface ConnectionMethod {
  id: MethodId;
  label: string;
  description: string;
  /** Tailwind text colour and the raw hex the chart uses. */
  color: string;
  /** Browser-issued methods cannot report a server-only timing. */
  endToEndOnly?: boolean;
}

export const CONNECTION_METHODS: ConnectionMethod[] = [
  {
    id: "data-api-browser",
    label: "Data API (browser)",
    description:
      "The browser queries the Data API directly with @neondatabase/postgrest-js, using a Neon Auth JWT minted server-side during warm-up. No server hop on the measured query.",
    color: "#0ea5e9",
    endToEndOnly: true,
  },
  {
    id: "data-api-server",
    label: "Data API (server)",
    description:
      "A route handler queries the Data API with @neondatabase/neon-js, reusing a cached Neon Auth JWT.",
    color: "#a855f7",
  },
  {
    id: "serverless",
    label: "Serverless driver + Drizzle",
    description:
      "A route handler queries over HTTP with @neondatabase/serverless (neon-http) through Drizzle.",
    color: "#37c38f",
  },
  {
    id: "pool",
    label: "node-postgres + Drizzle",
    description:
      "A route handler uses a pg.Pool over direct TCP, kept warm with attachDatabasePool, through Drizzle.",
    color: "#f59e0b",
  },
];

export const SERVER_METHOD_IDS: ServerMethodId[] = [
  "data-api-server",
  "serverless",
  "pool",
];

export function isServerMethod(id: string): id is ServerMethodId {
  return (SERVER_METHOD_IDS as string[]).includes(id);
}

export const SAMPLE_COUNTS = [10, 25, 50] as const;
export const WATERFALL_DEPTHS = [1, 2, 5] as const;

export type MeasurementMode = "end-to-end" | "server";

/** A single timing for one method. `serverMs` is absent for browser methods. */
export interface Sample {
  method: MethodId;
  sample: number;
  endToEndMs: number;
  serverMs?: number;
}
