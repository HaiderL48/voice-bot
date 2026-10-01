"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api, type Agent, type VoiceOption } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const languages = [
  { value: "gu", label: "Gujarati" },
  { value: "hi", label: "Hindi" },
  { value: "en", label: "English" },
  { value: "ta", label: "Tamil" },
  { value: "te", label: "Telugu" },
  { value: "auto", label: "Match the caller" },
];

type Draft = {
  name: string;
  greeting: string;
  systemPrompt: string;
  knowledge: string;
  language: string;
  greetingB: string;
  voiceId: string;
  isActive: boolean;
};

export function AgentForm({ agent }: { agent?: Agent }) {
  const router = useRouter();
  const { token } = useAuth();
  const [pending, setPending] = useState(false);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [draft, setDraft] = useState<Draft>({
    name: agent?.name ?? "",
    greeting: agent?.greeting ?? "Thanks for calling. How can I help you today?",
    systemPrompt:
      agent?.systemPrompt ??
      "You are warm, brief, and professional. You answer questions, offer to book an appointment, and take a message when you cannot help directly.",
    knowledge: agent?.knowledge ?? "",
    language: agent?.language ?? "gu",
    greetingB: agent?.greetingB ?? "",
    voiceId: agent?.voiceId ?? "",
    isActive: agent?.isActive ?? true,
  });

  useEffect(() => {
    if (!token) return;
    void api<{ voices: VoiceOption[] }>("/voices", { token })
      .then((result) => {
        setVoices(result.voices);
        setDraft((current) => ({
          ...current,
          voiceId: current.voiceId || result.voices[0]?.voiceId || "",
        }));
      })
      .catch((caught: unknown) => {
        toast.error(caught instanceof Error ? caught.message : "Could not load voices");
      });
  }, [token]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setPending(true);
    try {
      const saved = await api<Agent>(agent ? `/agents/${agent.id}` : "/agents", {
        method: agent ? "PATCH" : "POST",
        token,
        body: JSON.stringify(draft),
      });
      toast.success(agent ? "Agent saved" : "Agent created");
      router.push(`/agents/${saved.id}`);
      router.refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not save agent");
    } finally {
      setPending(false);
    }
  }

  const voiceChoices =
    draft.voiceId && !voices.some((voice) => voice.voiceId === draft.voiceId)
      ? [{ voiceId: draft.voiceId, name: "Current voice", labels: "" }, ...voices]
      : voices;

  return (
    <form onSubmit={onSubmit} className="max-w-2xl">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Agent name</FieldLabel>
          <Input id="name" value={draft.name} required onChange={(event) => update("name", event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="greeting">Greeting</FieldLabel>
          <Textarea
            id="greeting"
            value={draft.greeting}
            required
            rows={3}
            onChange={(event) => update("greeting", event.target.value)}
          />
          <FieldDescription>The first thing the caller hears. Calls split with the alternate greeting when you set one.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="greeting-b">Alternate greeting</FieldLabel>
          <Textarea
            id="greeting-b"
            value={draft.greetingB}
            rows={3}
            onChange={(event) => update("greetingB", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="persona">Persona</FieldLabel>
          <Textarea
            id="persona"
            value={draft.systemPrompt}
            required
            rows={4}
            onChange={(event) => update("systemPrompt", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="knowledge">Business facts</FieldLabel>
          <Textarea
            id="knowledge"
            value={draft.knowledge}
            rows={6}
            placeholder="Hours, address, services, prices, booking rules."
            onChange={(event) => update("knowledge", event.target.value)}
          />
          <FieldDescription>The agent only states facts you put here.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel>Language</FieldLabel>
          <Select
            value={draft.language}
            onValueChange={(value) => {
              if (value) update("language", value);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {languages.map((language) => (
                  <SelectItem key={language.value} value={language.value}>
                    {language.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Voice</FieldLabel>
          {voiceChoices.length > 0 ? (
            <Select
              value={draft.voiceId}
              onValueChange={(value) => {
                if (value) update("voiceId", value);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {voiceChoices.map((voice) => (
                    <SelectItem key={voice.voiceId} value={voice.voiceId}>
                      {voice.name}
                      {voice.labels ? ` · ${voice.labels}` : ""}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={draft.voiceId}
              required
              placeholder="ElevenLabs voice id"
              onChange={(event) => update("voiceId", event.target.value)}
            />
          )}
        </Field>
        <Field>
          <FieldLabel>Status</FieldLabel>
          <Select
            value={draft.isActive ? "active" : "paused"}
            onValueChange={(value) => update("isActive", value !== "paused")}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          {agent ? "Save agent" : "Create agent"}
        </Button>
      </FieldGroup>
    </form>
  );
}
