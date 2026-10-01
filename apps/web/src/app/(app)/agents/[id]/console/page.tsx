"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CallConsole } from "@/components/call-console";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type Agent } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function ConsolePage() {
  const params = useParams<{ id: string }>();
  const { token } = useAuth();
  const [agent, setAgent] = useState<Agent | null>(null);

  useEffect(() => {
    if (!token) return;
    void api<Agent>(`/agents/${params.id}`, { token })
      .then(setAgent)
      .catch((caught: unknown) => {
        toast.error(caught instanceof Error ? caught.message : "Could not load agent");
      });
  }, [token, params.id]);

  if (!agent) return <Skeleton className="h-80 w-full" />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Test call</h1>
          <p className="text-sm text-muted-foreground">The mic stays open. Speak, then pause. Talk over the agent to interrupt.</p>
        </div>
        <Button variant="outline" render={<Link href={`/agents/${agent.id}`} />}>
          Settings
        </Button>
      </div>
      <CallConsole agentId={agent.id} agentName={agent.name} />
    </div>
  );
}
