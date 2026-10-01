"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type CallDetail } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export default function CallDetailPage() {
  const params = useParams<{ id: string }>();
  const { token } = useAuth();
  const [call, setCall] = useState<CallDetail | null>(null);

  useEffect(() => {
    if (!token) return;
    void api<CallDetail>(`/calls/${params.id}`, { token })
      .then(setCall)
      .catch((caught: unknown) => {
        toast.error(caught instanceof Error ? caught.message : "Could not load call");
      });
  }, [token, params.id]);

  if (!call) return <Skeleton className="h-80 w-full" />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{call.agentName}</h1>
          <p className="text-sm text-muted-foreground">{new Date(call.startedAt).toLocaleString()}</p>
        </div>
        <Badge variant={call.status === "active" ? "default" : "secondary"}>{call.status}</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Call record</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>{call.summary || "Summary appears when the call ends."}</p>
          <p className="text-muted-foreground">
            {call.tags ? `Tags: ${call.tags}` : "No tags yet"}
            {call.intent ? ` · ${call.intent}` : ""}
            {call.callerPhone ? ` · ${call.callerPhone}` : ""}
            {` · ${call.channel} · greeting ${call.greetingVariant.toUpperCase()}`}
          </p>
          <p className="text-muted-foreground">
            {call.transferTarget ? `Transfer queued to ${call.transferTarget}. ` : ""}
            {call.recordingUrl
              ? "Audio recording is attached."
              : "Transcript is saved. Phone audio attaches here when the line records the call."}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Transcript</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-3">
            {call.messages.map((message) => (
              <li
                key={message.id}
                className={cn(
                  "max-w-[85%] rounded-xl px-3 py-2 text-sm",
                  message.role === "assistant" ? "bg-muted" : "ml-auto bg-primary text-primary-foreground",
                )}
              >
                {message.content}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
