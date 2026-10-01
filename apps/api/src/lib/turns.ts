import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { agents, calls, messages, organizations } from "../db/schema";
import { DESK_TOOL, officeBrief, runDeskAction, type DeskArgs } from "./desk";
import { streamSpeech, synthesize, transcribe, voiceSpeaker } from "./elevenlabs";
import { completeChat, streamChat } from "./gemini";
import { HttpError } from "./http";
import { officeStatus, parseCallWrap, parseHours, pickGreeting } from "./office";
import { buildSystemPrompt, missedLine, textMatchesLanguage } from "./prompt";
import { pullSpeakable } from "./speech";

const SPOKEN_NAME: Record<string, string> = {
  gu: "Gujarati",
  hi: "Hindi",
  ta: "Tamil",
  te: "Telugu",
};

async function speakInLanguage(text: string, language: string, speaker?: "woman" | "man") {
  const name = SPOKEN_NAME[language];
  if (!name) return text;
  const already = textMatchesLanguage(text, language);
  if (already && !speaker) return text;
  const grammar = speaker === "woman" ? "feminine" : speaker === "man" ? "masculine" : "natural";
  const system = already
    ? `Rewrite this ${name} phone greeting so the speaker is a ${speaker}. Use ${grammar} first-person verbs and adjectives. Return only the spoken line.`
    : `Translate this phone greeting into ${name} using ${name} script. The speaker is a ${speaker ?? "person"}. Use ${grammar} first-person verbs and adjectives. A woman says Hindi "सकती हूँ" and Gujarati "આવી છું", never "सकता हूँ" or "આવ્યો છું". Return only the spoken line.`;
  try {
    const translated = await completeChat({
      system,
      history: [{ role: "user", content: text }],
    });
    const line = translated.trim();
    return textMatchesLanguage(line, language) ? line : text;
  } catch {
    return text;
  }
}

export type TurnResult = {
  userText: string;
  assistantText: string;
  audioBase64: string;
  mime: "audio/mpeg";
};

async function requireAgent(organizationId: string, agentId: string) {
  const [row] = await db
    .select({
      agent: agents,
      organization: organizations,
    })
    .from(agents)
    .innerJoin(organizations, eq(organizations.id, agents.organizationId))
    .where(and(eq(agents.id, agentId), eq(agents.organizationId, organizationId)))
    .limit(1);

  if (!row) throw new HttpError(404, "Agent not found");
  return row;
}

async function requireActiveCall(organizationId: string, callId: string) {
  const [call] = await db
    .select()
    .from(calls)
    .where(and(eq(calls.id, callId), eq(calls.organizationId, organizationId)))
    .limit(1);

  if (!call) throw new HttpError(404, "Call not found");
  if (call.status !== "active") throw new HttpError(409, "Call has ended");
  return call;
}

function audioPayload(text: string, audio: Buffer): TurnResult {
  return {
    userText: "",
    assistantText: text,
    audioBase64: audio.toString("base64"),
    mime: "audio/mpeg",
  };
}

export async function startCall(
  organizationId: string,
  agentId: string,
  options?: { channel?: "browser" | "phone"; callerPhone?: string },
) {
  const { agent, organization } = await requireAgent(organizationId, agentId);
  if (!agent.isActive) throw new HttpError(409, "This line is paused, so it will not answer.");

  const [call] = await db
    .insert(calls)
    .values({
      organizationId,
      agentId: agent.id,
      channel: options?.channel ?? "browser",
      callerPhone: options?.callerPhone?.trim() ?? "",
    })
    .returning();

  if (!call) throw new HttpError(500, "Could not start call");

  const picked = pickGreeting(call.id, agent.greeting, agent.greetingB);
  const status = officeStatus(new Date(), organization.timezone, parseHours(organization.hours));
  const greetingSource = status.open
    ? picked.text
    : organization.afterHoursGreeting.trim() ||
      `${picked.text} We are closed right now, but I can take a message or book the next opening.`;
  const speaker = await voiceSpeaker(agent.voiceId);
  const greeting = await speakInLanguage(greetingSource, agent.language, speaker);

  await db.update(calls).set({ greetingVariant: picked.variant }).where(eq(calls.id, call.id));
  await db.insert(messages).values({ callId: call.id, role: "assistant", content: greeting });

  const audio = await synthesize(greeting, agent.voiceId, agent.language);
  return {
    call: { ...call, greetingVariant: picked.variant },
    greeting: {
      text: greeting,
      audioBase64: audio.toString("base64"),
      mime: "audio/mpeg" as const,
    },
  };
}

export async function getCallLanguage(organizationId: string, callId: string) {
  const call = await requireActiveCall(organizationId, callId);
  const { agent } = await requireAgent(organizationId, call.agentId);
  return agent.language;
}

type TalkEvent = { type: "text"; text: string } | { type: "notice"; text: string };

async function* talk(
  organizationId: string,
  callId: string,
  userText: string,
  options?: { signal?: AbortSignal; onMark?: (mark: TurnMark) => void },
): AsyncGenerator<TalkEvent> {
  const call = await requireActiveCall(organizationId, callId);
  const { agent, organization } = await requireAgent(organizationId, call.agentId);
  const text = userText.trim();
  if (!text) return;

  await db.insert(messages).values({ callId: call.id, role: "user", content: text });
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.callId, call.id))
    .orderBy(asc(messages.createdAt));
  const speaker = await voiceSpeaker(agent.voiceId);
  const office = await officeBrief(organizationId, agent.knowledge);
  const system = buildSystemPrompt({
    agentName: agent.name,
    businessName: organization.name,
    persona: agent.systemPrompt,
    knowledge: "",
    language: agent.language,
    office,
    speaker,
  });
  const signal = options?.signal;
  let continuation: Array<{ role: string; parts: unknown[] }> = [];
  let markedToken = false;

  for (let round = 0; round < 3; round += 1) {
    if (signal?.aborted) return;
    let tool: { name: string; args: Record<string, unknown>; part: Record<string, unknown> } | null = null;
    for await (const event of streamChat({
      system,
      history: history.map((message) => ({
        role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: message.content,
      })),
      tools: [DESK_TOOL],
      continuation,
      signal,
    })) {
      if (signal?.aborted) return;
      if (event.type === "tool") {
        tool = event;
        continue;
      }
      if (!markedToken) {
        markedToken = true;
        options?.onMark?.("llmFirstToken");
      }
      yield { type: "text", text: event.text };
    }
    if (!tool || signal?.aborted) return;
    const result = await runDeskAction(organizationId, {
      ...(tool.args as DeskArgs),
      callId: call.id,
      callerPhone: call.callerPhone,
    });
    yield { type: "notice", text: result.notice };
    continuation = [
      ...continuation,
      { role: "model", parts: [tool.part] },
      { role: "user", parts: [{ functionResponse: { name: tool.name, response: { result: result.speech } } }] },
    ];
  }
}

export type SpokenChunk =
  | { type: "audio"; data: string }
  | { type: "assistant"; text: string }
  | { type: "notice"; text: string };

export type TurnMark = "llmFirstToken" | "llmSentence" | "ttsFirst";

export async function* speakTurn(
  organizationId: string,
  callId: string,
  userText: string,
  options?: { signal?: AbortSignal; onMark?: (mark: TurnMark) => void },
): AsyncGenerator<SpokenChunk> {
  const call = await requireActiveCall(organizationId, callId);
  const { agent } = await requireAgent(organizationId, call.agentId);
  let reply = "";
  let unspoken = "";
  let markedSentence = false;
  let markedAudio = false;
  const signal = options?.signal;
  const aborted = () => Boolean(signal?.aborted);
  const speakSentence = async function* (sentence: string) {
    if (!markedSentence) {
      markedSentence = true;
      options?.onMark?.("llmSentence");
    }
    for await (const chunk of streamSpeech(sentence, agent.voiceId, signal, agent.language)) {
      if (aborted()) return;
      if (!markedAudio) {
        markedAudio = true;
        options?.onMark?.("ttsFirst");
      }
      yield { type: "audio" as const, data: chunk.toString("base64") };
    }
  };

  try {
    for await (const event of talk(organizationId, callId, userText, options)) {
      if (aborted()) return;
      if (event.type === "notice") {
        yield event;
        continue;
      }
      reply += event.text;
      unspoken += event.text;
      const pulled = pullSpeakable(unspoken, false);
      unspoken = pulled.rest;
      for (const sentence of pulled.ready) {
        if (aborted()) return;
        yield* speakSentence(sentence);
        if (aborted()) return;
      }
    }
  } catch (error) {
    if (aborted()) return;
    if (!reply) throw error;
  }

  if (aborted()) return;

  const tail = pullSpeakable(unspoken, true);
  for (const sentence of tail.ready) {
    if (aborted()) return;
    yield* speakSentence(sentence);
    if (aborted()) return;
  }

  const spoken = reply.trim();
  if (!spoken) throw new HttpError(502, "Gemini returned an empty reply");
  await db.insert(messages).values({ callId: call.id, role: "assistant", content: spoken });
  yield { type: "assistant", text: spoken };
}

export async function endCall(organizationId: string, callId: string) {
  const call = await requireActiveCall(organizationId, callId);
  const transcript = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.callId, call.id))
    .orderBy(asc(messages.createdAt));
  let summary = call.summary;
  let tags = call.tags;
  let intent = call.intent;
  if (transcript.length > 1) {
    try {
      const wrap = await completeChat({
        system:
          "Summarize this phone call for the front desk. First line is comma-separated tags chosen from: faq, booking, reschedule, cancel, callback, transfer, lead, complaint, order, triage, emergency, billing, other. Then write two short sentences.",
        history: [
          {
            role: "user",
            content: transcript
              .map((message) => `${message.role}: ${message.content}`)
              .join("\n")
              .slice(0, 6000),
          },
        ],
      });
      const parsed = parseCallWrap(wrap);
      summary = parsed.summary;
      tags = call.tags || parsed.tags;
      intent = call.intent || parsed.intent;
    } catch {
      summary = call.summary;
    }
  }
  const [updated] = await db
    .update(calls)
    .set({
      status: "ended",
      endedAt: new Date(),
      summary,
      tags,
      intent,
      recordingStatus: call.recordingUrl ? "audio" : "transcript",
    })
    .where(eq(calls.id, call.id))
    .returning();
  return updated;
}

export async function runTurn(
  organizationId: string,
  callId: string,
  input: { text?: string; audio?: Buffer; mime?: string },
): Promise<TurnResult> {
  const call = await requireActiveCall(organizationId, callId);
  const { agent } = await requireAgent(organizationId, call.agentId);

  let userText = input.text?.trim() ?? "";
  if (!userText && input.audio) {
    userText = await transcribe({
      audio: input.audio,
      mime: input.mime ?? "audio/webm",
      language: agent.language,
    });
  }

  if (!userText) {
    const missed = missedLine(agent.language);
    const audio = await synthesize(missed, agent.voiceId, agent.language);
    return { ...audioPayload(missed, audio), userText: "" };
  }

  let reply = "";
  for await (const event of talk(organizationId, callId, userText)) {
    if (event.type === "text") reply += event.text;
  }
  reply = reply.trim();
  if (!reply) throw new HttpError(502, "Gemini returned an empty reply");
  await db.insert(messages).values({ callId: call.id, role: "assistant", content: reply });

  const audio = await synthesize(reply, agent.voiceId, agent.language);
  return {
    userText,
    assistantText: reply,
    audioBase64: audio.toString("base64"),
    mime: "audio/mpeg",
  };
}

export async function listCalls(organizationId: string) {
  const rows = await db
    .select({
      id: calls.id,
      agentId: calls.agentId,
      agentName: agents.name,
      status: calls.status,
      startedAt: calls.startedAt,
      endedAt: calls.endedAt,
    })
    .from(calls)
    .innerJoin(agents, eq(agents.id, calls.agentId))
    .where(eq(calls.organizationId, organizationId))
    .orderBy(desc(calls.startedAt))
    .limit(50);

  const previews = await Promise.all(
    rows.map(async (row) => {
      const [latest] = await db
        .select({ content: messages.content, role: messages.role })
        .from(messages)
        .where(eq(messages.callId, row.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);
      return {
        ...row,
        preview: latest?.content ?? "",
      };
    }),
  );

  return previews;
}

export async function getCall(organizationId: string, callId: string) {
  const [call] = await db
    .select({
      id: calls.id,
      agentId: calls.agentId,
      agentName: agents.name,
      status: calls.status,
      summary: calls.summary,
      tags: calls.tags,
      intent: calls.intent,
      transferTarget: calls.transferTarget,
      recordingStatus: calls.recordingStatus,
      recordingUrl: calls.recordingUrl,
      channel: calls.channel,
      callerPhone: calls.callerPhone,
      greetingVariant: calls.greetingVariant,
      startedAt: calls.startedAt,
      endedAt: calls.endedAt,
    })
    .from(calls)
    .innerJoin(agents, eq(agents.id, calls.agentId))
    .where(and(eq(calls.id, callId), eq(calls.organizationId, organizationId)))
    .limit(1);

  if (!call) throw new HttpError(404, "Call not found");

  const transcript = await db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.callId, call.id))
    .orderBy(asc(messages.createdAt));

  return { ...call, messages: transcript };
}
