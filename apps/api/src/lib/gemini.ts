import { env } from "../env";
import { HttpError } from "./http";
import { extractGeminiText } from "./prompt";
import { joinStreamDelta } from "./speech";

function describeGeminiFailure(status: number, raw: string) {
  if (status === 429 || raw.includes("RESOURCE_EXHAUSTED") || raw.includes("Quota exceeded")) {
    return "Gemini's free daily limit for this model is used up. It resets around midnight Pacific time.";
  }
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    const message = parsed.error?.message?.split("\n")[0];
    if (message) return message;
  } catch {
    // The body was not JSON.
  }
  return raw.slice(0, 240) || `Gemini request failed (${status})`;
}

export async function completeChat(input: {
  system: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: input.history.map((message) => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }],
        })),
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 120,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    },
  );

  const raw = await response.text();
  if (!response.ok) {
    throw new HttpError(response.status === 429 ? 429 : 502, describeGeminiFailure(response.status, raw));
  }
  const payload: unknown = raw ? JSON.parse(raw) : null;

  const text = extractGeminiText(payload);
  if (!text) {
    throw new HttpError(502, "Gemini returned an empty reply");
  }
  return text;
}

export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; args: Record<string, unknown>; part: Record<string, unknown> };

function readTool(payload: unknown) {
  const data = payload as {
    candidates?: Array<{ content?: { parts?: Array<Record<string, unknown>> } }>;
  };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const call = part.functionCall as { name?: string; args?: Record<string, unknown> } | undefined;
    if (call?.name) {
      return { name: call.name, args: call.args ?? {}, part };
    }
  }
  return null;
}

export async function* streamChat(input: {
  system: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  tools?: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
  continuation?: Array<{ role: string; parts: unknown[] }>;
  signal?: AbortSignal;
}): AsyncGenerator<ChatEvent> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      signal: input.signal,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: [
          ...input.history.map((message) => ({
            role: message.role === "assistant" ? "model" : "user",
            parts: [{ text: message.content }],
          })),
          ...(input.continuation ?? []),
        ],
        tools: input.tools ? [{ functionDeclarations: input.tools }] : undefined,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 320,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    },
  );

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new HttpError(response.status === 429 ? 429 : 502, describeGeminiFailure(response.status, detail));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";
  let pendingTool: ChatEvent | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const json = line.slice(5).trim();
      if (!json || json === "[DONE]") continue;
      let payload: unknown;
      try {
        payload = JSON.parse(json);
      } catch {
        continue;
      }
      const tool = readTool(payload);
      if (tool) pendingTool = { type: "tool", ...tool };
      const next = extractGeminiText(payload);
      if (!next) continue;
      if (next.startsWith(accumulated)) {
        const delta = next.slice(accumulated.length);
        accumulated = next;
        if (delta) yield { type: "text", text: delta };
      } else {
        const delta = joinStreamDelta(accumulated, next);
        accumulated += delta;
        yield { type: "text", text: delta };
      }
    }
  }
  if (pendingTool) yield pendingTool;
}
