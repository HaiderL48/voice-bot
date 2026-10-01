"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type Agent } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const languageLabels: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  es: "Spanish",
  fr: "French",
  auto: "Match caller",
};

export default function AgentsPage() {
  const { token } = useAuth();
  const [agents, setAgents] = useState<Agent[] | null>(null);

  useEffect(() => {
    if (!token) return;
    void api<Agent[]>("/agents", { token })
      .then(setAgents)
      .catch((caught: unknown) => {
        toast.error(caught instanceof Error ? caught.message : "Could not load agents");
        setAgents([]);
      });
  }, [token]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
          <p className="text-sm text-muted-foreground">Each agent is a receptionist with its own voice and facts.</p>
        </div>
        <Button render={<Link href="/agents/new" />}>New agent</Button>
      </div>
      {agents === null ? (
        <Skeleton className="h-40 w-full" />
      ) : agents.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No agents yet</EmptyTitle>
            <EmptyDescription>Create one to start taking test calls.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button render={<Link href="/agents/new" />}>New agent</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {agents.map((agent) => (
            <Card key={agent.id}>
              <CardHeader>
                <CardTitle>{agent.name}</CardTitle>
                <CardDescription className="line-clamp-2">{agent.greeting}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{languageLabels[agent.language] ?? agent.language}</Badge>
                  <Badge variant={agent.isActive ? "default" : "outline"}>
                    {agent.isActive ? "Active" : "Paused"}
                  </Badge>
                </div>
              </CardContent>
              <CardFooter className="gap-2">
                <Button render={<Link href={`/agents/${agent.id}/console`} />}>Test call</Button>
                <Button variant="outline" render={<Link href={`/agents/${agent.id}`} />}>
                  Settings
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
