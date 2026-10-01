"use client";

import { useRef, useState } from "react";
import { PhoneOffIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api, callSocketUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type Line = { role: "user" | "assistant"; content: string };
type Phase = "idle" | "connecting" | "listening" | "hearing" | "thinking" | "speaking";

const phaseLabel: Record<Phase, string> = {
  idle: "Idle",
  connecting: "Connecting",
  listening: "Listening",
  hearing: "Hearing you",
  thinking: "Thinking",
  speaking: "Speaking",
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(data: string) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function downsampleToPcm16(input: Float32Array, fromRate: number) {
  const toRate = 16000;
  const ratio = fromRate / toRate;
  const length = Math.max(1, Math.floor(input.length / ratio));
  const out = new Int16Array(length);
  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += input[j] ?? 0;
    const sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return out;
}

function playFile(url: string) {
  return new Promise<void>((resolve) => {
    const audio = new Audio(url);
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    void audio.play().catch(() => resolve());
  });
}

export function CallConsole({ agentId, agentName }: { agentId: string; agentName: string }) {
  const { token } = useAuth();
  const [phase, setPhase] = useState<Phase>("idle");
  const [lines, setLines] = useState<Line[]>([]);
  const [partial, setPartial] = useState("");
  const [draft, setDraft] = useState("");
  const [callerPhone, setCallerPhone] = useState("");
  const [callId, setCallId] = useState<string | null>(null);
  const [replyMs, setReplyMs] = useState<number | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const socketRef = useRef<WebSocket | null>(null);
  const gateRef = useRef(true);
  const playCtxRef = useRef<AudioContext | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const nextPlayRef = useRef(0);
  const playingRef = useRef(0);
  const replyDoneRef = useRef(false);
  const ignoreAudioRef = useRef(false);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const prerollRef = useRef<string[]>([]);
  const micStopRef = useRef<(() => void) | null>(null);

  function setPhaseSafe(next: Phase) {
    phaseRef.current = next;
    setPhase(next);
  }

  function finishSpeakingIfQuiet() {
    if (playingRef.current === 0 && replyDoneRef.current) {
      replyDoneRef.current = false;
      gateRef.current = false;
      setPhaseSafe("listening");
    }
  }

  function stopPlayback() {
    for (const source of sourcesRef.current) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    sourcesRef.current = [];
    playingRef.current = 0;
    nextPlayRef.current = 0;
    replyDoneRef.current = false;
  }

  function bargeIn(socket: WebSocket) {
    if (ignoreAudioRef.current) return;
    ignoreAudioRef.current = true;
    stopPlayback();
    gateRef.current = false;
    setPhaseSafe("hearing");
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "barge" }));
    for (const chunk of prerollRef.current) {
      socket.send(JSON.stringify({ type: "pcm", data: chunk }));
    }
    prerollRef.current = [];
  }

  function enqueuePcm(bytes: Uint8Array) {
    const context = playCtxRef.current;
    if (!context || bytes.byteLength < 2 || ignoreAudioRef.current) return;
    const even = bytes.byteLength - (bytes.byteLength % 2);
    const samples = even / 2;
    const audioBuffer = context.createBuffer(1, samples, 24000);
    const channel = audioBuffer.getChannelData(0);
    const view = new DataView(bytes.buffer, bytes.byteOffset, even);
    for (let i = 0; i < samples; i += 1) channel[i] = view.getInt16(i * 2, true) / 32768;
    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);
    const startAt = Math.max(context.currentTime + 0.02, nextPlayRef.current);
    source.start(startAt);
    nextPlayRef.current = startAt + audioBuffer.duration;
    playingRef.current += 1;
    sourcesRef.current.push(source);
    gateRef.current = true;
    setPhaseSafe("speaking");
    source.onended = () => {
      sourcesRef.current = sourcesRef.current.filter((item) => item !== source);
      playingRef.current = Math.max(0, playingRef.current - 1);
      finishSpeakingIfQuiet();
    };
  }

  function handleSocketMessage(event: MessageEvent) {
    const payload = JSON.parse(String(event.data)) as
      | { type: "partial"; text: string }
      | { type: "user"; text: string }
      | { type: "assistant"; text: string }
      | { type: "audio"; data: string }
      | { type: "status"; phase: "thinking" | "listening" }
      | { type: "latency"; totalMs: number }
      | { type: "notice"; text: string }
      | { type: "error"; message: string };

    if (payload.type === "error") {
      toast.error(payload.message);
      return;
    }
    if (payload.type === "partial") {
      setPartial(payload.text);
      return;
    }
    if (payload.type === "user") {
      setPartial("");
      setLines((current) => [...current, { role: "user", content: payload.text }]);
      return;
    }
    if (payload.type === "assistant") {
      setLines((current) => [...current, { role: "assistant", content: payload.text }]);
      return;
    }
    if (payload.type === "audio") {
      enqueuePcm(base64ToBytes(payload.data));
      return;
    }
    if (payload.type === "notice") {
      toast(payload.text);
      return;
    }
    if (payload.type === "latency") {
      setReplyMs(payload.totalMs);
      return;
    }
    if (payload.type === "status" && payload.phase === "thinking") {
      ignoreAudioRef.current = false;
      replyDoneRef.current = false;
      gateRef.current = true;
      setPhaseSafe("thinking");
      return;
    }
    if (payload.type === "status" && payload.phase === "listening") {
      replyDoneRef.current = true;
      finishSpeakingIfQuiet();
    }
  }

  async function openMic(socket: WebSocket, context: AudioContext) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    await context.resume();
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(1024, 1, 1);
    const mute = context.createGain();
    mute.gain.value = 0;
    let noise = 0.012;
    let hotFrames = 0;
    let quietFrames = 0;
    let bargeFrames = 0;

    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      let energy = 0;
      for (const sample of input) energy += sample * sample;
      const rms = Math.sqrt(energy / input.length);
      const pcm = downsampleToPcm16(input, context.sampleRate);
      const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
      const encoded = bytesToBase64(bytes);
      prerollRef.current.push(encoded);
      if (prerollRef.current.length > 16) prerollRef.current.shift();

      if (gateRef.current) {
        const loud = rms > Math.max(0.05, noise * 6);
        bargeFrames = loud ? bargeFrames + 1 : 0;
        if (bargeFrames >= 3) bargeIn(socket);
        return;
      }

      bargeFrames = 0;
      if (rms < noise * 2) noise = noise * 0.97 + rms * 0.03;
      const hot = rms > Math.max(0.018, noise * 4);
      if (hot) {
        hotFrames += 1;
        quietFrames = 0;
        if (hotFrames > 1 && phaseRef.current === "listening") setPhaseSafe("hearing");
      } else {
        hotFrames = 0;
        quietFrames += 1;
        if (quietFrames > 8 && phaseRef.current === "hearing") setPhaseSafe("listening");
      }
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "pcm", data: encoded }));
      }
    };

    source.connect(processor);
    processor.connect(mute);
    mute.connect(context.destination);
    micStopRef.current = () => {
      processor.disconnect();
      source.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      void context.close();
      micCtxRef.current = null;
    };
  }

  async function startCall() {
    if (!token) return;
    const playback = new AudioContext();
    const micContext = new AudioContext();
    playCtxRef.current = playback;
    micCtxRef.current = micContext;
    void playback.resume();
    void micContext.resume();
    setPhaseSafe("connecting");
    setLines([]);
    setPartial("");
    setReplyMs(null);
    ignoreAudioRef.current = false;
    prerollRef.current = [];
    gateRef.current = true;
    try {
      const started = await api<{
        call: { id: string };
        greeting: { text: string; audioBase64: string; mime: string };
      }>("/calls", {
        method: "POST",
        token,
        body: JSON.stringify({ agentId, callerPhone }),
      });
      const socket = new WebSocket(callSocketUrl(started.call.id, token));
      socketRef.current = socket;
      socket.onmessage = handleSocketMessage;
      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => resolve();
        socket.onerror = () => reject(new Error("Could not open the call"));
      });
      socket.onerror = () => toast.error("The call connection dropped");
      setCallId(started.call.id);
      setLines([{ role: "assistant", content: started.greeting.text }]);
      await playFile(`data:audio/mpeg;base64,${started.greeting.audioBase64}`);
      await openMic(socket, micContext);
      gateRef.current = false;
      setPhaseSafe("listening");
    } catch (caught) {
      setPhaseSafe("idle");
      toast.error(caught instanceof Error ? caught.message : "Could not start the call");
    }
  }

  async function endCall() {
    gateRef.current = true;
    micStopRef.current?.();
    micStopRef.current = null;
    socketRef.current?.close();
    socketRef.current = null;
    void playCtxRef.current?.close();
    playCtxRef.current = null;
    if (micCtxRef.current && micCtxRef.current !== playCtxRef.current) {
      void micCtxRef.current.close();
    }
    micCtxRef.current = null;
    const id = callId;
    setCallId(null);
    setPartial("");
    setPhaseSafe("idle");
    if (!token || !id) return;
    try {
      await api(`/calls/${id}/end`, { method: "POST", token });
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not end the call");
    }
  }

  function sendText(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    const socket = socketRef.current;
    if (!text || !socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "text", text }));
    setDraft("");
  }

  const inCall = Boolean(callId);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="min-h-[420px]">
        <CardHeader>
          <CardTitle>Transcript</CardTitle>
        </CardHeader>
        <CardContent>
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">Start a call and {agentName} will greet you, then listen.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {lines.map((line, index) => (
                <li
                  key={`${line.role}-${index}`}
                  className={cn(
                    "max-w-[85%] rounded-xl px-3 py-2 text-sm",
                    line.role === "assistant" ? "bg-muted" : "ml-auto bg-primary text-primary-foreground",
                  )}
                >
                  {line.content}
                </li>
              ))}
              {partial ? <li className="max-w-[85%] text-sm text-muted-foreground">{partial}</li> : null}
            </ol>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>{agentName}</CardTitle>
            <Badge variant={inCall ? "default" : "secondary"}>{phaseLabel[phase]}</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {inCall ? (
            <>
              <p className="text-sm text-muted-foreground">
                {phase === "hearing"
                  ? "Hearing you. Pause when you finish."
                  : phase === "thinking"
                    ? "Working on a reply."
                    : phase === "speaking"
                      ? "Speaking. Talk over it to interrupt."
                      : "Listening. Just talk, then pause."}
              </p>
              {replyMs !== null ? (
                <p className="text-xs text-muted-foreground">Reply started in {replyMs} ms.</p>
              ) : null}
              <form onSubmit={sendText} className="flex flex-col gap-3">
                <Field>
                  <FieldLabel htmlFor="utterance">Or type a line</FieldLabel>
                  <Input
                    id="utterance"
                    value={draft}
                    disabled={phase === "thinking" || phase === "speaking"}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                </Field>
                <Button type="submit" variant="secondary" disabled={!draft.trim() || phase === "thinking" || phase === "speaking"}>
                  Send
                </Button>
              </form>
              <Button type="button" variant="outline" onClick={() => void endCall()}>
                <PhoneOffIcon data-icon="inline-start" />
                End call
              </Button>
            </>
          ) : (
            <>
              <Field>
                <FieldLabel htmlFor="caller-phone">Caller phone</FieldLabel>
                <Input
                  id="caller-phone"
                  value={callerPhone}
                  placeholder="Used for bookings and callbacks"
                  onChange={(event) => setCallerPhone(event.target.value)}
                />
              </Field>
              <Button type="button" size="lg" disabled={phase === "connecting"} onClick={() => void startCall()}>
                {phase === "connecting" ? <Spinner data-icon="inline-start" /> : null}
                Start call
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
