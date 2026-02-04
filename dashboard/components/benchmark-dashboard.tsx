"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DatabaseSidebar } from "@/components/database-sidebar";
import { LatencyTable } from "@/components/latency-table";
import { QASection } from "@/components/qa-section";
import { Function, PublicDatabase, Stat } from "@/lib/schema";

// Import Neon logos
import logoLight from "../assets/logo.svg";
import logoDark from "../assets/logo-dark.svg";
import { AvgStat } from "@/lib/db";
import { ThemeToggle } from "./theme-toggle";

interface LatencyData {
  cold: Record<string, Record<string, number>>;
  hot: Record<string, Record<string, number>>;
}

interface HistoricalData {
  [key: string]: {
    date: string;
    coldLatency: number;
    hotLatency: number;
  }[];
}

interface BenchmarkDashboardProps {
  initialDatabases: PublicDatabase[];
  initialFunctions: Function[];
  initialStats: AvgStat[];
}

export function BenchmarkDashboard(props: BenchmarkDashboardProps) {
  return (
    <Suspense fallback={<div>Loading dashboard...</div>}>
      <BenchmarkDashboardClient {...props} />
    </Suspense>
  );
}

function BenchmarkDashboardClient({
  initialDatabases,
  initialFunctions,
  initialStats,
}: BenchmarkDashboardProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Track whether we've done the initial load
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  // Initialize selectedDatabases from URL query param or default to empty array
  const [selectedDatabases, setSelectedDatabases] = useState<number[]>(() => {
    const dbParam = searchParams.get("databases");
    return dbParam === "all"
      ? initialDatabases.map((db) => db.id)
      : dbParam
        ? dbParam.split(",").map(Number)
        : [];
  });

  // Track connection filter state
  const [connectionFilter, setConnectionFilter] = useState<string>(
    searchParams.get("connection") || "http",
  );

  useEffect(() => {
    const newParams = new URLSearchParams(searchParams.toString());

    // Only set all databases if it's the initial load and none are selected
    if (selectedDatabases.length === 0 && !initialLoadComplete) {
      newParams.set("databases", "all");
      const newSelectedDatabases = initialDatabases.map((db) => db.id);
      setSelectedDatabases(newSelectedDatabases);
      setInitialLoadComplete(true);
    } else if (selectedDatabases.length === 0) {
      // After initial load, allow deselect all
      newParams.set("databases", "none");
    } else if (selectedDatabases.length === initialDatabases.length) {
      newParams.set("databases", "all");
    } else {
      newParams.set("databases", selectedDatabases.join(","));
    }

    // Only set default values if parameters don't already exist
    // This preserves URL parameters on initial load
    if (!searchParams.has("queries")) {
      newParams.set("queries", "hot");
    }

    if (!searchParams.has("regions")) {
      newParams.set("regions", "match");
    }

    // Update connection filter, but only if it's changed from the URL
    if (
      !searchParams.has("connection") ||
      connectionFilter !== searchParams.get("connection")
    ) {
      newParams.set("connection", connectionFilter);
    }

    // Only update URL if we've changed something
    if (newParams.toString() !== searchParams.toString()) {
      window.history.replaceState({}, "", `?${newParams.toString()}`);
    }
  }, [
    selectedDatabases,
    searchParams,
    initialDatabases,
    initialLoadComplete,
    connectionFilter,
  ]);

  const toggleDatabase = (dbId: number) => {
    setSelectedDatabases((prev) =>
      prev.includes(dbId)
        ? prev.filter((id) => id !== Number(dbId))
        : [...prev, Number(dbId)],
    );
  };

  // Function to update connection filter
  const updateConnectionFilter = (filter: string) => {
    // Check if this is an auto-select request
    if (filter.includes(":autoselect")) {
      const actualFilter = filter.split(":")[0]; // Extract the actual filter (http, ws, all)

      // Update the connection filter first
      setConnectionFilter(actualFilter);

      // Find all databases that match the new filter
      const matchingDatabases = initialDatabases
        .filter(
          (db) =>
            actualFilter === "all" || db.connectionMethod === actualFilter,
        )
        .map((db) => db.id);

      // Get databases that would remain selected after the filter is applied
      const remainingSelectedDatabases = selectedDatabases.filter((dbId) => {
        const db = initialDatabases.find((db) => db.id === dbId);
        return (
          db && (actualFilter === "all" || db.connectionMethod === actualFilter)
        );
      });

      // Check if we need to select databases
      if (matchingDatabases.length > 0) {
        // Case 1: No databases are currently selected - select all matching ones
        if (selectedDatabases.length === 0) {
          setSelectedDatabases(matchingDatabases);
        }
        // Case 2: Some databases are selected but none match the new filter
        else if (remainingSelectedDatabases.length === 0) {
          setSelectedDatabases(matchingDatabases);
        }
        // Case 3: We're switching to a specific type (ws/http) and have some databases that don't match
        else if (actualFilter !== "all") {
          setSelectedDatabases(remainingSelectedDatabases);
        }
        // For 'all' filter and there are some matching databases, we don't need to change anything
      }
    } else {
      // Normal filter change (not auto-select)
      setConnectionFilter(filter);
    }
  };

  const filteredDatabases = initialDatabases.filter((db) => {
    // Only include databases that are selected
    if (!selectedDatabases.includes(db.id)) return false;

    // Apply connection method filter
    if (connectionFilter === "all") return true;

    return connectionFilter === db.connectionMethod;
  });

  const latencyData = processLatencyData(
    initialStats,
    initialFunctions,
    initialDatabases,
  );

  return (
    <div className="flex min-h-screen bg-background">
      <DatabaseSidebar
        databases={initialDatabases}
        selectedDatabases={selectedDatabases}
        onToggleDatabase={toggleDatabase}
        onUpdateConnectionFilter={updateConnectionFilter}
      />

      <div className="flex-1 p-6" style={{ minWidth: 0 }}>
        <div className="space-y-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-center">
              <h1 className="text-3xl font-bold mr-auto">Latency Benchmarks</h1>
              <ThemeToggle className="ml-4" />
              <div className="flex flex-col md:flex-row md:items-center ml-4">
                <div>
                  <Image
                    className="h-6 w-auto dark:hidden"
                    src={logoLight}
                    alt="Neon logo"
                    width={88}
                    height={24}
                    priority
                  />
                  <Image
                    className="hidden h-6 w-auto dark:block"
                    src={logoDark}
                    alt="Neon logo"
                    width={88}
                    height={24}
                    priority
                  />
                </div>
              </div>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle>
                  {searchParams.get("queries") === "hot"
                    ? "Hot Query Latency"
                    : searchParams.get("queries") === "cold"
                      ? "Cold Query Latency"
                      : "30-Day Latency Averages"}
                </CardTitle>
              </div>
              <CardDescription>
                Comparing
                {searchParams.get("queries") === "hot"
                  ? " hot"
                  : searchParams.get("queries") === "cold"
                    ? " cold"
                    : " cold and hot"}{" "}
                query latency across {selectedDatabases.length}
                {connectionFilter !== "all"
                  ? ` databases using ${connectionFilter === "http" ? "@neondatabase/serverless HTTP" : "@neondatabase/serverless WebSocket"} connections`
                  : " databases"}{" "}
                and {initialFunctions.length} serverless functions
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto m-4">
                <LatencyTable
                  databases={filteredDatabases}
                  functions={initialFunctions}
                  latencyData={latencyData}
                  connectionFilter={connectionFilter}
                  onUpdateConnectionFilter={updateConnectionFilter}
                />
              </div>
            </CardContent>
          </Card>
          <QASection />
        </div>
      </div>
    </div>
  );
}

// Helper functions to process the database stats into the required formats
function processLatencyData(
  stats: AvgStat[],
  functions: Function[],
  databases: PublicDatabase[],
): LatencyData {
  const result: LatencyData = {
    cold: {},
    hot: {},
  };

  // Initialize the structure
  functions.forEach((fn) => {
    result.cold[fn.id] = {};
    result.hot[fn.id] = {};
    databases.forEach((db) => {
      result.cold[fn.id][db.id] = 0;
      result.hot[fn.id][db.id] = 0;
    });
  });

  // Group stats by function and database
  const groupedStats = stats.reduce(
    (acc, stat) => {
      const key = `${stat.functionId}-${stat.databaseId}`;
      if (!acc[key]) {
        acc[key] = { cold: [], hot: [] };
      }
      if (stat.queryType === "cold") {
        acc[key].cold.push(stat);
      } else {
        acc[key].hot.push(stat);
      }
      return acc;
    },
    {} as Record<string, { cold: AvgStat[]; hot: AvgStat[] }>,
  );

  // Calculate averages
  Object.entries(groupedStats).forEach(([key, { cold, hot }]) => {
    const [functionId, databaseId] = key.split("-").map(Number);
    if (cold.length > 0) {
      result.cold[functionId][databaseId] =
        cold.reduce((sum, s) => sum + Number(s.avgLatencyMs), 0) / cold.length;
    }
    if (hot.length > 0) {
      result.hot[functionId][databaseId] =
        hot.reduce((sum, s) => sum + Number(s.avgLatencyMs), 0) / hot.length;
    }
  });

  return result;
}

function processHistoricalData(
  stats: Stat[],
  functions: Function[],
  databases: PublicDatabase[],
): HistoricalData {
  const result: HistoricalData = {};

  // Initialize the structure for each database
  databases.forEach((db) => {
    result[db.id] = [];
  });

  // Group stats by database, date, and query type
  const groupedStats = stats.reduce(
    (acc, stat) => {
      const date = stat.dateTime.toISOString().split("T")[0];
      if (!acc[stat.databaseId]) {
        acc[stat.databaseId] = {};
      }
      if (!acc[stat.databaseId][date]) {
        acc[stat.databaseId][date] = { cold: [], hot: [] };
      }
      if (stat.queryType === "cold") {
        acc[stat.databaseId][date].cold.push(stat);
      } else {
        acc[stat.databaseId][date].hot.push(stat);
      }
      return acc;
    },
    {} as Record<number, Record<string, { cold: Stat[]; hot: Stat[] }>>,
  );

  // Calculate daily averages for each database
  Object.entries(groupedStats).forEach(([databaseId, dates]) => {
    Object.entries(dates).forEach(([date, { cold, hot }]) => {
      result[Number(databaseId)].push({
        date,
        coldLatency:
          cold.reduce((sum, s) => sum + Number(s.latencyMs), 0) / cold.length,
        hotLatency:
          hot.reduce((sum, s) => sum + Number(s.latencyMs), 0) / hot.length,
      });
    });
  });

  return result;
}
