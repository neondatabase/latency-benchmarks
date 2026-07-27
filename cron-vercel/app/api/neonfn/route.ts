import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * Neon Functions have no scheduler of their own, so this route exists purely to
 * let Vercel Cron drive them on the same 15-minute cadence as every other
 * region. It performs no measurement itself: the latency is measured inside the
 * Neon Function, running on Neon compute in us-east-2.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("CRON_SECRET is not set");
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const target = process.env.NEON_FUNCTION_URL;
  if (!target) {
    console.error("NEON_FUNCTION_URL is not set");
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }

  try {
    const response = await fetch(target, {
      headers: { authorization: `Bearer ${cronSecret}` },
      signal: AbortSignal.timeout(9 * 60_000),
    });
    const body = await response.text();

    if (!response.ok) {
      console.error(
        `Neon Function returned ${response.status}: ${body.slice(0, 500)}`,
      );
      return NextResponse.json(
        { error: "Neon Function invocation failed", status: response.status },
        { status: 502 },
      );
    }

    return new NextResponse(body, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("Failed to invoke Neon Function:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
