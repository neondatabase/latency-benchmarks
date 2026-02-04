"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  Database as DatabaseIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import type { PublicDatabase } from "@/lib/schema";

interface DatabaseSidebarProps {
  databases: PublicDatabase[];
  selectedDatabases: number[];
  onToggleDatabase: (dbId: number) => void;
  onUpdateConnectionFilter?: (filter: string) => void;
}

interface RegionGroup {
  regionLabel: string;
  connectionMethod: string;
  databases: PublicDatabase[];
}

export function DatabaseSidebar({
  databases,
  selectedDatabases,
  onToggleDatabase,
  onUpdateConnectionFilter,
}: DatabaseSidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const searchParams = useSearchParams();
  const connectionFilter = searchParams.get("connection") || "http";

  // Effect to sync databases selection with connection filter
  useEffect(() => {
    if (!onUpdateConnectionFilter) return;

    // Skip this effect if we're showing all connection methods
    if (connectionFilter === "all") return;

    // Find all databases that don't match the current connection filter
    const mismatchedDatabases = databases.filter(
      (db) =>
        db.connectionMethod !== connectionFilter &&
        selectedDatabases.includes(db.id),
    );

    // If there are any selected databases that don't match the filter, deselect them
    if (mismatchedDatabases.length > 0) {
      mismatchedDatabases.forEach((db) => {
        onToggleDatabase(db.id);
      });
    }
  }, [
    connectionFilter,
    databases,
    selectedDatabases,
    onToggleDatabase,
    onUpdateConnectionFilter,
  ]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth < 768) {
        setIsOpen(false);
      }
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // First group by provider
  const groupedByProvider = databases.reduce(
    (acc, db) => {
      const providerName =
        db.provider === "neon" ? "Neon Postgres" : db.provider;
      if (!acc[providerName]) {
        acc[providerName] = [];
      }
      acc[providerName].push(db);
      return acc;
    },
    {} as Record<string, PublicDatabase[]>,
  );

  // For Neon Postgres, first group by connection method, then by region
  const processedGroups = Object.entries(groupedByProvider).reduce(
    (acc, [provider, dbs]) => {
      if (provider === "Neon Postgres") {
        // First group by connection method
        const connectionMethodGroups = dbs.reduce(
          (groups, db) => {
            const methodKey = db.connectionMethod;
            if (!groups[methodKey]) {
              groups[methodKey] = [];
            }
            groups[methodKey].push(db);
            return groups;
          },
          {} as Record<string, PublicDatabase[]>,
        );

        // Then for each connection method, group by region
        acc[provider] = Object.entries(connectionMethodGroups)
          .map(([method, methodDbs]) => {
            // Group by regions within this connection method
            const regionGroups = methodDbs.reduce(
              (groups, db) => {
                const key = db.regionLabel;
                if (!groups[key]) {
                  groups[key] = {
                    regionLabel: db.regionLabel,
                    connectionMethod: method,
                    databases: [],
                  };
                }
                groups[key].databases.push(db);
                return groups;
              },
              {} as Record<string, RegionGroup>,
            );

            // Return the connection method with its region groups
            return {
              connectionMethod: method,
              regions: Object.values(regionGroups).sort((a, b) =>
                a.regionLabel.localeCompare(b.regionLabel),
              ),
            };
          })
          .sort((a, b) => a.connectionMethod.localeCompare(b.connectionMethod)); // Sort connection methods (http first)
      } else {
        // For non-Neon databases, keep original structure
        acc[provider] = dbs;
      }
      return acc;
    },
    {} as Record<string, any>,
  );

  // When a database is checked that doesn't match the current connection filter,
  // update the connection filter to 'all'
  const handleDatabaseToggle = (dbId: number) => {
    const db = databases.find((d) => d.id === dbId);

    if (!db) return; // Exit if database not found

    // Check if the database is already selected
    const isSelected = selectedDatabases.includes(db.id);

    // If database is not currently selected and doesn't match the connection filter
    if (
      !isSelected &&
      db.connectionMethod !== connectionFilter &&
      connectionFilter !== "all"
    ) {
      // Update connection filter to 'all' before toggling the database
      if (onUpdateConnectionFilter) {
        onUpdateConnectionFilter("all");

        // Give a small delay to allow the connection filter change to take effect
        // then toggle the database selection
        setTimeout(() => {
          onToggleDatabase(dbId);
        }, 0);

        // Return early to prevent the immediate toggle below
        return;
      }
    }

    // Toggle the database for all other cases
    onToggleDatabase(dbId);
  };

  // Update checkbox group handling similarly
  const handleGroupCheckboxChange = (
    checked: boolean | "indeterminate",
    group: RegionGroup,
  ) => {
    // If we're selecting databases that don't match the current filter, switch to 'all'
    if (
      checked &&
      group.connectionMethod !== connectionFilter &&
      connectionFilter !== "all"
    ) {
      if (onUpdateConnectionFilter) {
        onUpdateConnectionFilter("all");

        // After switching connection filter, toggle all databases in the group
        setTimeout(() => {
          group.databases.forEach((db) => {
            if (checked && !selectedDatabases.includes(db.id)) {
              onToggleDatabase(db.id);
            } else if (!checked && selectedDatabases.includes(db.id)) {
              onToggleDatabase(db.id);
            }
          });
        }, 0);

        // Return early
        return;
      }
    }

    // Handle normal case
    group.databases.forEach((db) => {
      if (checked && !selectedDatabases.includes(db.id)) {
        onToggleDatabase(db.id);
      } else if (!checked && selectedDatabases.includes(db.id)) {
        onToggleDatabase(db.id);
      }
    });
  };

  return (
    <>
      {/* Mobile overlay */}
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "fixed z-50 h-full border-r bg-background transition-all duration-300 md:relative md:z-0",
          isOpen ? "w-72" : "w-0 md:w-16 overflow-hidden",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b px-4">
          <div
            className={cn("flex items-center gap-2", !isOpen && "md:hidden")}
          >
            <DatabaseIcon className="h-5 w-5" />
            <span className="font-semibold">Target Databases</span>
          </div>
          {/* Toggle button to close sidebar */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(!isOpen && "hidden md:hidden")}
            onClick={() => setIsOpen(false)}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          {/* Toggle button to open sidebar - visible when collapsed on desktop */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(isOpen && "hidden", "md:flex")}
            onClick={() => setIsOpen(true)}
          >
            <DatabaseIcon className="h-5 w-5" />
          </Button>
        </div>

        <ScrollArea className="h-[calc(100vh-4rem)]">
          <div className="p-4">
            <div className={cn("mb-4", !isOpen && "md:hidden")}>
              <p className="text-sm text-muted-foreground">
                Select databases to compare
              </p>
            </div>

            <div className={cn("mb-4", !isOpen && "md:hidden")}>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  // Get all database IDs
                  const allDatabaseIds = databases.map((db) => db.id);

                  // Check if all databases are currently selected
                  const allSelected = allDatabaseIds.every((id) =>
                    selectedDatabases.includes(id),
                  );

                  if (allSelected) {
                    // Direct approach: clear the selectedDatabases array by toggling every selected database
                    [...selectedDatabases].forEach((id) => {
                      onToggleDatabase(id);
                    });
                  } else {
                    // Select all databases that aren't already selected
                    allDatabaseIds.forEach((id) => {
                      if (!selectedDatabases.includes(id)) {
                        onToggleDatabase(id);
                      }
                    });
                  }
                }}
              >
                {selectedDatabases.length === databases.length
                  ? "Deselect All"
                  : "Select All"}
              </Button>
            </div>

            {Object.entries(processedGroups).map(([provider, items]) => (
              <div key={provider} className="mb-6">
                <h3
                  className={cn(
                    "mb-2 text-sm font-medium text-muted-foreground",
                    !isOpen && "md:hidden",
                  )}
                >
                  {provider}
                </h3>
                <div className="space-y-1">
                  {provider === "Neon Postgres"
                    ? // Render organized by connection method for Neon Postgres
                      (
                        items as Array<{
                          connectionMethod: string;
                          regions: RegionGroup[];
                        }>
                      ).map((methodGroup, idx) => (
                        <div
                          key={methodGroup.connectionMethod}
                          className="mb-3"
                        >
                          <h4
                            className={cn(
                              "px-2 py-1 text-xs font-semibold text-foreground/70 bg-muted rounded-sm mb-1 flex items-center",
                              !isOpen && "md:hidden",
                            )}
                          >
                            @neondatabase/serverless{" "}
                            {methodGroup.connectionMethod === "http"
                              ? "http"
                              : methodGroup.connectionMethod === "tcp"
                                ? "tcp"
                                : "websocket"}
                          </h4>
                          {methodGroup.regions.map((group) => (
                            <div
                              key={`${group.regionLabel}-${group.connectionMethod}`}
                              className={cn(
                                "flex items-center space-x-2 rounded-md px-2 py-2 hover:bg-accent",
                                group.databases.some((db) =>
                                  selectedDatabases.includes(db.id),
                                ) && "bg-accent/50",
                              )}
                            >
                              <Checkbox
                                id={`${group.regionLabel}-${group.connectionMethod}`}
                                checked={group.databases.every((db) =>
                                  selectedDatabases.includes(db.id),
                                )}
                                onCheckedChange={(checked) =>
                                  handleGroupCheckboxChange(checked, group)
                                }
                              />
                              <div
                                className={cn("flex-1", !isOpen && "md:hidden")}
                              >
                                <label
                                  htmlFor={`${group.regionLabel}-${group.connectionMethod}`}
                                  className="flex flex-col cursor-pointer"
                                >
                                  <span className="text-sm font-medium">
                                    {group.regionLabel}
                                  </span>
                                </label>
                              </div>
                            </div>
                          ))}
                          {idx <
                            (
                              items as Array<{
                                connectionMethod: string;
                                regions: RegionGroup[];
                              }>
                            ).length -
                              1 && (
                            <div className="my-2 px-2">
                              <Separator className="opacity-50" />
                            </div>
                          )}
                        </div>
                      ))
                    : // Render regular databases for other providers
                      (items as PublicDatabase[]).map((db) => (
                        <div
                          key={db.id}
                          className={cn(
                            "flex items-center space-x-2 rounded-md px-2 py-2 hover:bg-accent",
                            selectedDatabases.includes(db.id) && "bg-accent/50",
                          )}
                        >
                          <Checkbox
                            id={db.id.toString()}
                            checked={selectedDatabases.includes(db.id)}
                            onCheckedChange={() => handleDatabaseToggle(db.id)}
                          />
                          <div className={cn("flex-1", !isOpen && "md:hidden")}>
                            <label
                              htmlFor={db.id.toString()}
                              className="flex flex-col cursor-pointer"
                            >
                              <span className="text-sm font-medium">
                                {db.name}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {db.regionLabel}
                              </span>
                            </label>
                          </div>
                        </div>
                      ))}
                </div>
                <Separator className="my-4" />
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Toggle button for mobile */}
      <Button
        variant="outline"
        size="icon"
        className={cn("fixed left-4 top-4 z-40 md:hidden", isOpen && "hidden")}
        onClick={() => setIsOpen(true)}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </>
  );
}
