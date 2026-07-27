import type { Metadata } from "next";
import { BenchNav } from "@/components/bench-nav";
import { ConnectionMethodBench } from "@/components/connection-method-bench";

export const metadata: Metadata = {
  title: "Connection Method Benchmark | Neon Benchmarks",
  description:
    "Compare query latency across the Data API, the Neon serverless driver, and node-postgres against the same Neon database.",
};

export default function ConnectionMethodsPage() {
  return (
    <main className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="space-y-6">
        <BenchNav title="Connection Methods" />
        <ConnectionMethodBench />
      </div>
    </main>
  );
}
