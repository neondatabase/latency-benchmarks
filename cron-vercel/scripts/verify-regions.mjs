#!/usr/bin/env node
/**
 * Asserts that the built functions are pinned to the regions vercel.json declares.
 *
 * A route running in the wrong region fails only at runtime, and the failure
 * looks like missing data rather than a broken deploy, so this runs in CI
 * between `vercel build` and `vercel deploy`.
 *
 * It checks both directions:
 *   - every built function matches its declared region
 *   - every declared route actually produced a function (catches a typo in a
 *     vercel.json path, which would otherwise silently leave a route unpinned)
 *
 * Usage: node scripts/verify-regions.mjs [outputDir]
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const outputDir = process.argv[2] ?? ".vercel/output/functions/api";
const config = JSON.parse(readFileSync("vercel.json", "utf8"));

const isCI = Boolean(process.env.GITHUB_ACTIONS);
const fail = (message) => {
  console.error(isCI ? `::error::${message}` : `FAIL  ${message}`);
};

if (!existsSync(outputDir)) {
  fail(`build output not found at ${outputDir} - run \`vercel build\` first`);
  process.exit(1);
}

/** `app/api/fra1/route.ts` -> `fra1` */
const routeName = (path) => path.replace(/^app\/api\//, "").replace(/\/route\.tsx?$/, "");

const expected = new Map(
  Object.entries(config.functions ?? {}).map(([path, cfg]) => [
    routeName(path),
    cfg.regions?.[0],
  ]),
);

const built = readdirSync(outputDir)
  .filter((entry) => entry.endsWith(".func"))
  .map((entry) => entry.replace(/\.func$/, ""));

let failed = false;

for (const name of built) {
  // Next.js emits a parallel `<route>.rsc.func` for each route.
  const route = name.replace(/\.rsc$/, "");
  const want = expected.get(route);

  if (want === undefined) {
    fail(`${name} was built but vercel.json declares no region for it`);
    failed = true;
    continue;
  }

  const config = JSON.parse(
    readFileSync(join(outputDir, `${name}.func`, ".vc-config.json"), "utf8"),
  );
  const got = config.regions?.[0] ?? "unset";

  if (got !== want) {
    fail(`${name} is pinned to '${got}', expected '${want}'`);
    failed = true;
  } else {
    console.log(`ok    ${name} -> ${got}`);
  }
}

for (const [route, want] of expected) {
  if (!built.includes(route)) {
    fail(`vercel.json declares ${route} (${want}) but no function was built for it`);
    failed = true;
  }
}

const crons = new Set((config.crons ?? []).map((c) => c.path.replace(/^\/api\//, "")));
for (const route of expected.keys()) {
  if (!crons.has(route)) {
    fail(`${route} has a region but no cron schedule, so it will never run`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log(`\nall ${built.length} functions pinned as declared`);
