import "server-only";

import { pgTable, varchar, integer } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { neon } from "@neondatabase/serverless";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import {
  NeonPostgrestClient,
  fetchWithToken,
} from "@neondatabase/postgrest-js";
import { BENCH_LIMIT, BENCH_TABLE } from "./connection-methods";

/**
 * Clients for the connection-method benchmark. These talk to the *benchmark*
 * database, which is a different Neon project from the control plane that
 * backs the regional latency grid — hence the BENCH_ prefixes.
 *
 * Everything here is created once at module scope so a warm Vercel function
 * reuses it, which is the configuration these methods are meant to represent.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export const employees = pgTable(BENCH_TABLE, {
  empNo: integer("emp_no").primaryKey(),
  firstName: varchar("first_name", { length: 255 }),
  lastName: varchar("last_name", { length: 255 }),
});

const selectColumns = {
  empNo: employees.empNo,
  firstName: employees.firstName,
  lastName: employees.lastName,
};

let httpDb: ReturnType<typeof drizzle> | undefined;
function getHttpDb() {
  if (!httpDb) httpDb = drizzle(neon(required("BENCH_DATABASE_URL")));
  return httpDb;
}

let poolDb: ReturnType<typeof drizzlePg> | undefined;
function getPoolDb() {
  if (!poolDb) {
    // Direct TCP rather than the pooler endpoint: this method exists to
    // represent an app managing its own connection pool.
    const pool = new Pool({
      connectionString: required("BENCH_DATABASE_URL_UNPOOLED"),
      max: 5,
    });
    attachDatabasePool(pool);
    poolDb = drizzlePg(pool);
  }
  return poolDb;
}

/**
 * Neon Auth issues short-lived JWTs (~15 minutes), so the token is cached and
 * refreshed shortly before it expires. Without the cache every sample would be
 * measuring a sign-in round trip rather than the Data API query.
 *
 * The browser-side client uses @neondatabase/neon-js, which does this itself.
 * Server-side that flow expects Next.js request context (cookies, Origin), so
 * here the exchange is done directly and handed to the same Data API client.
 */
const TOKEN_REFRESH_MARGIN_MS = 60_000;
let cachedToken: { jwt: string; expiresAt: number } | undefined;
let inFlightToken: Promise<string> | undefined;

async function fetchJwt(): Promise<string> {
  const authUrl = required("BENCH_NEON_AUTH_URL");
  // Better Auth rejects requests without an Origin as a CSRF precaution.
  const origin = new URL(authUrl).origin;

  const signIn = await fetch(`${authUrl}/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({
      email: required("BENCH_NEON_AUTH_EMAIL"),
      password: required("BENCH_NEON_AUTH_PASSWORD"),
    }),
  });
  if (!signIn.ok) {
    throw new Error(`Neon Auth sign-in failed: ${signIn.status}`);
  }
  const cookie = signIn.headers.getSetCookie().join("; ");

  const tokenResponse = await fetch(`${authUrl}/token`, {
    headers: { cookie, origin },
  });
  if (!tokenResponse.ok) {
    throw new Error(`Neon Auth token exchange failed: ${tokenResponse.status}`);
  }
  const { token } = (await tokenResponse.json()) as { token?: string };
  if (!token) throw new Error("Neon Auth returned no token");

  const payload = JSON.parse(
    Buffer.from(token.split(".")[1], "base64url").toString(),
  ) as { exp?: number };
  cachedToken = {
    jwt: token,
    expiresAt: payload.exp ? payload.exp * 1000 : Date.now() + 10 * 60_000,
  };
  return token;
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()) {
    return cachedToken.jwt;
  }
  if (!inFlightToken) {
    inFlightToken = fetchJwt().finally(() => {
      inFlightToken = undefined;
    });
  }
  return inFlightToken;
}

let dataApi: NeonPostgrestClient | undefined;
function getDataApi() {
  if (!dataApi) {
    dataApi = new NeonPostgrestClient({
      dataApiUrl: required("BENCH_NEON_DATA_API_URL"),
      options: { global: { fetch: fetchWithToken(getAccessToken) } },
    });
  }
  return dataApi;
}

export async function queryViaServerless() {
  await getHttpDb().select(selectColumns).from(employees).limit(BENCH_LIMIT);
}

export async function queryViaPool() {
  await getPoolDb().select(selectColumns).from(employees).limit(BENCH_LIMIT);
}

export async function queryViaDataApi() {
  const { error } = await getDataApi()
    .from(BENCH_TABLE)
    .select("emp_no,first_name,last_name")
    .limit(BENCH_LIMIT);
  if (error) throw new Error(error.message);
}

/**
 * Mints a Data API JWT for the browser.
 *
 * The browser cannot sign in to Neon Auth itself: Better Auth only trusts
 * origins it is configured with, and this app is served from neon.com. Doing
 * the exchange here also keeps the demo credentials out of the client bundle.
 * The measured path is unaffected — the browser still queries the Data API
 * directly, and this token is fetched once during warm-up.
 */
export async function mintBrowserToken() {
  const jwt = await getAccessToken();
  return { token: jwt, expiresAt: cachedToken?.expiresAt ?? Date.now() };
}
