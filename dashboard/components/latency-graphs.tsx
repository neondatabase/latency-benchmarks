"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LatencyChart } from "@/components/latency-chart";
import type { Function, PublicDatabase, Stat } from "@/lib/schema";

interface LatencyGraphsProps {
  databases: PublicDatabase[];
  functions: Function[];
  stats: Stat[];
}

export function LatencyGraphs({
  databases,
  functions,
  stats,
}: LatencyGraphsProps) {
  if (databases.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Historical Performance</CardTitle>
          <CardDescription>
            Select at least one database to view historical data
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">
        Historical Performance
      </h2>
      <p className="text-muted-foreground">
        Daily latency averages over the last 30 days
      </p>

      <div className="space-y-6">
        {databases.map((db) => {
          const dbStats = stats.filter((stat) => stat.databaseId === db.id);
          return (
            <Card key={db.id}>
              <CardHeader>
                <CardTitle>{db.name}</CardTitle>
                <CardDescription>{db.regionLabel}</CardDescription>
              </CardHeader>
              <CardContent>
                <LatencyChart
                  database={db}
                  functions={functions}
                  stats={dbStats}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
