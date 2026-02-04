"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  type TooltipProps,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Function, PublicDatabase, Stat } from "@/lib/schema";

interface HistoricalDataPoint {
  date: string;
  coldLatency: number;
  hotLatency: number;
}

interface HistoricalChartProps {
  database: PublicDatabase;
  functions: Function[];
  data: HistoricalDataPoint[];
}

export function HistoricalChart({
  database,
  functions,
  data,
}: HistoricalChartProps) {
  const [queryType, setQueryType] = useState<"both" | "cold" | "hot">("both");

  // Generate colors for each function
  const colors = [
    "#2563eb", // blue
    "#d946ef", // fuchsia
    "#f97316", // orange
    "#14b8a6", // teal
    "#8b5cf6", // violet
    "#ec4899", // pink
    "#f59e0b", // amber
    "#10b981", // emerald
    "#6366f1", // indigo
    "#ef4444", // red
  ];

  // Custom tooltip component
  const CustomTooltip = ({
    active,
    payload,
    label,
  }: TooltipProps<number, string>) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border rounded-md shadow-md p-3">
          <p className="font-medium">{label}</p>
          <div className="space-y-1 mt-2">
            {payload.map((entry, index) => {
              const functionId = entry?.dataKey?.toString().split("-")[0];
              const queryTypeLabel = entry?.dataKey?.toString().split("-")[1];
              const functionName =
                functions.find((f) => f.id === Number(functionId))?.name ||
                functionId;
              const functionRegion =
                functions.find((f) => f.id === Number(functionId))
                  ?.regionLabel || "";

              return (
                <div key={index} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-sm">
                    {functionName} ({functionRegion}) - {queryTypeLabel}:
                    <span className="font-medium ml-1">
                      {Number(entry.value).toFixed(2)}ms
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Tabs
      defaultValue="both"
      onValueChange={(value) => setQueryType(value as "both" | "cold" | "hot")}
    >
      <TabsList>
        <TabsTrigger value="both">Both Query Types</TabsTrigger>
        <TabsTrigger value="cold">Cold Queries</TabsTrigger>
        <TabsTrigger value="hot">Hot Queries</TabsTrigger>
      </TabsList>

      <TabsContent value="both" className="mt-4">
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 5, right: 30, left: 20, bottom: 25 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                angle={-45}
                textAnchor="end"
                height={60}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                label={{
                  value: "Latency (ms)",
                  angle: -90,
                  position: "insideLeft",
                  style: { textAnchor: "middle" },
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />

              {functions.map((fn, index) => (
                <Line
                  key={`${fn.id}-cold`}
                  type="monotone"
                  dataKey={`${fn.id}-cold`}
                  name={`${fn.name} (${fn.regionLabel}) - Cold`}
                  stroke={colors[index % colors.length]}
                  strokeDasharray="5 5"
                  dot={{ r: 2 }}
                  activeDot={{ r: 6 }}
                />
              ))}

              {functions.map((fn, index) => (
                <Line
                  key={`${fn.id}-hot`}
                  type="monotone"
                  dataKey={`${fn.id}-hot`}
                  name={`${fn.name} (${fn.regionLabel}) - Hot`}
                  stroke={colors[index % colors.length]}
                  dot={{ r: 2 }}
                  activeDot={{ r: 6 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </TabsContent>

      <TabsContent value="cold" className="mt-4">
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 5, right: 30, left: 20, bottom: 25 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                angle={-45}
                textAnchor="end"
                height={60}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                label={{
                  value: "Latency (ms)",
                  angle: -90,
                  position: "insideLeft",
                  style: { textAnchor: "middle" },
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />

              {functions.map((fn, index) => (
                <Line
                  key={`${fn.id}-cold`}
                  type="monotone"
                  dataKey={`${fn.id}-cold`}
                  name={`${fn.name} (${fn.regionLabel})`}
                  stroke={colors[index % colors.length]}
                  dot={{ r: 2 }}
                  activeDot={{ r: 6 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </TabsContent>

      <TabsContent value="hot" className="mt-4">
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 5, right: 30, left: 20, bottom: 25 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                angle={-45}
                textAnchor="end"
                height={60}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                label={{
                  value: "Latency (ms)",
                  angle: -90,
                  position: "insideLeft",
                  style: { textAnchor: "middle" },
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />

              {functions.map((fn, index) => (
                <Line
                  key={`${fn.id}-hot`}
                  type="monotone"
                  dataKey={`${fn.id}-hot`}
                  name={`${fn.name} (${fn.regionLabel})`}
                  stroke={colors[index % colors.length]}
                  dot={{ r: 2 }}
                  activeDot={{ r: 6 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </TabsContent>
    </Tabs>
  );
}
