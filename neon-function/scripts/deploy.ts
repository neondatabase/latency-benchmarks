/**
 * Bundles and deploys the benchmark function to its Neon branch with @neon/sdk,
 * then polls until the deployment is live and prints the invocation URL.
 *
 * Required env: NEON_API_KEY, NEON_FUNCTION_PROJECT_ID, NEON_FUNCTION_BRANCH_ID,
 *               CONTROL_PLANE_URL, FUNCTION_SECRET
 */
import { createNeonClient } from "@neon/sdk";
import { buildFunctionBundle } from "@neon/config-runtime/v1";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const SLUG = "latencybench";
const RUNTIME = "nodejs24";
const POLL_TIMEOUT_MS = 10 * 60_000;

const apiKey = required("NEON_API_KEY");
const projectId = required("NEON_FUNCTION_PROJECT_ID");
const branchId = required("NEON_FUNCTION_BRANCH_ID");
const controlPlaneUrl = required("CONTROL_PLANE_URL");
const functionSecret = required("FUNCTION_SECRET");

const neon = createNeonClient({ apiKey });
const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, "../src/index.ts");

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const environment = {
    CONTROL_PLANE_URL: controlPlaneUrl,
    FUNCTION_SECRET: functionSecret,
  };

  console.log(`bundling ${source}`);
  const bundle = await buildFunctionBundle({
    slug: SLUG,
    name: "Latency benchmark worker",
    source,
    env: environment,
    runtime: RUNTIME,
  });

  // Copy into a plain ArrayBuffer so the File constructor accepts it without
  // widening to SharedArrayBuffer.
  const zipBuffer = new ArrayBuffer(bundle.byteLength);
  new Uint8Array(zipBuffer).set(bundle);
  console.log(`bundle size: ${(bundle.byteLength / 1024).toFixed(1)} KiB`);

  const { error } = await neon.functions.deploy(projectId, branchId, SLUG, {
    zip: new File([zipBuffer], "function.zip", { type: "application/zip" }),
    runtime: RUNTIME,
    environment: JSON.stringify(environment),
  });
  if (error) throw error;

  console.log("deployment accepted, waiting for build...");
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    const { data, error: getError } = await neon.functions.get(
      projectId,
      branchId,
      SLUG,
    );
    if (getError) throw getError;

    const status = data.current_deployment?.status;
    if (status === "completed") {
      console.log(`\ndeployed: ${data.invocation_url}`);
      return;
    }
    if (status === "failed") {
      throw new Error("deployment failed - check `neon functions get` for logs");
    }
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for deployment (last status: ${status})`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("deploy failed:", error);
    process.exit(1);
  });
