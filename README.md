# Neon Latency Benchmarks

A benchmark measuring latencies from Vercel serverless regions to Neon databases.

Visit it here: [latency-benchmarks-dashboard.vercel.app](https://latency-benchmarks-dashboard.vercel.app/demos/regional-latency)

## Components

- [./cron-vercel](./cron-vercel/): API deployed to Vercel that runs every 15 minutes to measure latencies from each Vercel region to all benchmark databases.
- [./dashboard](./dashboard/): Next.js dashboard displaying latency measurements.

## Setup

1. Run `bun run setup` in the dashboard directory to create the benchmark databases
2. Run `npm run deploy` in the cron-vercel directory to deploy the cronjob application. Each route is pinned to its Vercel region through the `functions` property in `cron-vercel/vercel.json`.
3. Deploy the dashboard application to Vercel.

## Benchmark Details

- Measurements every 15 minutes
- Each Vercel region queries databases across all AWS regions available on Neon
- Two measurements per iteration: cold and hot
- Special regions (us-west-2, us-east-1) test both HTTP and WebSocket connections
