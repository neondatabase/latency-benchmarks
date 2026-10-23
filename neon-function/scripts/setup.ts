/**
 * Creates or repairs the Neon Functions platform through @neon/sdk. See
 * ../README.md#setup.
 *
 * `functions` and `databases` rows are updated in place and never recreated:
 * `stats` references both.
 *
 * Required env: NEON_API_KEY, NEON_ORG_ID, CONTROL_PLANE_URL, FUNCTION_SECRET
 */
import { buildFunctionBundle } from "@neon/config-runtime/v1";
import { createNeonClient } from "@neon/sdk";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import {
  AWS_REGIONS,
  CONNECTION_METHODS,
  NEON_FUNCTION_REGIONS,
  benchProjectName,
  hostProjectName,
  type ConnectionMethod,
  type NeonFunctionRegion,
} from "../src/regions";

const SLUG = "latencybench";
const RUNTIME = "nodejs24";
const TRIGGER_NAME = "benchmark";
/** Same minutes as the Vercel crons, so both platforms measure in the same window. */
const TRIGGER_CRON = "17-59/15 * * * *";
const DEPLOY_TIMEOUT_MS = 10 * 60_000;

const apiKey = required("NEON_API_KEY");
const orgId = required("NEON_ORG_ID");
const controlPlaneUrl = required("CONTROL_PLANE_URL");
const functionSecret = required("FUNCTION_SECRET");

const neon = createNeonClient({ apiKey, orgId, throwOnError: true });
const db = new Pool({ connectionString: controlPlaneUrl, max: 4 });
const source = resolve(dirname(fileURLToPath(import.meta.url)), "../src/index.ts");

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function selectedRegions(): NeonFunctionRegion[] {
  const requested = process.argv.slice(2);
  if (requested.length === 0) return [...NEON_FUNCTION_REGIONS];
  const unknown = requested.filter(
    (code) => !NEON_FUNCTION_REGIONS.some((region) => region.code === code),
  );
  if (unknown.length > 0) {
    throw new Error(
      `not a Neon Functions region: ${unknown.join(", ")} (known: ${NEON_FUNCTION_REGIONS.map((r) => r.code).join(", ")})`,
    );
  }
  return NEON_FUNCTION_REGIONS.filter((region) => requested.includes(region.code));
}

async function listOrgProjects(): Promise<Map<string, string>> {
  const projects = await neon.projects.list({ org_id: orgId }).all();
  return new Map(projects.map((project) => [project.name, project.id]));
}

/**
 * Returns the project's direct (non-pooled) connection string. The Vercel
 * benchmark databases are recorded the same way, so both platforms measure
 * like for like.
 */
async function ensureProject(
  name: string,
  regionCode: string,
  existing: Map<string, string>,
): Promise<{ projectId: string; connectionUri: string; created: boolean }> {
  const known = existing.get(name);
  if (known) {
    const connectionUri = await neon.postgres.connectionString({
      projectId: known,
      databaseName: "neondb",
      roleName: "neondb_owner",
      pooled: false,
    });
    return { projectId: known, connectionUri, created: false };
  }

  const { project, connectionString } = await neon.projects.createAndConnect({
    name,
    region_id: `aws-${regionCode}`,
    pg_version: 17,
    org_id: orgId,
    history_retention_seconds: 86400,
    default_endpoint_settings: {
      autoscaling_limit_min_cu: 1,
      autoscaling_limit_max_cu: 1,
      suspend_timeout_seconds: 0,
    },
    branch: { name: "main", database_name: "neondb", role_name: "neondb_owner" },
    pooled: false,
  });
  existing.set(name, project.id);
  return { projectId: project.id, connectionUri: connectionString, created: true };
}

function withSslMode(uri: string): string {
  const url = new URL(uri);
  url.search = "sslmode=require";
  return url.toString();
}

async function upsertFunctionRow(region: NeonFunctionRegion): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    `SELECT id FROM functions WHERE platform = 'neon' AND region_code = $1`,
    [region.code],
  );
  if (rows[0]) {
    await db.query(`UPDATE functions SET region_label = $2 WHERE id = $1`, [
      rows[0].id,
      region.label,
    ]);
    return rows[0].id;
  }
  const inserted = await db.query<{ id: number }>(
    `INSERT INTO functions (name, region_code, region_label, platform)
     VALUES ('Neon Functions', $1, $2, 'neon') RETURNING id`,
    [region.code, region.label],
  );
  return inserted.rows[0].id;
}

async function upsertDatabaseRow(
  functionId: number,
  target: (typeof AWS_REGIONS)[number],
  method: ConnectionMethod,
  connectionUrl: string,
  projectId: string,
) {
  await db.query(
    `INSERT INTO databases
       (name, provider, region_code, region_label, function_id, connection_method, connection_url, neon_project_id)
     VALUES ('Neon Postgres', 'neon', $1, $2, $3, $4, $5, $6)
     ON CONFLICT (function_id, connection_method, region_code)
     DO UPDATE SET connection_url = EXCLUDED.connection_url,
                   neon_project_id = EXCLUDED.neon_project_id`,
    [target.code, target.label, functionId, method, connectionUrl, projectId],
  );
}

async function deployFunction(
  projectId: string,
  branchId: string,
  region: NeonFunctionRegion,
): Promise<string> {
  const environment = {
    CONTROL_PLANE_URL: controlPlaneUrl,
    FUNCTION_SECRET: functionSecret,
    FUNCTION_REGION: region.code,
  };
  const bundle = await buildFunctionBundle({
    slug: SLUG,
    name: "Latency benchmark worker",
    source,
    env: environment,
    runtime: RUNTIME,
    bundler: "esbuild",
  });
  // Copy into a plain ArrayBuffer so the File constructor accepts it without
  // widening to SharedArrayBuffer.
  const zip = new ArrayBuffer(bundle.byteLength);
  new Uint8Array(zip).set(bundle);

  await neon.functions.deploy({
    projectId,
    branchId,
    slug: SLUG,
    zip: new File([zip], "function.zip", { type: "application/zip" }),
    runtime: RUNTIME,
    environment: JSON.stringify(environment),
  });

  const deadline = Date.now() + DEPLOY_TIMEOUT_MS;
  for (;;) {
    const fn = await neon.functions.get({ projectId, branchId, slug: SLUG });
    const deployment = fn.current_deployment;
    if (deployment?.status === "completed") return fn.invocation_url;
    if (deployment?.status === "failed") {
      throw new Error(`deployment ${deployment.id} failed: ${deployment.error ?? "no error reported"}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for deployment (last status: ${deployment?.status})`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

async function ensureTrigger(projectId: string, branchId: string): Promise<string> {
  const triggers = await neon.triggers.list({ projectId, branchId });
  const existing = triggers.find((trigger) => trigger.name === TRIGGER_NAME);
  if (!existing) {
    const trigger = await neon.triggers.create({
      projectId,
      branchId,
      type: "schedule",
      name: TRIGGER_NAME,
      function_slug: SLUG,
      schedule: { cron: TRIGGER_CRON },
      enabled: true,
    });
    return `created (next run ${trigger.next_run_at})`;
  }
  if (existing.type !== "schedule") {
    throw new Error(`trigger "${TRIGGER_NAME}" exists but is ${existing.type}, not schedule`);
  }
  if (
    existing.function_slug === SLUG &&
    existing.schedule.cron === TRIGGER_CRON &&
    existing.function_path === "/" &&
    existing.enabled
  ) {
    return `unchanged (next run ${existing.next_run_at})`;
  }
  const trigger = await neon.triggers.update({
    projectId,
    branchId,
    triggerId: existing.trigger_id,
    type: "schedule",
    function_slug: SLUG,
    function_path: "/",
    schedule: { cron: TRIGGER_CRON },
    enabled: true,
  });
  return `updated (next run ${trigger.next_run_at})`;
}

async function setUpRegion(region: NeonFunctionRegion, existing: Map<string, string>) {
  console.log(`\n${region.code}`);

  const host = await ensureProject(hostProjectName(region.code), region.code, existing);
  const branch = await neon.branches.getDefault({ projectId: host.projectId });
  console.log(`  host project ${host.projectId} ${host.created ? "created" : "reused"}`);

  const functionId = await upsertFunctionRow(region);
  console.log(`  functions row id=${functionId}`);

  let created = 0;
  for (const target of AWS_REGIONS) {
    for (const method of CONNECTION_METHODS) {
      const name = benchProjectName(region.code, target.code, method);
      const project = await ensureProject(name, target.code, existing);
      await upsertDatabaseRow(
        functionId,
        target,
        method,
        withSslMode(project.connectionUri),
        project.projectId,
      );
      if (project.created) created++;
    }
  }
  const { rows } = await db.query<{ count: string }>(
    `SELECT count(*) FROM databases WHERE function_id = $1`,
    [functionId],
  );
  console.log(`  benchmark databases: ${rows[0].count} (${created} projects created)`);

  const url = await deployFunction(host.projectId, branch.id, region);
  console.log(`  deployed ${url}`);

  console.log(`  trigger ${await ensureTrigger(host.projectId, branch.id)}`);
}

async function main() {
  const regions = selectedRegions();
  const existing = await listOrgProjects();
  console.log(`projects in org: ${existing.size}`);
  for (const region of regions) {
    await setUpRegion(region, existing);
  }
}

main()
  .then(() => db.end())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error("setup failed:", error);
    await db.end().catch(() => {});
    process.exit(1);
  });
