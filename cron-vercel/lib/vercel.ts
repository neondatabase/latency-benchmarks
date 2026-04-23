export const vercelRegionMap: Record<string, string> = {
  "us-east-2": "cle1", // Columbus
  "us-west-2": "pdx1", // Portland
  "us-east-1": "iad1", // Washington DC
  "us-west-1": "sfo1", // San Francisco
  "eu-west-1": "dub1", // Dublin
  "eu-west-2": "lhr1", // London
  "eu-central-1": "fra1", // Frankfurt
  "eu-north-1": "arn1", // Stockholm
  "ap-southeast-1": "sin1", // Singapore
  "ap-southeast-2": "syd1", // Sydney
  "ap-northeast-1": "hnd1", // Tokyo
  "ap-northeast-2": "icn1", // Seoul
  "ap-south-1": "bom1", // Mumbai
  "sa-east-1": "gru1", // São Paulo
  "af-south-1": "cpt1", // Cape Town
  "eu-west-3": "cdg1", // Paris
  "ap-east-1": "hkg1", // Hong Kong
  "ap-northeast-3": "kix1", // Osaka
};

export function getVercelRegionCode(awsRegionCode: string): string {
  const vercelRegionCode = vercelRegionMap[awsRegionCode];
  if (!vercelRegionCode) {
    throw new Error(
      `No Vercel region mapping found for AWS region: ${awsRegionCode}`,
    );
  }
  return vercelRegionCode;
}

export function getAWSRegionCode(vercelRegionCode: string): string {
  const awsRegionCode = Object.keys(vercelRegionMap).find(
    (key) => vercelRegionMap[key] === vercelRegionCode,
  );
  if (!awsRegionCode) {
    throw new Error(
      `No AWS region mapping found for Vercel region: ${vercelRegionCode}`,
    );
  }
  return awsRegionCode;
}
