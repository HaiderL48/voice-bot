"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import { api, type Office } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

type Hours = Record<(typeof days)[number], [string, string] | null>;

const defaultHours: Hours = {
  sun: null,
  mon: ["09:00", "18:00"],
  tue: ["09:00", "18:00"],
  wed: ["09:00", "18:00"],
  thu: ["09:00", "18:00"],
  fri: ["09:00", "18:00"],
  sat: ["09:00", "18:00"],
};

function readHours(raw: string): Hours {
  try {
    const parsed = JSON.parse(raw) as Partial<Hours>;
    return { ...defaultHours, ...parsed };
  } catch {
    return defaultHours;
  }
}

export default function KnowledgePage() {
  const { token } = useAuth();
  const [office, setOffice] = useState<Office | null>(null);
  const [hours, setHours] = useState<Hours>(defaultHours);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [docBody, setDocBody] = useState("");
  const [resourceName, setResourceName] = useState("");
  const [resourceKind, setResourceKind] = useState("doctor");

  async function load() {
    if (!token) return;
    const next = await api<Office>("/office", { token });
    setOffice(next);
    setHours(readHours(next.organization.hours));
  }

  useEffect(() => {
    if (!token) return;
    void load().catch((caught: unknown) => {
      toast.error(caught instanceof Error ? caught.message : "Could not load knowledge");
    });
  }, [token]);

  function patch(partial: Partial<Office["organization"]>) {
    setOffice((current) => (current ? { ...current, organization: { ...current.organization, ...partial } } : current));
  }

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    if (!token || !office) return;
    try {
      await api("/office", {
        method: "PATCH",
        token,
        body: JSON.stringify({ ...office.organization, hours: JSON.stringify(hours) }),
      });
      toast.success("Business settings saved");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not save settings");
    }
  }

  async function addFaq(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    try {
      await api("/office/faqs", { method: "POST", token, body: JSON.stringify({ question, answer }) });
      setQuestion("");
      setAnswer("");
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not add the FAQ");
    }
  }

  async function addDocument(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    try {
      await api("/office/documents", { method: "POST", token, body: JSON.stringify({ title: docTitle, body: docBody }) });
      setDocTitle("");
      setDocBody("");
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not add the document");
    }
  }

  async function addResource(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    try {
      await api("/office/resources", {
        method: "POST",
        token,
        body: JSON.stringify({ name: resourceName, kind: resourceKind, notes: "" }),
      });
      setResourceName("");
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not add the resource");
    }
  }

  if (!office) return <p className="text-sm text-muted-foreground">Loading knowledge…</p>;
  const organization = office.organization;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Knowledge</h1>
        <p className="text-sm text-muted-foreground">
          Hours, FAQs, documents, and who can be booked. The agent answers from this on every call.
        </p>
      </div>
      <form onSubmit={saveSettings} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Business</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Field>
              <FieldLabel>Industry</FieldLabel>
              <Select value={organization.industry} onValueChange={(value) => value && patch({ industry: value })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="clinic">Clinic</SelectItem>
                    <SelectItem value="hospitality">Hospitality</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="timezone">Timezone</FieldLabel>
              <Input id="timezone" value={organization.timezone} onChange={(event) => patch({ timezone: event.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="transfer">Transfer number</FieldLabel>
              <Input id="transfer" value={organization.transferPhone} onChange={(event) => patch({ transferPhone: event.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="emergency">Emergency number</FieldLabel>
              <Input id="emergency" value={organization.emergencyPhone} onChange={(event) => patch({ emergencyPhone: event.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="after-hours">After-hours greeting</FieldLabel>
              <Textarea id="after-hours" value={organization.afterHoursGreeting} rows={2} onChange={(event) => patch({ afterHoursGreeting: event.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="offers">Offers to mention</FieldLabel>
              <Textarea id="offers" value={organization.offers} rows={2} onChange={(event) => patch({ offers: event.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="competitors">Competitor talking points</FieldLabel>
              <Textarea id="competitors" value={organization.competitorNotes} rows={2} onChange={(event) => patch({ competitorNotes: event.target.value })} />
            </Field>
            <div className="grid gap-2">
              {days.map((day) => (
                <div key={day} className="grid grid-cols-[4rem_1fr_1fr_auto] items-center gap-2">
                  <span className="text-sm uppercase">{day}</span>
                  <Input
                    type="time"
                    disabled={!hours[day]}
                    value={hours[day]?.[0] ?? "09:00"}
                    onChange={(event) =>
                      setHours((current) => ({ ...current, [day]: [event.target.value, current[day]?.[1] ?? "18:00"] }))
                    }
                  />
                  <Input
                    type="time"
                    disabled={!hours[day]}
                    value={hours[day]?.[1] ?? "18:00"}
                    onChange={(event) =>
                      setHours((current) => ({ ...current, [day]: [current[day]?.[0] ?? "09:00", event.target.value] }))
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setHours((current) => ({
                        ...current,
                        [day]: current[day] ? null : ["09:00", "18:00"],
                      }))
                    }
                  >
                    {hours[day] ? "Open" : "Closed"}
                  </Button>
                </div>
              ))}
            </div>
            <Button type="submit" className="w-fit">
              Save settings
            </Button>
          </CardContent>
        </Card>
      </form>
      <Card>
        <CardHeader>
          <CardTitle>FAQs</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {office.faqs.map((faq) => (
            <div key={faq.id} className="flex items-start justify-between gap-3 text-sm">
              <div>
                <p className="font-medium">{faq.question}</p>
                <p className="text-muted-foreground">{faq.answer}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => token && void api(`/office/faqs/${faq.id}`, { method: "DELETE", token }).then(load)}>
                Remove
              </Button>
            </div>
          ))}
          <form onSubmit={addFaq} className="grid gap-2">
            <Input value={question} placeholder="Question" onChange={(event) => setQuestion(event.target.value)} required />
            <Textarea value={answer} placeholder="Answer" rows={2} onChange={(event) => setAnswer(event.target.value)} required />
            <Button type="submit" variant="secondary" className="w-fit">
              Add FAQ
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {office.documents.map((document) => (
            <div key={document.id} className="flex items-start justify-between gap-3 text-sm">
              <div>
                <p className="font-medium">{document.title}</p>
                <p className="text-muted-foreground">{document.body}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => token && void api(`/office/documents/${document.id}`, { method: "DELETE", token }).then(load)}
              >
                Remove
              </Button>
            </div>
          ))}
          <form onSubmit={addDocument} className="grid gap-2">
            <Input value={docTitle} placeholder="Title" onChange={(event) => setDocTitle(event.target.value)} required />
            <Textarea value={docBody} placeholder="Menu, policy, or discharge notes" rows={3} onChange={(event) => setDocBody(event.target.value)} required />
            <Button type="submit" variant="secondary" className="w-fit">
              Add document
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Bookable people and places</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {office.resources.map((resource) => (
            <div key={resource.id} className="flex items-center justify-between gap-3 text-sm">
              <p>
                {resource.name} · {resource.kind}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => token && void api(`/office/resources/${resource.id}`, { method: "DELETE", token }).then(load)}
              >
                Remove
              </Button>
            </div>
          ))}
          <form onSubmit={addResource} className="grid gap-2 md:grid-cols-[1fr_10rem_auto]">
            <Input value={resourceName} placeholder="Dr. Shah, Table 4, Room 12" onChange={(event) => setResourceName(event.target.value)} required />
            <Select value={resourceKind} onValueChange={(value) => value && setResourceKind(value)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="doctor">Doctor</SelectItem>
                  <SelectItem value="room">Room</SelectItem>
                  <SelectItem value="table">Table</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button type="submit" variant="secondary">
              Add
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
