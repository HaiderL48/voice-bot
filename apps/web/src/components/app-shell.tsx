"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

const links = [
  { href: "/agents", label: "Agents" },
  { href: "/calls", label: "Calls" },
  { href: "/desk", label: "Desk" },
  { href: "/knowledge", label: "Knowledge" },
  { href: "/insights", label: "Insights" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-svh bg-background md:grid md:grid-cols-[240px_1fr]">
      <aside className="flex flex-col gap-6 border-b bg-card px-4 py-4 md:min-h-svh md:border-r md:border-b-0 md:px-5 md:py-6">
        <div className="flex flex-col gap-1">
          <Link href="/agents" className="text-base font-semibold tracking-tight">
            Voice Bot
          </Link>
          <p className="truncate text-sm text-muted-foreground">{user?.organizationName}</p>
        </div>
        <nav className="flex gap-2 md:flex-col">
          {links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm",
                  active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/70",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-2">
          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          <Button
            variant="outline"
            onClick={() => {
              logout();
              router.replace("/login");
            }}
          >
            Sign out
          </Button>
        </div>
      </aside>
      <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
