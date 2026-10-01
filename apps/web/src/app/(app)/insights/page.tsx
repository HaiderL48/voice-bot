"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Insights = {
  calls: number;
  pickedUp: number;
  bookings: number;
  leads: number;
  openCallbacks: number;
  tags: Array<{ tag: string; count: number }>;
  heatmap: number[][];
  variants: { a: { calls: number; bookings: number }; b: { calls: number; bookings: number } };
};

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function InsightsPage() {
  const { token } = useAuth();
  const [insights, setInsights] = useState<Insights | null>(null);

  useEffect(() => {
    if (!token) return;
    void api<Insights>("/insights", { token })
      .then(setInsights)
      .catch((caught: unknown) => {
        toast.error(caught instanceof Error ? caught.message : "Could not load insights");
      });
  }, [token]);

  if (!insights) return <p className="text-sm text-muted-foreground">Loading insights…</p>;
  const peak = Math.max(1, ...insights.heatmap.flat());

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
        <p className="text-sm text-muted-foreground">Volume, what callers ask for, and which greeting books more.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Calls answered", insights.pickedUp],
          ["Bookings", insights.bookings],
          ["Leads", insights.leads],
          ["Open callbacks", insights.openCallbacks],
          ["Answer rate", insights.calls === 0 ? "—" : "100%"],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{value}</CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>When calls arrive</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="grid min-w-[720px] gap-1" style={{ gridTemplateColumns: "3rem repeat(24, 1fr)" }}>
            <span />
            {Array.from({ length: 24 }, (_, hour) => (
              <span key={hour} className="text-center text-[10px] text-muted-foreground">
                {hour}
              </span>
            ))}
            {insights.heatmap.map((row, day) => (
              <div key={dayNames[day]} className="contents">
                <span className="text-xs text-muted-foreground">{dayNames[day]}</span>
                {row.map((count, hour) => (
                  <span
                    key={`${day}-${hour}`}
                    title={`${dayNames[day]} ${hour}:00 · ${count}`}
                    className="h-4 rounded-sm bg-primary"
                    style={{ opacity: count === 0 ? 0.08 : 0.2 + (count / peak) * 0.8 }}
                  />
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top reasons</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {insights.tags.length === 0 ? <p className="text-muted-foreground">Tags appear after calls end.</p> : null}
            {insights.tags.map((tag) => (
              <p key={tag.tag}>
                {tag.tag} · {tag.count}
              </p>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Greeting test</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p>Greeting A · {insights.variants.a.calls} calls · {insights.variants.a.bookings} bookings</p>
            <p>Greeting B · {insights.variants.b.calls} calls · {insights.variants.b.bookings} bookings</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
