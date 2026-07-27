This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/route.ts`. The page auto-updates as you edit the file.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## API Routes

There is one route per Vercel region, named after the region it runs in (`app/api/iad1`, `app/api/fra1`, …). Each one measures latency from that region to every benchmark database assigned to it.

For more details, see [route.js file convention](https://nextjs.org/docs/app/api-reference/file-conventions/route).

## Region pinning

A route only produces meaningful measurements if it actually executes in its own region, so every route is pinned with the `functions` property in `vercel.json`:

```json
{
  "functions": {
    "app/api/fra1/route.ts": { "regions": ["fra1"] }
  }
}
```

Each route also asserts its own placement at runtime and returns a 500 if `VERCEL_REGION` does not match the region it is named after, so a misconfigured deployment fails loudly instead of silently recording latencies from the wrong place.

Adding a region means creating `app/api/<region>/route.ts`, plus a `functions` entry and a `crons` entry in `vercel.json`.
