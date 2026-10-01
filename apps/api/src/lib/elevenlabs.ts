import { env } from "../env";
import { HttpError } from "./http";
import { speechLanguage, speakerFromLabels } from "./prompt";

function speechBody(text: string, language?: string) {
  const code = speechLanguage(language, text);
  const wide = code === "gu" || code === "te";
  return {
    text,
    model_id: wide ? "eleven_v3_conversational" : env.ELEVENLABS_MODEL_ID,
    ...(code ? { language_code: code } : {}),
  };
}

function extensionFor(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4")) return "mp4";
  return "webm";
}

export async function transcribe(input: {
  audio: Buffer;
  mime: string;
  language: string;
}): Promise<string> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([Uint8Array.from(input.audio)], { type: input.mime || "application/octet-stream" }),
    `utterance.${extensionFor(input.mime)}`,
  );
  form.append("model_id", "scribe_v2");
  form.append("no_verbatim", "true");
  if (input.language && input.language !== "auto") {
    form.append("language_code", input.language);
  }

  const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
    body: form,
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new HttpError(502, `Speech-to-text failed (${response.status})`);
  }

  const text =
    payload && typeof payload === "object" && "text" in payload
      ? String((payload as { text: unknown }).text ?? "")
      : "";
  return text.trim();
}

export async function synthesize(text: string, voiceId: string, language?: string): Promise<Buffer> {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify(speechBody(text, language)),
    },
  );

  if (!response.ok) {
    throw new HttpError(502, `Text-to-speech failed (${response.status})`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function* streamSpeech(
  text: string,
  voiceId: string,
  signal?: AbortSignal,
  language?: string,
): AsyncGenerator<Buffer> {
  const spoken = speechBody(text, language);
  const latency = spoken.model_id === env.ELEVENLABS_MODEL_ID ? "&optimize_streaming_latency=3" : "";
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=pcm_24000${latency}`,
    {
      method: "POST",
      signal,
      headers: {
        "xi-api-key": env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/octet-stream",
      },
      body: JSON.stringify(spoken),
    },
  );

  if (!response.ok || !response.body) {
    throw new HttpError(502, `Text-to-speech failed (${response.status})`);
  }

  const reader = response.body.getReader();
  let pending = Buffer.alloc(0);
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.byteLength) continue;
    pending = Buffer.concat([pending, Buffer.from(value)]);
    const even = pending.length - (pending.length % 2);
    if (even > 0) {
      yield pending.subarray(0, even);
      pending = pending.subarray(even);
    }
  }
}

export type VoiceOption = {
  voiceId: string;
  name: string;
  labels: string;
};

const speakers = new Map<string, "woman" | "man" | undefined>();

export async function voiceSpeaker(voiceId: string) {
  if (speakers.has(voiceId)) return speakers.get(voiceId);
  const response = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
  });
  if (!response.ok) {
    speakers.set(voiceId, undefined);
    return undefined;
  }
  const payload = (await response.json()) as { labels?: Record<string, string> };
  const speaker = speakerFromLabels(payload.labels);
  speakers.set(voiceId, speaker);
  return speaker;
}

export async function listVoices(): Promise<VoiceOption[]> {
  const response = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
  });
  if (!response.ok) {
    throw new HttpError(502, `Could not load voices (${response.status})`);
  }

  const payload = (await response.json()) as {
    voices?: Array<{ voice_id: string; name: string; labels?: Record<string, string> }>;
  };

  return (payload.voices ?? []).map((voice) => ({
    voiceId: voice.voice_id,
    name: voice.name,
    labels: [voice.labels?.gender, voice.labels?.accent, voice.labels?.age].filter(Boolean).join(" · "),
  }));
}
