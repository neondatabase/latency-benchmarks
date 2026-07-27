"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";
import logoLight from "../assets/logo.svg";
import logoDark from "../assets/logo-dark.svg";

/** Every benchmark in the app. Add a route here to add a tab. */
const BENCHES = [
  { href: "/", label: "Regional latency" },
  { href: "/connection-methods", label: "Connection methods" },
];

interface BenchNavProps {
  title: string;
  /** Left padding on mobile clears the regional bench's fixed sidebar toggle. */
  offsetForSidebar?: boolean;
}

export function BenchNav({ title, offsetForSidebar = false }: BenchNavProps) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          "flex items-center gap-4",
          offsetForSidebar && "pl-12 md:pl-0",
        )}
      >
        <h1 className="text-2xl md:text-3xl font-bold mr-auto">{title}</h1>
        <ThemeToggle />
        <Image
          className="h-6 w-auto dark:hidden"
          src={logoLight}
          alt="Neon logo"
          width={88}
          height={24}
          priority
        />
        <Image
          className="hidden h-6 w-auto dark:block"
          src={logoDark}
          alt="Neon logo"
          width={88}
          height={24}
          priority
        />
      </div>

      <nav
        className={cn(
          "flex flex-wrap items-center gap-1 border-b",
          offsetForSidebar && "pl-12 md:pl-0",
        )}
      >
        {BENCHES.map((bench) => {
          const active = pathname === bench.href;
          return (
            <Link
              key={bench.href}
              href={bench.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {bench.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
