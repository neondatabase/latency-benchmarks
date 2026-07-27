import { NextResponse } from "next/server";
import { mintBrowserToken } from "@/lib/bench-clients";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Hands the browser a short-lived Data API JWT so it can query the Data API
 * directly. Fetched during warm-up, outside the measured window.
 */
export async function GET() {
  try {
    const { token, expiresAt } = await mintBrowserToken();
    return NextResponse.json(
      { token, expiresAt },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("failed to mint Data API token:", error);
    return NextResponse.json(
      { error: "Could not mint a Data API token" },
      { status: 500 },
    );
  }
}
