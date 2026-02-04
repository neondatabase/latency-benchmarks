import {
  timestamp,
  pgTable,
  varchar,
  integer,
  serial,
  decimal,
  pgEnum,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Create enums
export const queryTypeEnum = pgEnum("query_type", ["cold", "hot"]);
export const platformEnum = pgEnum("platform", ["vercel"]);
export const connectionMethodEnum = pgEnum("connection_method", [
  "http",
  "ws",
  "tcp",
]);

// Databases table
export const databases = pgTable(
  "databases",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    provider: varchar("provider", { length: 50 }).notNull(),
    regionCode: varchar("region_code", { length: 50 }).notNull(),
    regionLabel: varchar("region_label", { length: 255 }).notNull(),
    functionId: integer("function_id")
      .references(() => functions.id)
      .notNull(),
    connectionMethod: connectionMethodEnum("connection_method").notNull(),
    connectionUrl: varchar("connection_url", { length: 255 }).notNull(),
    neonProjectId: varchar("neon_project_id", { length: 255 }).notNull(),
  },
  (table) => {
    return {
      uniqueFunctionConnectionRegion: unique().on(
        table.functionId,
        table.connectionMethod,
        table.regionCode,
      ),
    };
  },
);

// Functions table
export const functions = pgTable("functions", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  regionCode: varchar("region_code", { length: 50 }).notNull(),
  regionLabel: varchar("region_label", { length: 255 }).notNull(),
  platform: platformEnum("platform").notNull(),
});

// Stats table
export const stats = pgTable("stats", {
  id: serial("id").primaryKey(),
  dateTime: timestamp("date_time").notNull(),
  functionId: integer("function_id")
    .references(() => functions.id)
    .notNull(),
  databaseId: integer("database_id")
    .references(() => databases.id)
    .notNull(),
  latencyMs: decimal("latency_ms", { precision: 10, scale: 2 }).notNull(),
  queryType: queryTypeEnum("query_type").notNull(),
});

// Zod Schemas for type inference and validation
export const insertDatabaseSchema = createInsertSchema(databases);
export const selectDatabaseSchema = createSelectSchema(databases);

export const insertFunctionSchema = createInsertSchema(functions);
export const selectFunctionSchema = createSelectSchema(functions);

export const insertStatSchema = createInsertSchema(stats);
export const selectStatSchema = createSelectSchema(stats);

// TypeScript types
export type Database = z.infer<typeof selectDatabaseSchema>;
export type NewDatabase = z.infer<typeof insertDatabaseSchema>;
export type PublicDatabase = Omit<Database, "connectionUrl" | "neonProjectId">;

export type Function = z.infer<typeof selectFunctionSchema>;
export type NewFunction = z.infer<typeof insertFunctionSchema>;

export type Stat = z.infer<typeof selectStatSchema>;
export type NewStat = z.infer<typeof insertStatSchema>;

// Query type enum type
export type QueryType = "cold" | "hot";
