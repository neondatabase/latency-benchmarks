"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Function, PublicDatabase, Stat } from "@/lib/schema";

interface ChartData {
  date: string;
  [key: string]: number | string; // Dynamic keys for each function's cold/hot values
}

interface LatencyChartProps {
  database: PublicDatabase;
  functions: Function[];
  stats: Stat[];
}

export function LatencyChart({
  database,
  functions,
  stats,
}: LatencyChartProps) {
  // Transform stats into chart data format
  const chartData = stats
    .reduce((acc, stat) => {
      const date = new Date(stat.dateTime).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      const existingData = acc.find((d) => d.date === date);

      if (existingData) {
        const key = `${stat.functionId}-${stat.queryType}`;
        const functionStats = stats.filter(
          (s) =>
            new Date(s.dateTime).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            }) === date &&
            s.functionId === stat.functionId &&
            s.queryType === stat.queryType,
        );
        existingData[key] = Number(
          (
            functionStats.reduce((sum, s) => sum + Number(s.latencyMs), 0) /
            functionStats.length
          ).toFixed(2),
        );
      } else {
        const newData: ChartData = { date };

        // Initialize all function data points
        functions.forEach((fn) => {
          const coldStats = stats.filter(
            (s) =>
              new Date(s.dateTime).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              }) === date &&
              s.functionId === fn.id &&
              s.queryType === "cold",
          );
          const hotStats = stats.filter(
            (s) =>
              new Date(s.dateTime).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              }) === date &&
              s.functionId === fn.id &&
              s.queryType === "hot",
          );

          newData[`${fn.id}-cold`] =
            coldStats.length > 0
              ? Number(
                  (
                    coldStats.reduce((sum, s) => sum + Number(s.latencyMs), 0) /
                    coldStats.length
                  ).toFixed(2),
                )
              : 0;
          newData[`${fn.id}-hot`] =
            hotStats.length > 0
              ? Number(
                  (
                    hotStats.reduce((sum, s) => sum + Number(s.latencyMs), 0) /
                    hotStats.length
                  ).toFixed(2),
                )
              : 0;
        });

        acc.push(newData);
      }

      return acc;
    }, [] as ChartData[])
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Generate colors for each function
  const colors = [
    "#8884d8",
    "#82ca9d",
    "#ffc658",
    "#ff8042",
    "#0088fe",
    "#00c49f",
    "#ffbb28",
    "#ff8042",
  ];

  return (
    <Tabs defaultValue="combined">
      <TabsList>
        <TabsTrigger value="combined">Combined</TabsTrigger>
        <TabsTrigger value="cold">Cold Queries</TabsTrigger>
        <TabsTrigger value="hot">Hot Queries</TabsTrigger>
      </TabsList>

      <TabsContent value="combined" className="mt-4">
        <Card>
          <CardContent className="pt-6">
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart
                data={chartData}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis
                  label={{
                    value: "Latency (ms)",
                    angle: -90,
                    position: "insideLeft",
                  }}
                />
                <Tooltip />
                <Legend />
                {functions.flatMap((fn, index) => [
                  <Area
                    key={`${fn.id}-cold`}
                    type="monotone"
                    dataKey={`${fn.id}-cold`}
                    name={`${fn.name} (${fn.regionLabel}) - Cold`}
                    stroke={colors[index % colors.length]}
                    fill={colors[index % colors.length]}
                    fillOpacity={0.3}
                    strokeDasharray="5 5"
                  />,
                  <Area
                    key={`${fn.id}-hot`}
                    type="monotone"
                    dataKey={`${fn.id}-hot`}
                    name={`${fn.name} (${fn.regionLabel}) - Hot`}
                    stroke={colors[index % colors.length]}
                    fill={colors[index % colors.length]}
                    fillOpacity={0.3}
                  />,
                ])}
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="cold" className="mt-4">
        <Card>
          <CardContent className="pt-6">
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart
                data={chartData}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis
                  label={{
                    value: "Latency (ms)",
                    angle: -90,
                    position: "insideLeft",
                  }}
                />
                <Tooltip />
                <Legend />
                {functions.map((fn, index) => (
                  <Area
                    key={`${fn.id}-cold`}
                    type="monotone"
                    dataKey={`${fn.id}-cold`}
                    name={`${fn.name} (${fn.regionLabel})`}
                    stroke={colors[index % colors.length]}
                    fill={colors[index % colors.length]}
                    fillOpacity={0.3}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="hot" className="mt-4">
        <Card>
          <CardContent className="pt-6">
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart
                data={chartData}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis
                  label={{
                    value: "Latency (ms)",
                    angle: -90,
                    position: "insideLeft",
                  }}
                />
                <Tooltip />
                <Legend />
                {functions.map((fn, index) => (
                  <Area
                    key={`${fn.id}-hot`}
                    type="monotone"
                    dataKey={`${fn.id}-hot`}
                    name={`${fn.name} (${fn.regionLabel})`}
                    stroke={colors[index % colors.length]}
                    fill={colors[index % colors.length]}
                    fillOpacity={0.3}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
