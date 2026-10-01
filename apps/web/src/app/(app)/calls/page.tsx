"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type CallSummary } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function CallsPage() {
  const { token } = useAuth();
  const [calls, setCalls] = useState<CallSummary[] | null>(null);

  useEffect(() => {
    if (!token) return;
    void api<CallSummary[]>("/calls", { token })
      .then(setCalls)
      .catch((caught: unknown) => {
        toast.error(caught instanceof Error ? caught.message : "Could not load calls");
        setCalls([]);
      });
  }, [token]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Calls</h1>
        <p className="text-sm text-muted-foreground">Recent test calls and the last thing that was said.</p>
      </div>
      {calls === null ? (
        <Skeleton className="h-32 w-full" />
      ) : calls.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No calls yet</EmptyTitle>
            <EmptyDescription>Start a test call from an agent to see it here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {calls.map((call) => (
            <Link key={call.id} href={`/calls/${call.id}`}>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle>{call.agentName}</CardTitle>
                    <Badge variant={call.status === "active" ? "default" : "secondary"}>{call.status}</Badge>
                  </div>
                  <CardDescription className="line-clamp-2">
                    {new Date(call.startedAt).toLocaleString()} · {call.preview}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
