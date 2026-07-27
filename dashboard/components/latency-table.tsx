"use client";

import { Fragment, useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Function, PublicDatabase } from "@/lib/schema";

interface LatencyData {
  cold: Record<number, Record<number, number>>;
  hot: Record<number, Record<number, number>>;
}

interface RegionGroup {
  regionLabel: string;
  connectionMethod: string;
  regionCode: string;
  databases: PublicDatabase[];
}

interface LatencyTableProps {
  databases: PublicDatabase[];
  functions: Function[];
  latencyData: LatencyData;
  connectionFilter?: string;
  onUpdateConnectionFilter?: (filter: string) => void;
}

type QueryType = "both" | "cold" | "hot";
type RegionFilter = "all" | "matching";
type PlatformFilter = "all" | "neon" | "vercel";

const PLATFORM_LABELS: Record<string, string> = {
  neon: "Neon Functions",
  vercel: "Vercel Serverless",
};

/** Neon first: it is the platform this benchmark is published to showcase. */
const PLATFORM_ORDER = ["neon", "vercel"];

function platformLabel(platform: string) {
  return PLATFORM_LABELS[platform] ?? platform;
}

/**
 * Label beside its controls on wider screens, stacked above them on narrow
 * ones. Buttons wrap rather than overflowing the card.
 */
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

export function LatencyTable(props: LatencyTableProps) {
  return (
    <Suspense fallback={<div>Loading table...</div>}>
      <LatencyTableClient {...props} />
    </Suspense>
  );
}

function LatencyTableClient({
  databases,
  functions,
  latencyData,
  connectionFilter: propConnectionFilter,
  onUpdateConnectionFilter,
}: LatencyTableProps) {
  const searchParams = useSearchParams();

  const [queryType, setQueryType] = useState<QueryType>(() => {
    const param = searchParams.get("queries");
    if (param === "cold") return "cold";
    if (param === "hot") return "hot";
    if (param === "all") return "both";
    return "hot"; // Default is 'hot' if no param is specified
  });

  const [regionFilter, setRegionFilter] = useState<RegionFilter>(() => {
    const param = searchParams.get("regions");
    return param === "match"
      ? "matching"
      : param === "all"
        ? "all"
        : "matching"; // Default is 'matching' now
  });

  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>(() => {
    const param = searchParams.get("platform");
    return param === "neon" || param === "vercel" ? param : "all";
  });

  // Use the prop value or fall back to URL parameter
  const [localConnectionFilter, setLocalConnectionFilter] = useState<string>(
    () => {
      return propConnectionFilter || searchParams.get("connection") || "http";
    },
  );

  // Use the connection filter from props if available, otherwise use local state
  const connectionFilter = propConnectionFilter || localConnectionFilter;

  // Function to update connection filter
  const handleConnectionFilterChange = (value: string) => {
    setLocalConnectionFilter(value);

    if (onUpdateConnectionFilter) {
      // First update with just the filter to ensure the connection filter changes
      onUpdateConnectionFilter(value);

      // Then check if we need to auto-select databases
      setTimeout(() => {
        if (databases.length === 0) {
          // If there are no selected databases, send auto-select signal
          onUpdateConnectionFilter(value + ":autoselect");
        } else {
          // If there are selected databases but with a different connection method
          // Check if any of them match the new filter
          const hasMatchingDatabase = databases.some(
            (db) => value === "all" || db.connectionMethod === value,
          );

          // If none match, trigger auto-select
          if (!hasMatchingDatabase) {
            onUpdateConnectionFilter(value + ":autoselect");
          }
        }
      }, 0);
    }
  };

  useEffect(() => {
    // If we're managing connection filter locally, sync to URL
    if (!onUpdateConnectionFilter) {
      const newParams = new URLSearchParams(searchParams.toString());

      const queryParamValue = queryType === "both" ? "all" : queryType;
      const regionParamValue = regionFilter === "matching" ? "match" : "all";

      // Only update if the values have changed
      if (searchParams.get("queries") !== queryParamValue) {
        newParams.set("queries", queryParamValue);
      }

      if (searchParams.get("regions") !== regionParamValue) {
        newParams.set("regions", regionParamValue);
      }

      if ((searchParams.get("platform") ?? "all") !== platformFilter) {
        newParams.set("platform", platformFilter);
      }

      if (searchParams.get("connection") !== connectionFilter) {
        newParams.set("connection", connectionFilter);
      }

      if (!newParams.has("databases")) {
        newParams.set("databases", "all");
      }

      // Only update URL if we've changed something
      if (newParams.toString() !== searchParams.toString()) {
        window.history.replaceState({}, "", `?${newParams.toString()}`);
      }
    } else {
      // If connection filter is managed externally, only sync query type and region filter
      const newParams = new URLSearchParams(searchParams.toString());

      const queryParamValue = queryType === "both" ? "all" : queryType;
      const regionParamValue = regionFilter === "matching" ? "match" : "all";

      // Only update if the values have changed
      if (searchParams.get("queries") !== queryParamValue) {
        newParams.set("queries", queryParamValue);
      }

      if (searchParams.get("regions") !== regionParamValue) {
        newParams.set("regions", regionParamValue);
      }

      if ((searchParams.get("platform") ?? "all") !== platformFilter) {
        newParams.set("platform", platformFilter);
      }

      if (!newParams.has("databases")) {
        newParams.set("databases", "all");
      }

      // Only update URL if we've changed something
      if (newParams.toString() !== searchParams.toString()) {
        window.history.replaceState({}, "", `?${newParams.toString()}`);
      }
    }
  }, [
    queryType,
    regionFilter,
    platformFilter,
    connectionFilter,
    searchParams,
    onUpdateConnectionFilter,
  ]);

  // Group databases by region and connection method
  const regionGroups = databases.reduce(
    (groups, db) => {
      const key = `${db.regionLabel}-${db.connectionMethod}`;
      if (!groups[key]) {
        groups[key] = {
          regionLabel: db.regionLabel,
          connectionMethod: db.connectionMethod,
          regionCode: db.regionCode,
          databases: [],
        };
      }
      groups[key].databases.push(db);
      return groups;
    },
    {} as Record<string, RegionGroup>,
  );

  // Define a standard order for AWS regions
  const regionOrder = [
    // Europe
    { region: "Europe Central 1", code: "eu-central-1" }, // Frankfurt (fra1)
    { region: "Europe West 2", code: "eu-west-2" }, // London (lhr1)
    { region: "Europe West 3", code: "eu-west-3" }, // Paris (cdg1)
    { region: "Europe North 1", code: "eu-north-1" }, // Stockholm (arn1)
    { region: "Europe West 1", code: "eu-west-1" }, // Dublin (dub1)
    // US East
    { region: "US East 1", code: "us-east-1" }, // Washington DC (iad1)
    { region: "US East 2", code: "us-east-2" }, // Columbus (cle1)
    // US West
    { region: "US West 1", code: "us-west-1" }, // San Francisco (sfo1)
    { region: "US West 2", code: "us-west-2" }, // Portland (pdx1)
    // Asia East
    { region: "Asia East 1", code: "ap-east-1" }, // Hong Kong (hkg1)
    { region: "Asia Northeast 2", code: "ap-northeast-2" }, // Seoul (icn1)
    { region: "Asia Northeast 1", code: "ap-northeast-1" }, // Tokyo (hnd1)
    { region: "Asia Northeast 3", code: "ap-northeast-3" }, // Osaka (kix1)
    // Asia South/Southeast
    { region: "Asia Southeast 1", code: "ap-southeast-1" }, // Singapore (sin1)
    { region: "Asia Southeast 2", code: "ap-southeast-2" }, // Sydney (syd1)
    { region: "Asia South 1", code: "ap-south-1" }, // Mumbai (bom1)
    // Middle East & Africa
    { region: "Middle East 1", code: "me-south-1" }, // Dubai (dxb1)
    { region: "Africa South 1", code: "af-south-1" }, // Cape Town (cpt1)
    // South America
    { region: "South America East 1", code: "sa-east-1" }, // São Paulo (gru1)
  ];

  // Sort region groups by region label
  const sortedRegionGroups = Object.values(regionGroups).sort((a, b) => {
    const indexA = regionOrder.findIndex(
      (r) => r.code === a.regionCode.toLowerCase(),
    );
    const indexB = regionOrder.findIndex(
      (r) => r.code === b.regionCode.toLowerCase(),
    );

    if (indexA !== indexB) return indexA - indexB;
    // If regions are the same, sort by connection method (http before ws)
    return a.connectionMethod.localeCompare(b.connectionMethod);
  });

  // Filter region groups by connection method
  const filteredRegionGroups = sortedRegionGroups.filter((group) => {
    if (connectionFilter === "all") return true;
    return group.connectionMethod === connectionFilter;
  });

  // Sort functions by their AWS region to match the column ordering
  const sortedFunctions = [...functions].sort((a, b) => {
    const indexA = regionOrder.findIndex(
      (r) => r.code === a.regionCode.toLowerCase(),
    );
    const indexB = regionOrder.findIndex(
      (r) => r.code === b.regionCode.toLowerCase(),
    );
    return indexA - indexB;
  });

  // Helper function to get average latency for a function across all databases in a region group
  const getRegionGroupLatency = (
    functionId: number,
    regionGroup: RegionGroup,
    queryType: "cold" | "hot",
  ) => {
    const validLatencies = regionGroup.databases
      .map((db) => {
        const latency = latencyData[queryType][functionId]?.[db.id];
        // Only include values that are numbers and greater than 0
        return typeof latency === "number" && latency > 0 ? latency : null;
      })
      .filter((latency): latency is number => latency !== null);

    if (validLatencies.length === 0) return null;
    return (
      validLatencies.reduce((sum, latency) => sum + latency, 0) /
      validLatencies.length
    );
  };

  // Format latency value with color coding
  const formatLatency = (latency: number | null, queryType: "cold" | "hot") => {
    if (latency === null)
      return <span className="text-muted-foreground">N/A</span>;

    let colorClass = "text-green-800 dark:text-green-400";
    if (queryType === "cold") {
      if (latency > 200) colorClass = "text-yellow-800 dark:text-yellow-400";
      if (latency > 500) colorClass = "text-orange-800 dark:text-orange-400";
      if (latency > 1000) colorClass = "text-red-800 dark:text-red-400";
    } else {
      if (latency > 100) colorClass = "text-yellow-800 dark:text-yellow-400";
      if (latency > 250) colorClass = "text-orange-800 dark:text-orange-400";
      if (latency > 500) colorClass = "text-red-800 dark:text-red-400";
    }

    return <span className={colorClass}>{latency.toFixed(2)}ms</span>;
  };

  // Check if a region group and function are in the same region
  const isExactSameRegion = (
    regionGroup: RegionGroup,
    fn: Function,
  ): boolean => {
    // Get the first database from the group to check the region code
    // This assumes all databases in a group share the same region code
    const db = regionGroup.databases[0];
    return db && db.regionCode.toLowerCase() === fn.regionCode.toLowerCase();
  };

  // Filter functions by platform, then by region
  const visibleFunctions = (() => {
    const byPlatform =
      platformFilter === "all"
        ? sortedFunctions
        : sortedFunctions.filter((fn) => fn.platform === platformFilter);

    if (regionFilter === "all") return byPlatform;

    const dbRegionCodes = new Set(
      databases.map((db) => db.regionCode.toLowerCase()),
    );
    return byPlatform.filter((fn) =>
      dbRegionCodes.has(fn.regionCode.toLowerCase()),
    );
  })();

  const availablePlatforms = PLATFORM_ORDER.filter((platform) =>
    sortedFunctions.some((fn) => fn.platform === platform),
  );

  // One section per platform, so the table reads as a comparison rather than a
  // single undifferentiated list of regions.
  const platformGroups = availablePlatforms
    .map((platform) => ({
      platform,
      functions: visibleFunctions.filter((fn) => fn.platform === platform),
    }))
    .filter((group) => group.functions.length > 0);

  return (
    <div className="space-y-4">
      {/* Controls sit outside the table's horizontal scroll container so they
          wrap to the viewport instead of scrolling off with the grid. */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center space-x-1">
          <div className="h-3 w-3 rounded-sm bg-green-100 dark:bg-green-900"></div>
          <span className="text-xs text-muted-foreground">
            Same region (recommended)
          </span>
        </div>

        {availablePlatforms.length > 1 && (
          <FilterRow label="Platform">
            <Button
              variant={platformFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setPlatformFilter("all")}
            >
              All Platforms
            </Button>
            {availablePlatforms.map((platform) => (
              <Button
                key={platform}
                variant={platformFilter === platform ? "default" : "outline"}
                size="sm"
                onClick={() => setPlatformFilter(platform as PlatformFilter)}
              >
                {platformLabel(platform)}
              </Button>
            ))}
          </FilterRow>
        )}

        <FilterRow label="Queries">
            <Button
              variant={queryType === "both" ? "default" : "outline"}
              size="sm"
              onClick={() => setQueryType("both")}
            >
              All Queries
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={queryType === "cold" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setQueryType("cold")}
                  >
                    Cold Queries
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    First query against a scaled-to-zero database, including
                    startup time
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={queryType === "hot" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setQueryType("hot")}
                  >
                    Hot Queries
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Query executed when database is already running</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
        </FilterRow>

        <FilterRow label="Function regions">
          <Button
            variant={regionFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setRegionFilter("all")}
          >
            All Function Regions
          </Button>
          <Button
            variant={regionFilter === "matching" ? "default" : "outline"}
            size="sm"
            onClick={() => setRegionFilter("matching")}
          >
            Matching Regions Only
          </Button>
        </FilterRow>

        <FilterRow label="Connection">
          <Button
            variant={connectionFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => handleConnectionFilterChange("all")}
          >
            All Connection Methods
          </Button>
          <Button
            variant={connectionFilter === "http" ? "default" : "outline"}
            size="sm"
            onClick={() => handleConnectionFilterChange("http")}
          >
            HTTP Only
          </Button>
          <Button
            variant={connectionFilter === "ws" ? "default" : "outline"}
            size="sm"
            onClick={() => handleConnectionFilterChange("ws")}
          >
            WebSocket Only
          </Button>
          <Button
            variant={connectionFilter === "tcp" ? "default" : "outline"}
            size="sm"
            onClick={() => handleConnectionFilterChange("tcp")}
          >
            TCP Only
          </Button>
        </FilterRow>
      </div>
      <div className="max-h-[80vh] overflow-x-auto">
        <div className="rounded-md border min-w-full w-fit">
          <Table className="table-auto">
            <TableHeader className="sticky top-0 bg-background z-20">
              <TableRow>
                <TableHead
                  rowSpan={3}
                  className="sticky left-0 bg-background z-30 border-r md:min-w-[120px]"
                >
                  <div className="h-full flex flex-col justify-between">
                    <div className="p-1 text-xs md:text-xs text-muted-foreground text-right">
                      Database Region →
                    </div>
                    <div className="p-1 text-xs md:text-xs text-muted-foreground">
                      Function Region ↓{" "}
                    </div>
                  </div>
                </TableHead>
                <TableHead
                  colSpan={
                    filteredRegionGroups.length * (queryType === "both" ? 2 : 1)
                  }
                  className="text-center border-b bg-muted py-2"
                >
                  <span className="font-bold text-base md:text-lg">
                    Neon Serverless Postgres
                  </span>
                </TableHead>
              </TableRow>
              <TableRow>
                {filteredRegionGroups.map((group, groupIndex) => {
                  return (
                    <TableHead
                      key={`${group.regionLabel}-${group.connectionMethod}`}
                      colSpan={queryType === "both" ? 2 : 1}
                      className={cn(
                        "text-center border-b bg-background",
                        groupIndex !== 0 && "border-l-2 border-l-muted",
                      )}
                    >
                      <div className="font-medium break-words text-xs md:text-sm">
                        {group.regionLabel}
                        <div className="font-normal text-[10px] md:text-xs text-muted-foreground mt-1 break-all">
                          {group.regionCode} via
                          <br />
                          {group.connectionMethod === "tcp" ? (
                            <>
                              pg
                              <br />
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <strong className="bg-purple-300/20 dark:bg-purple-800/20 px-1 rounded">
                                      tcp
                                    </strong>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>
                                      Classic TCP connection using pg Pool with
                                      @vercel/functions attachDatabasePool for
                                      connection reuse
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </>
                          ) : (
                            <>
                              @neondatabase/serverless
                              <br />
                              {group.connectionMethod === "http" ? (
                                <strong>http</strong>
                              ) : (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <strong className="bg-yellow-300/20 dark:bg-yellow-800/20 px-1 rounded">
                                        websocket
                                      </strong>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>
                                        Serverless driver connections over
                                        websocket require more roundtrips to
                                        establish the connection
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
              <TableRow>
                {filteredRegionGroups.flatMap((group) => {
                  const cells = [];

                  if (queryType === "both" || queryType === "cold") {
                    cells.push(
                      <TableHead
                        key={`${group.regionLabel}-${group.connectionMethod}-cold`}
                        className="text-center font-medium text-xs md:text-sm bg-background px-2"
                      >
                        Cold
                      </TableHead>,
                    );
                  }
                  if (queryType === "both" || queryType === "hot") {
                    cells.push(
                      <TableHead
                        key={`${group.regionLabel}-${group.connectionMethod}-hot`}
                        className="text-center font-medium text-xs md:text-sm bg-background px-2"
                      >
                        Hot
                      </TableHead>,
                    );
                  }
                  return cells;
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {platformGroups.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={
                      1 +
                      filteredRegionGroups.length *
                        (queryType === "both" ? 2 : 1)
                    }
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No function regions match the current filters.
                  </TableCell>
                </TableRow>
              )}
              {platformGroups.map((group) => (
                <Fragment key={group.platform}>
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableCell
                      colSpan={
                        1 +
                        filteredRegionGroups.length *
                          (queryType === "both" ? 2 : 1)
                      }
                      className="left-0 bg-muted z-30"
                    >
                      <span className="font-bold text-base md:text-lg">
                        {platformLabel(group.platform)}
                      </span>
                      {regionFilter === "matching" && (
                        <span className="ml-2 text-xs md:text-sm text-muted-foreground">
                          (Showing only regions matching selected databases)
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                  {group.functions.map((fn) => (
                <TableRow key={fn.id}>
                  <TableCell className="sticky left-0 bg-background z-30 border-r">
                    <div className="font-normal text-[10px] md:text-xs">
                      {fn.regionLabel.split(" - ")[0]}
                    </div>
                    <div className="text-[10px] md:text-xs text-muted-foreground">
                      {fn.regionLabel.split(" - ").slice(1).join(" - ")}
                    </div>
                  </TableCell>
                  {filteredRegionGroups.flatMap((group, groupIndex) => {
                    const isSameRegionMatch = isExactSameRegion(group, fn);
                    const cells = [];

                    if (queryType === "both" || queryType === "cold") {
                      cells.push(
                        <TableCell
                          key={`${fn.id}-${group.regionLabel}-${group.connectionMethod}-cold`}
                          className={cn(
                            "text-center text-xs md:text-base",
                            isSameRegionMatch
                              ? "bg-green-100 dark:bg-green-900"
                              : group.connectionMethod === "ws"
                                ? "bg-yellow-300/20 dark:bg-yellow-800/20"
                                : group.connectionMethod === "tcp" &&
                                  "bg-purple-300/20 dark:bg-purple-800/20",
                            groupIndex !== 0 && "border-l-2 border-l-muted",
                          )}
                        >
                          {formatLatency(
                            getRegionGroupLatency(fn.id, group, "cold"),
                            "cold",
                          )}
                        </TableCell>,
                      );
                    }
                    if (queryType === "both" || queryType === "hot") {
                      cells.push(
                        <TableCell
                          key={`${fn.id}-${group.regionLabel}-${group.connectionMethod}-hot`}
                          className={cn(
                            "text-center text-xs md:text-base",
                            isSameRegionMatch
                              ? "bg-green-100 dark:bg-green-900"
                              : group.connectionMethod === "ws"
                                ? "bg-yellow-300/20 dark:bg-yellow-800/20"
                                : group.connectionMethod === "tcp" &&
                                  "bg-purple-300/20 dark:bg-purple-800/20",
                            queryType === "both" && "border-l",
                            groupIndex !== 0 &&
                              queryType !== "both" &&
                              "border-l-2 border-l-muted",
                          )}
                        >
                          {formatLatency(
                            getRegionGroupLatency(fn.id, group, "hot"),
                            "hot",
                          )}
                        </TableCell>,
                      );
                    }
                    return cells;
                  })}
                </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
