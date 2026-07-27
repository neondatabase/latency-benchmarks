"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { createClient } from "@neondatabase/neon-js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BENCH_LIMIT,
  BENCH_QUERY_SQL,
  BENCH_TABLE,
  CONNECTION_METHODS,
  SAMPLE_COUNTS,
  SERVER_METHOD_IDS,
  WATERFALL_DEPTHS,
  type MeasurementMode,
  type MethodId,
  type Sample,
} from "@/lib/connection-methods";

const BASE_PATH = process.env.NEXT_PUBLIC_REWRITE_PREFIX ?? "";

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <span className="text-xs font-medium text-muted-foreground sm:w-36 sm:shrink-0">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return null;
  const index = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1,
  );
  return sorted[Math.max(0, index)];
}

export function ConnectionMethodBench() {
  const [mode, setMode] = useState<MeasurementMode>("end-to-end");
  const [sampleCount, setSampleCount] = useState<number>(25);
  const [queriesPerSample, setQueriesPerSample] = useState<number>(1);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<ReturnType<typeof createClient> | null>(null);
  const signInRef = useRef<Promise<unknown> | null>(null);

  const getBrowserClient = useCallback(async () => {
    const authUrl = process.env.NEXT_PUBLIC_BENCH_NEON_AUTH_URL;
    const dataApiUrl = process.env.NEXT_PUBLIC_BENCH_NEON_DATA_API_URL;
    const email = process.env.NEXT_PUBLIC_BENCH_NEON_AUTH_EMAIL;
    const password = process.env.NEXT_PUBLIC_BENCH_NEON_AUTH_PASSWORD;
    if (!authUrl || !dataApiUrl || !email || !password) {
      throw new Error("Browser Data API credentials are not configured");
    }

    if (!clientRef.current) {
      clientRef.current = createClient({
        auth: { url: authUrl },
        dataApi: { url: dataApiUrl },
      });
    }
    if (!signInRef.current) {
      signInRef.current = clientRef.current.auth.signIn.email({
        email,
        password,
      });
    }
    await signInRef.current;
    return clientRef.current;
  }, []);

  const runSampleForBrowser = useCallback(async (): Promise<Sample["endToEndMs"]> => {
    const client = await getBrowserClient();
    const start = performance.now();
    for (let i = 0; i < queriesPerSample; i++) {
      const { error: queryError } = await client
        .from(BENCH_TABLE)
        .select("emp_no,first_name,last_name")
        .limit(BENCH_LIMIT);
      if (queryError) throw new Error(queryError.message);
    }
    return performance.now() - start;
  }, [getBrowserClient, queriesPerSample]);

  const runSampleForServer = useCallback(
    async (method: MethodId) => {
      const start = performance.now();
      const response = await fetch(
        `${BASE_PATH}/api/bench/${method}?queries=${queriesPerSample}`,
        { cache: "no-store" },
      );
      const endToEndMs = performance.now() - start;
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `${method} returned ${response.status}`);
      }
      const body = (await response.json()) as { serverMs: number };
      return { endToEndMs, serverMs: body.serverMs };
    },
    [queriesPerSample],
  );

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    setSamples([]);
    setProgress(0);

    const collected: Sample[] = [];
    try {
      // Warm every method once so the first sample is not dominated by cold
      // starts and sign-in, which would drown out the difference being measured.
      await Promise.all([
        runSampleForBrowser().catch(() => undefined),
        ...SERVER_METHOD_IDS.map((m) =>
          runSampleForServer(m).catch(() => undefined),
        ),
      ]);

      for (let sample = 1; sample <= sampleCount; sample++) {
        // All methods run concurrently within a sample so they see the same
        // database conditions.
        const [browser, ...servers] = await Promise.all([
          runSampleForBrowser().then(
            (endToEndMs) => ({ ok: true as const, endToEndMs }),
            (e: unknown) => ({ ok: false as const, e }),
          ),
          ...SERVER_METHOD_IDS.map((m) =>
            runSampleForServer(m).then(
              (r) => ({ ok: true as const, ...r }),
              (e: unknown) => ({ ok: false as const, e }),
            ),
          ),
        ]);

        if (browser.ok) {
          collected.push({
            method: "data-api-browser",
            sample,
            endToEndMs: browser.endToEndMs,
          });
        }
        servers.forEach((result, i) => {
          if (result.ok) {
            collected.push({
              method: SERVER_METHOD_IDS[i],
              sample,
              endToEndMs: result.endToEndMs,
              serverMs: result.serverMs,
            });
          }
        });

        setProgress(sample);
        setSamples([...collected]);
      }

      if (collected.length === 0) {
        setError("Every method failed. Check the browser console for details.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Benchmark failed");
    } finally {
      setRunning(false);
    }
  }, [runSampleForBrowser, runSampleForServer, sampleCount]);

  const valueFor = useCallback(
    (s: Sample) =>
      mode === "server" ? (s.serverMs ?? null) : s.endToEndMs,
    [mode],
  );

  const chartData = useMemo(() => {
    const bySample = new Map<number, Record<string, number | string>>();
    for (const s of samples) {
      const value = valueFor(s);
      if (value === null) continue;
      const row = bySample.get(s.sample) ?? { sample: s.sample };
      row[s.method] = Number(value.toFixed(2));
      bySample.set(s.sample, row);
    }
    return [...bySample.values()].sort(
      (a, b) => Number(a.sample) - Number(b.sample),
    );
  }, [samples, valueFor]);

  const stats = useMemo(
    () =>
      CONNECTION_METHODS.map((method) => {
        const values = samples
          .filter((s) => s.method === method.id)
          .map(valueFor)
          .filter((v): v is number => v !== null)
          .sort((a, b) => a - b);

        return {
          method,
          count: values.length,
          avg: values.length
            ? values.reduce((sum, v) => sum + v, 0) / values.length
            : null,
          median: percentile(values, 50),
          p95: percentile(values, 95),
        };
      }),
    [samples, valueFor],
  );

  const visibleMethods = CONNECTION_METHODS.filter(
    (m) => !(mode === "server" && m.endToEndOnly),
  );

  const fmt = (v: number | null) => (v === null ? "—" : `${v.toFixed(2)}ms`);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Connection methods</CardTitle>
          <CardDescription>
            Four ways of running the same query against the same Neon database.
            Everything runs in <code className="text-xs">us-east-1</code>: the
            server routes, the Data API, and the Postgres compute.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {CONNECTION_METHODS.map((method) => (
            <div key={method.id} className="rounded-md border p-3">
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: method.color }}
                />
                <span className="text-sm font-medium">{method.label}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {method.description}
              </p>
              {method.endToEndOnly && (
                <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-500">
                  End-to-end only
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <FilterRow label="Measurement">
            <Button
              variant={mode === "end-to-end" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("end-to-end")}
            >
              End-to-end
            </Button>
            <Button
              variant={mode === "server" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("server")}
            >
              Server only
            </Button>
          </FilterRow>

          <FilterRow label="Samples per method">
            {SAMPLE_COUNTS.map((count) => (
              <Button
                key={count}
                variant={sampleCount === count ? "default" : "outline"}
                size="sm"
                onClick={() => setSampleCount(count)}
              >
                {count}
              </Button>
            ))}
          </FilterRow>

          <FilterRow label="Queries per sample">
            {WATERFALL_DEPTHS.map((depth) => (
              <Button
                key={depth}
                variant={queriesPerSample === depth ? "default" : "outline"}
                size="sm"
                onClick={() => setQueriesPerSample(depth)}
              >
                {depth === 1 ? "1 (no waterfall)" : depth}
              </Button>
            ))}
          </FilterRow>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button onClick={run} disabled={running}>
              {running ? `Running ${progress}/${sampleCount}…` : "Run benchmark"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {mode === "end-to-end"
                ? "Time the browser observes, including the network hop."
                : "Time the server spends on the query. Browser method excluded."}
            </span>
          </div>

          {error && (
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Query duration per sample</CardTitle>
          <CardDescription>
            {mode === "end-to-end" ? "End-to-end" : "Server only"} ·{" "}
            {queriesPerSample === 1
              ? "single query"
              : `${queriesPerSample} sequential queries`}
            . Lower is better.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="flex h-[320px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
              Run the benchmark to see results.
            </div>
          ) : (
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="sample"
                    tick={{ fontSize: 11 }}
                    label={{ value: "Sample", position: "insideBottom", offset: -4, fontSize: 11 }}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    width={52}
                    label={{ value: "ms", angle: -90, position: "insideLeft", fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(value: number) => `${value}ms`}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {visibleMethods.map((method) => (
                    <Line
                      key={method.id}
                      type="monotone"
                      dataKey={method.id}
                      name={method.label}
                      stroke={method.color}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="m-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Samples</TableHead>
                  <TableHead className="text-right">Avg</TableHead>
                  <TableHead className="text-right">Median</TableHead>
                  <TableHead className="text-right">p95</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.map(({ method, count, avg, median, p95 }) => (
                  <TableRow
                    key={method.id}
                    className={cn(
                      mode === "server" && method.endToEndOnly && "opacity-50",
                    )}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: method.color }}
                        />
                        <span className="text-sm">{method.label}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {count}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {fmt(avg)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {fmt(median)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {fmt(p95)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Every method issues <code>{BENCH_QUERY_SQL}</code> against the same Neon
        database. Each sample runs all methods concurrently so they see the same
        conditions, and one warm-up round runs before sampling begins so
        sign-in and cold starts do not distort the first result.
      </p>
    </div>
  );
}
