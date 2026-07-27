/**
 * Neon Functions are only offered in aws-us-east-2 during beta, so this
 * platform contributes exactly one function region.
 */
export const NEON_FUNCTION_REGION = {
  code: "us-east-2",
  label: "Columbus, USA (East) - us-east-2",
} as const;

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

/** Regions that additionally get WebSocket and TCP targets. */
export const MULTI_METHOD_REGIONS = ["us-east-1", "us-west-2"] as const;

export type ConnectionMethod = "http" | "ws" | "tcp";

export function targetsForRegion(regionCode: string): ConnectionMethod[] {
  return (MULTI_METHOD_REGIONS as readonly string[]).includes(regionCode)
    ? ["http", "ws", "tcp"]
    : ["http"];
}

export function benchProjectName(
  regionCode: string,
  method: ConnectionMethod,
): string {
  return `benchmarking-from-neon-${NEON_FUNCTION_REGION.code}-to-${regionCode}-via-${method}`;
}
