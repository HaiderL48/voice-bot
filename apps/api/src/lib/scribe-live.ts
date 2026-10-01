import WebSocket from "ws";
import { env } from "../env";

export type ScribeSession = {
  sendPcm: (audioBase64: string) => void;
  close: () => void;
};

export function openScribe(input: {
  language: string;
  onPartial: (text: string) => void;
  onCommit: (text: string) => void;
  onError: (message: string) => void;
}): ScribeSession {
  const params = new URLSearchParams({
    model_id: "scribe_v2_realtime",
    audio_format: "pcm_16000",
    commit_strategy: "vad",
    vad_threshold: "0.5",
    vad_silence_threshold_secs: "0.3",
    min_silence_duration_ms: "300",
    min_speech_duration_ms: "100",
    filter_background_audio: "true",
    no_verbatim: "true",
  });
  if (input.language && input.language !== "auto") {
    params.set("language_code", input.language);
  }

  const socket = new WebSocket(
    `wss://api.elevenlabs.io/v1/speech-to-text/realtime?${params.toString()}`,
    { headers: { "xi-api-key": env.ELEVENLABS_API_KEY } },
  );

  let started = false;
  const queued: string[] = [];

  const sendChunk = (audioBase64: string) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(
      JSON.stringify({
        message_type: "input_audio_chunk",
        audio_base_64: audioBase64,
        commit: false,
        sample_rate: 16000,
      }),
    );
  };

  socket.on("message", (raw: WebSocket.RawData) => {
    let payload: { message_type?: string; text?: string; error?: string };
    try {
      payload = JSON.parse(raw.toString()) as { message_type?: string; text?: string; error?: string };
    } catch {
      return;
    }

    if (payload.message_type === "session_started") {
      started = true;
      for (const chunk of queued) sendChunk(chunk);
      queued.length = 0;
      return;
    }

    if (payload.message_type === "partial_transcript") {
      input.onPartial(payload.text ?? "");
      return;
    }

    if (payload.message_type === "committed_transcript" && payload.text?.trim()) {
      input.onCommit(payload.text.trim());
      return;
    }

    const ignorable =
      payload.message_type === "insufficient_audio_activity" ||
      payload.message_type === "commit_throttled" ||
      payload.message_type === "committed_transcript_with_timestamps";
    if (!ignorable && (payload.error || payload.message_type?.includes("error"))) {
      input.onError(payload.error || "Transcription failed");
    }
  });

  socket.on("error", () => {
    input.onError("Transcription connection failed");
  });

  return {
    sendPcm(audioBase64: string) {
      if (!started) {
        queued.push(audioBase64);
        if (queued.length > 50) queued.shift();
        return;
      }
      sendChunk(audioBase64);
    },
    close() {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    },
  };
}
