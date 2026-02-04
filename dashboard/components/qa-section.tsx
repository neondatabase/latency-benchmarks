import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function QASection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Frequently Asked Questions</CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="item-0">
            <AccordionTrigger>
              What does this benchmark measure?
            </AccordionTrigger>
            <AccordionContent>
              <p>
                This benchmark measures the latency between serverless functions
                and databases across different regions. It specifically focuses
                on the roundtrip time for executing a simple SELECT query. It
                compares different connection methods: HTTP and WebSocket via
                the Neon serverless driver, and classic TCP connections via the
                pg library.
              </p>
              <p className="mt-2">The measurements include:</p>
              <ul className="list-disc pl-6 mt-1 space-y-1">
                <li>Network latency between function and database regions</li>
                <li>Database connection establishment time</li>
                <li>Query execution and result retrieval time</li>
                <li>
                  Performance differences between HTTP, WebSocket, and TCP
                  connections
                </li>
              </ul>
              <p className="mt-2">
                <a
                  href="https://neon.tech/blog/http-vs-websockets-for-postgres-queries-at-the-edge"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline hover:text-primary/80"
                >
                  Learn more about HTTP vs WebSockets for Postgres queries
                </a>
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-6">
            <AccordionTrigger>
              What is the @neondatabase/serverless driver?
            </AccordionTrigger>
            <AccordionContent>
              <p>
                The benchmark uses the @neondatabase/serverless driver, which is
                specifically designed for serverless environments. This driver
                supports two connection methods:
              </p>
              <ul className="list-disc pl-6 mt-1 space-y-1">
                <li>
                  <strong>HTTP connection:</strong> Faster for single-shot
                  queries, stateless by design
                </li>
                <li>
                  <strong>WebSocket connection:</strong> More efficient for
                  multiple queries in a single connection, supports more
                  PostgreSQL features
                </li>
              </ul>
              <p className="mt-2">
                The driver has several key characteristics:
              </p>
              <ul className="list-disc pl-6 mt-1 space-y-1">
                <li>
                  Uses HTTP or WebSockets instead of TCP for communication
                </li>
                <li>
                  Optimized for serverless environments with minimal cold starts
                </li>
                <li>Handles connection pooling and management automatically</li>
                <li>
                  Provides connection caching options to improve performance
                </li>
              </ul>
              <p className="mt-2">
                <a
                  href="https://neon.tech/blog/http-vs-websockets-for-postgres-queries-at-the-edge"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline hover:text-primary/80"
                >
                  Learn more about HTTP vs WebSockets for Postgres queries
                </a>
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-7">
            <AccordionTrigger>
              What's the difference between HTTP and WebSocket connections?
            </AccordionTrigger>
            <AccordionContent>
              <p className="font-medium text-primary">
                Note: This benchmark specifically measures single-shot query
                performance, which generally favors HTTP connections. The
                performance characteristics described below have been observed
                in our other benchmarks testing multiple query scenarios.
              </p>

              <p className="mt-3">
                The @neondatabase/serverless driver offers two connection
                methods with different performance characteristics and
                capabilities:
              </p>

              <h4 className="font-medium mt-3">HTTP Connections:</h4>
              <ul className="list-disc pl-6 mt-1 space-y-1">
                <li>
                  <strong>Performance:</strong> Faster for single-shot queries
                  (~5-10ms advantage)
                </li>
                <li>
                  <strong>Initialization:</strong> Requires fewer round-trips to
                  establish a connection
                </li>
                <li>
                  <strong>Use case:</strong> Ideal for serverless functions that
                  execute a single query per invocation
                </li>
                <li>
                  <strong>Limitations:</strong> Doesn't support sessions,
                  interactive transactions, NOTIFY, or COPY protocol
                </li>
                <li>
                  <strong>Optimization:</strong> Connection caching can further
                  improve performance
                </li>
              </ul>

              <h4 className="font-medium mt-3">WebSocket Connections:</h4>
              <ul className="list-disc pl-6 mt-1 space-y-1">
                <li>
                  <strong>Performance:</strong> Slower initial connection
                  (~37ms) but very fast for subsequent queries (~5ms)
                </li>
                <li>
                  <strong>Initialization:</strong> Requires multiple round-trips
                  (reduced from nine to four through optimization)
                </li>
                <li>
                  <strong>Use case:</strong> Better for executing multiple
                  queries in a single connection
                </li>
                <li>
                  <strong>Features:</strong> Supports full Postgres
                  compatibility including sessions, transactions, NOTIFY, and
                  COPY protocol
                </li>
                <li>
                  <strong>Advantage:</strong> Much lower latency after
                  connection is established
                </li>
              </ul>

              <p className="mt-3">
                Our benchmark data shows a bi-modal distribution in query
                latencies:
              </p>
              <ul className="list-disc pl-6 mt-1 space-y-1">
                <li>
                  HTTP is faster for one-off queries where connections aren't
                  reused
                </li>
                <li>
                  WebSockets are faster when you can amortize the connection
                  setup cost across multiple queries
                </li>
              </ul>

              <p className="mt-3">
                The runtime environment also matters - Edge environments might
                prioritize cached HTTP connections differently than Serverless
                environments.
              </p>

              <p className="mt-2">
                <a
                  href="https://neon.tech/blog/http-vs-websockets-for-postgres-queries-at-the-edge"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline hover:text-primary/80"
                >
                  Learn more about HTTP vs WebSockets for Postgres queries
                </a>
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-8">
            <AccordionTrigger>What about TCP connections?</AccordionTrigger>
            <AccordionContent>
              <p>
                In addition to HTTP and WebSocket connections via the
                @neondatabase/serverless driver, this benchmark also measures
                classic TCP connections using the standard pg library with
                Vercel's @vercel/functions attachDatabasePool to handle idle
                connections
              </p>

              <h4 className="font-medium mt-3">TCP Connections:</h4>
              <ul className="list-disc pl-6 mt-1 space-y-1">
                <li>
                  <strong>Driver:</strong> Uses the standard pg Pool library
                  instead of @neondatabase/serverless
                </li>
                <li>
                  <strong>Connection Method:</strong> Classic TCP protocol over
                  port 5432
                </li>
                <li>
                  <strong>Features:</strong> Full PostgreSQL protocol support,
                  including all features and extensions
                </li>
                <li>
                  <strong>Use Case:</strong> Traditional approach for long-lived
                  applications where connection pooling can be maintained
                </li>
                <li>
                  <strong>Performance:</strong> Performance depends on
                  connection reuse - cold connections require full TCP handshake
                  and PostgreSQL authentication, while warm connections benefit
                  from pooling
                </li>
              </ul>

              <h4 className="font-medium mt-3">Round Trip Comparison:</h4>
              <p className="mt-1">
                For the first query after a cold start, the connection methods
                require different numbers of round trips:
              </p>
              <ul className="list-disc pl-6 mt-1 space-y-1">
                <li>
                  <strong>HTTP:</strong> Fastest with 3 round trips
                </li>
                <li>
                  <strong>WebSocket:</strong> 4 round trips
                </li>
                <li>
                  <strong>TCP/PostgreSQL:</strong> 8 round trips
                </li>
              </ul>

              <p className="mt-3 font-medium text-primary">
                Note: This benchmark only measures the first query (e.g., after
                a serverless function cold start), which heavily favors HTTP's
                strengths. However, it provides a good way to measure worst-case
                latencies across different transports on serverless environments
                connecting to Neon.
              </p>

              <p className="mt-3">
                TCP connections are measured in select regions (us-west-2 and
                us-east-1) to compare the traditional approach with the
                serverless-optimized HTTP and WebSocket methods.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-1">
            <AccordionTrigger>What are cold and hot queries?</AccordionTrigger>
            <AccordionContent>
              <h4 className="font-medium">Cold Queries</h4>
              <p>
                A cold query is the first query executed against a database in a
                benchmark run. In Neon, this triggers a database startup as all
                benchmark databases have scale-to-zero enabled. This means the
                database is completely shut down after a period of inactivity
                and must be restarted for the first query.
              </p>
              <p className="mt-2">
                The benchmark cronjobs are specifically configured to run every
                15 minutes to ensure that each database has had time to scale to
                zero between measurements, allowing us to consistently measure
                the cold start performance.
              </p>
              <p className="mt-2">The cold query latency includes:</p>
              <ul className="list-disc pl-6 mt-1 space-y-1">
                <li>Database startup time from a scaled-to-zero state</li>
                <li>Connection establishment</li>
                <li>Query execution and result retrieval</li>
              </ul>

              <h4 className="font-medium mt-4">Hot Queries</h4>
              <p>
                A hot query is executed immediately after a cold query in the
                same benchmark run. It represents the best-case scenario where
                the database is already running and ready to handle requests.
              </p>
              <p className="mt-2">The hot query latency primarily reflects:</p>
              <ul className="list-disc pl-6 mt-1 space-y-1">
                <li>Network roundtrip time</li>
                <li>Query execution time</li>
                <li>Result retrieval time</li>
              </ul>

              <p className="mt-3">
                Measuring both cold and hot queries provides a comprehensive
                view of database performance across different scenarios. Cold
                queries show the worst-case latency when the database needs to
                start up first, while hot queries demonstrate the optimal
                performance once a database is already running.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-3">
            <AccordionTrigger>
              How often are benchmark requests made?
            </AccordionTrigger>
            <AccordionContent>
              <p>
                Benchmark requests are made every 15 minutes from each
                serverless function to each database. This interval is
                specifically chosen to ensure that Neon databases have scaled to
                zero between measurements, allowing us to accurately measure
                cold start performance.
              </p>
              <p className="mt-2">For each benchmark run:</p>
              <ul className="list-disc pl-6 mt-1 space-y-1">
                <li>
                  One cold query is executed first (hitting a scaled-to-zero
                  database)
                </li>
                <li>
                  One hot query is executed immediately after (when the database
                  is already running)
                </li>
                <li>
                  Both measurements are stored in the stats database (not in the
                  benchmark databases themselves)
                </li>
              </ul>
              <p className="mt-2">
                This results in 96 measurements per day (4 measurements per hour
                × 24 hours) for each function-database pair, with each
                measurement including both a cold and hot query result. The
                table shows the average latency over the last 30 days.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-4">
            <AccordionTrigger>
              What query is being executed for the benchmark?
            </AccordionTrigger>
            <AccordionContent>
              <p>The benchmark executes a simple SELECT query:</p>
              <pre className="bg-muted p-2 rounded-md mt-2 overflow-x-auto">
                {`SELECT 1`}
              </pre>
              <p className="mt-2">
                This query is intentionally simple to focus on measuring
                connection and network latency rather than database processing
                capabilities.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
