import { AgentForm } from "@/components/agent-form";

export default function NewAgentPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">New agent</h1>
        <p className="text-sm text-muted-foreground">Give it a greeting, a persona, and the facts it is allowed to say.</p>
      </div>
      <AgentForm />
    </div>
  );
}
