"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AgentForm } from "@/components/agent-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type Agent } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function AgentSettingsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { token } = useAuth();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!token) return;
    void api<Agent>(`/agents/${params.id}`, { token })
      .then(setAgent)
      .catch((caught: unknown) => {
        toast.error(caught instanceof Error ? caught.message : "Could not load agent");
      });
  }, [token, params.id]);

  async function remove() {
    if (!token || !agent) return;
    setPending(true);
    try {
      await api(`/agents/${agent.id}`, { method: "DELETE", token });
      toast.success("Agent deleted");
      router.replace("/agents");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not delete agent");
    } finally {
      setPending(false);
    }
  }

  if (!agent) return <Skeleton className="h-80 w-full max-w-2xl" />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{agent.name}</h1>
          <p className="text-sm text-muted-foreground">Settings for this receptionist.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" render={<Link href={`/agents/${agent.id}/console`} />}>
            Test call
          </Button>
          <Button variant="destructive" onClick={() => setOpen(true)}>
            Delete
          </Button>
        </div>
      </div>
      <AgentForm agent={agent} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this agent?</DialogTitle>
            <DialogDescription>Calls and transcripts for this agent are removed with it.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={pending} onClick={() => void remove()}>
              Delete agent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
