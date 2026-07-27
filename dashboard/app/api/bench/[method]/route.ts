import { NextResponse } from "next/server";
import {
  isServerMethod,
  type ServerMethodId,
} from "@/lib/connection-methods";
import {
  queryViaDataApi,
  queryViaPool,
  queryViaServerless,
} from "@/lib/bench-clients";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_QUERIES = 5;

const runners: Record<ServerMethodId, () => Promise<void>> = {
  "data-api-server": queryViaDataApi,
  serverless: queryViaServerless,
  pool: queryViaPool,
};

/**
 * Runs one sample for a server-side connection method and reports the time the
 * server itself spent on the queries. The browser separately measures the
 * end-to-end time around this request, so the difference is the network hop.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ method: string }> },
) {
  const { method } = await params;
  if (!isServerMethod(method)) {
    return NextResponse.json({ error: "Unknown method" }, { status: 404 });
  }

  const requested = Number(
    new URL(request.url).searchParams.get("queries") ?? "1",
  );
  const queries =
    Number.isInteger(requested) && requested >= 1 && requested <= MAX_QUERIES
      ? requested
      : 1;

  try {
    const run = runners[method];
    const start = performance.now();
    for (let i = 0; i < queries; i++) {
      await run();
    }
    const serverMs = performance.now() - start;

    return NextResponse.json(
      { method, queries, serverMs },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error(`bench ${method} failed:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Query failed" },
      { status: 500 },
    );
  }
}
