"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, type DeskRecord } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const kinds = [
  "appointment",
  "reservation",
  "event",
  "demo",
  "callback",
  "waitlist",
  "lead",
  "complaint",
  "order",
  "triage",
  "refill",
  "referral",
  "insurance",
  "billing",
  "survey",
  "sms",
  "email",
  "outbound",
  "transfer",
  "payment",
];

export default function DeskPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<DeskRecord[]>([]);
  const [kind, setKind] = useState("appointment");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [resource, setResource] = useState("");
  const [when, setWhen] = useState("");
  const [detail, setDetail] = useState("");
  const [filter, setFilter] = useState("all");

  async function load() {
    if (!token) return;
    const next = await api<DeskRecord[]>("/records", { token });
    setRows(next);
  }

  useEffect(() => {
    if (!token) return;
    void load().catch((caught: unknown) => {
      toast.error(caught instanceof Error ? caught.message : "Could not load the desk");
    });
  }, [token]);

  async function createRecord(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    const workflows = ["refill", "referral", "insurance", "billing", "portal", "lab", "discharge", "medication", "vaccination", "request", "warranty", "admission"];
    const action =
      kind === "appointment" || kind === "reservation" || kind === "event" || kind === "demo"
        ? "book"
        : kind === "sms" || kind === "email" || kind === "outbound"
          ? "message"
          : workflows.includes(kind)
            ? "workflow"
            : kind;
    try {
      const result = await api<{ notice: string }>("/records", {
        method: "POST",
        token,
        body: JSON.stringify({
          action,
          kind,
          name,
          phone,
          resource,
          when,
          detail,
          channel: kind === "outbound" ? "call" : kind,
        }),
      });
      setDetail("");
      toast.success(result.notice);
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not save");
    }
  }

  async function setStatus(id: string, status: string) {
    if (!token) return;
    try {
      await api(`/records/${id}`, { method: "PATCH", token, body: JSON.stringify({ status }) });
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not update");
    }
  }

  const visible = filter === "all" ? rows : rows.filter((row) => row.kind === filter);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Desk</h1>
        <p className="text-sm text-muted-foreground">
          Bookings, callbacks, leads, complaints, and messages. Calls and texts wait here until a phone line is connected.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Add</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={createRecord} className="grid gap-3 md:grid-cols-2">
            <Field>
              <FieldLabel>Kind</FieldLabel>
              <Select value={kind} onValueChange={(value) => value && setKind(value)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {kinds.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="desk-name">Name</FieldLabel>
              <Input id="desk-name" value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="desk-phone">Phone</FieldLabel>
              <Input id="desk-phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="desk-resource">Resource</FieldLabel>
              <Input id="desk-resource" value={resource} placeholder="Doctor, room, or table" onChange={(event) => setResource(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="desk-when">When</FieldLabel>
              <Input id="desk-when" type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="desk-detail">Detail</FieldLabel>
              <Input id="desk-detail" value={detail} onChange={(event) => setDetail(event.target.value)} />
            </Field>
            <Button type="submit" className="md:col-span-2 md:w-fit">
              Save
            </Button>
          </form>
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>
          All
        </Button>
        {kinds.slice(0, 8).map((item) => (
          <Button key={item} variant={filter === item ? "default" : "outline"} size="sm" onClick={() => setFilter(item)}>
            {item}
          </Button>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {visible.length === 0 ? <p className="text-sm text-muted-foreground">Nothing on the desk yet.</p> : null}
        {visible.map((row) => (
          <Card key={row.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">
                  {row.kind} · {row.title}
                </CardTitle>
                <Badge variant="secondary">{row.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p>
                {[row.name, row.phone, row.score && `score ${row.score}`, row.amount && row.amount].filter(Boolean).join(" · ")}
              </p>
              {row.startsAt ? <p>{new Date(row.startsAt).toLocaleString()}</p> : null}
              {row.detail ? <p className="text-muted-foreground">{row.detail}</p> : null}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => void setStatus(row.id, "done")}>
                  Done
                </Button>
                <Button variant="outline" size="sm" onClick={() => void setStatus(row.id, "cancelled")}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
