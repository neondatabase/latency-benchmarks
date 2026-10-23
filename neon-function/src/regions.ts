/**
 * Regions where Neon Functions is available. Each gets its own host project,
 * because a function runs in the region of the project hosting it.
 */
export const NEON_FUNCTION_REGIONS = [
  { code: "us-east-1", label: "Washington, D.C., USA (East) - us-east-1" },
  { code: "us-east-2", label: "Columbus, USA (East) - us-east-2" },
  { code: "eu-central-1", label: "Frankfurt, Germany (Central EU) - eu-central-1" },
  { code: "ap-southeast-1", label: "Singapore (Southeast Asia) - ap-southeast-1" },
] as const;

export type NeonFunctionRegion = (typeof NEON_FUNCTION_REGIONS)[number];

/** Target regions, matching the set the Vercel platform measures against. */
export const AWS_REGIONS = [
  { code: "us-east-1", label: "AWS US East 1 (N. Virginia)" },
  { code: "us-east-2", label: "AWS US East 2 (Ohio)" },
  { code: "us-west-2", label: "AWS US West 2 (Oregon)" },
  { code: "ap-southeast-1", label: "AWS Asia Pacific 1 (Singapore)" },
  { code: "ap-southeast-2", label: "AWS Asia Pacific 2 (Sydney)" },
  { code: "eu-central-1", label: "AWS Europe Central 1 (Frankfurt)" },
  { code: "eu-west-2", label: "AWS Europe West 2 (London)" },
  { code: "sa-east-1", label: "AWS South America East 1 (São Paulo)" },
] as const;

export const CONNECTION_METHODS = ["http", "ws", "tcp"] as const;

export type ConnectionMethod = (typeof CONNECTION_METHODS)[number];

export function hostProjectName(functionRegion: string): string {
  return `benchmarking-neon-functions-host-${functionRegion}`;
}

export function benchProjectName(
  functionRegion: string,
  targetRegion: string,
  method: ConnectionMethod,
): string {
  return `benchmarking-from-neon-${functionRegion}-to-${targetRegion}-via-${method}`;
}
