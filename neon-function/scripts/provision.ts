/**
 * Provisions the Neon Functions platform in the control plane:
 *
 *   1. registers the `neon` function row (one region during beta)
 *   2. creates one benchmark Neon project per target region and connection method
 *   3. upserts the matching `databases` rows
 *
 * Safe to re-run. Projects are matched by name and reused, and database rows are
 * upserted on (function_id, connection_method, region_code), so an interrupted
 * run can simply be repeated.
 *
 * Required env: NEON_API_KEY, NEON_ORG_ID, CONTROL_PLANE_URL
 */
import { createNeonClient, raw } from "@neon/sdk";
import { Pool } from "pg";
import {
  AWS_REGIONS,
  NEON_FUNCTION_REGION,
  benchProjectName,
  targetsForRegion,
  type ConnectionMethod,
} from "../src/regions";

const apiKey = required("NEON_API_KEY");
const orgId = required("NEON_ORG_ID");
const controlPlaneUrl = required("CONTROL_PLANE_URL");

const neon = createNeonClient({ apiKey });
const db = new Pool({ connectionString: controlPlaneUrl, max: 4 });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function listOrgProjects(): Promise<Map<string, string>> {
  const byName = new Map<string, string>();
  const { data, error } = await neon.projects.list({ org_id: orgId }).all();
  if (error) throw error;
  for (const project of data) byName.set(project.name, project.id);
  return byName;
}

async function ensureFunctionRow(): Promise<number> {
  const existing = await db.query<{ id: number }>(
    `SELECT id FROM functions WHERE platform = 'neon' AND region_code = $1`,
    [NEON_FUNCTION_REGION.code],
  );
  if (existing.rows[0]) {
    console.log(`function row already present (id=${existing.rows[0].id})`);
    return existing.rows[0].id;
  }

  const inserted = await db.query<{ id: number }>(
    `INSERT INTO functions (name, region_code, region_label, platform)
     VALUES ('Neon Functions', $1, $2, 'neon') RETURNING id`,
    [NEON_FUNCTION_REGION.code, NEON_FUNCTION_REGION.label],
  );
  console.log(`created function row id=${inserted.rows[0].id}`);
  return inserted.rows[0].id;
}

/**
 * The stored URL is the direct (non-pooled) one, matching how the Vercel
 * benchmark databases are recorded, so the two platforms measure like for like.
 */
async function connectionUriFor(projectId: string): Promise<string> {
  const { data, error } = await raw.getConnectionUri({
    client: neon.client,
    path: { project_id: projectId },
    query: { database_name: "neondb", role_name: "neondb_owner" },
  });
  if (error) throw error;
  if (!data?.uri) throw new Error(`no connection uri for project ${projectId}`);
  return data.uri;
}

async function ensureBenchProject(
  name: string,
  regionCode: string,
  existing: Map<string, string>,
): Promise<{ projectId: string; connectionUri: string; reused: boolean }> {
  const known = existing.get(name);
  if (known) {
    return {
      projectId: known,
      connectionUri: await connectionUriFor(known),
      reused: true,
    };
  }

  const { data, error } = await neon.projects.createAndConnect(
    {
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
      branch: {
        name: "main",
        database_name: "neondb",
        role_name: "neondb_owner",
      },
    },
    { pooled: false },
  );
  if (error) throw error;

  existing.set(name, data.project.id);
  return {
    projectId: data.project.id,
    connectionUri: data.connectionString,
    reused: false,
  };
}

function withSslMode(uri: string): string {
  const url = new URL(uri);
  url.search = "sslmode=require";
  return url.toString();
}

async function upsertDatabaseRow(
  functionId: number,
  regionCode: string,
  regionLabel: string,
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
    [regionCode, regionLabel, functionId, method, connectionUrl, projectId],
  );
}

async function main() {
  const functionId = await ensureFunctionRow();
  const existing = await listOrgProjects();
  console.log(`projects already in org: ${existing.size}`);

  let created = 0;
  let reused = 0;

  for (const region of AWS_REGIONS) {
    for (const method of targetsForRegion(region.code)) {
      const name = benchProjectName(region.code, method);
      const project = await ensureBenchProject(name, region.code, existing);
      project.reused ? reused++ : created++;

      await upsertDatabaseRow(
        functionId,
        region.code,
        region.label,
        method,
        withSslMode(project.connectionUri),
        project.projectId,
      );
      console.log(`  ${project.reused ? "reused " : "created"} ${name}`);
    }
  }

  const { rows } = await db.query<{ count: string }>(
    `SELECT count(*) FROM databases WHERE function_id = $1`,
    [functionId],
  );
  console.log(
    `\ndone: created=${created} reused=${reused}; function ${functionId} now has ${rows[0].count} databases`,
  );
}

main()
  .then(() => db.end())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error("provision failed:", error);
    await db.end().catch(() => {});
    process.exit(1);
  });
