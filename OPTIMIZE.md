```markdown
Voice Bot Performance, Latency & Noise Handling Guide
```

## Latency Budget (Target: <800ms caller-stops → bot-starts-speaking)

| Stage | Target | What to do |

|-------|--------|-----------|

| VAD (detect silence) | 50ms | Silero VAD, 20ms frames |

| STT (voice → text) | 80–120ms | Streaming STT with interim results |

| LLM (think + reply) | 150–250ms | Fast model, streaming tokens |

| TTS (text → voice) | 60–100ms | Streaming TTS, first chunk ASAP |

| Network overhead | 50ms | Co-locate services, same region |

| **Total** | **~400–570ms** | ✅ Feels natural |

---

## 1. Latency Optimization

### The #1 Rule: Stream Everything (Don't Wait)

```

❌ BAD:  Wait for full sentence → wait for full LLM reply → wait for full TTS → play

✅ GOOD: Stream audio in → STT emits partials → LLM streams tokens → TTS starts on first sentence

```

### Specifics per Layer

- **STT:** Use streaming mode. Don't wait for the caller to finish the full sentence. Start processing as they speak.

- **LLM:** Stream tokens. As soon as the LLM generates a complete sentence (e.g., "Your appointment is confirmed"), send THAT sentence to TTS immediately. Don't wait for the full response.

- **TTS:** Stream audio chunks back to the caller. Play the first 200ms of audio as soon as it arrives.

### Sentence-Level TTS Flushing

```typescript

// In orchestrator.ts — flush TTS per sentence, not per full response

for await (const token of [llm.stream](http://llm.stream)(messages, systemPrompt)) {

  buffer += token;

  if (buffer.match(/[.!?।]$/)) {  // sentence boundary

    for await (const chunk of tts.speak(buffer, voiceId)) {

      sendToCaller(chunk);  // play immediately

    }

    buffer = '';

  }

}

```

### Server Placement

- Put your Node.js server, STT, LLM, and TTS in the **same cloud region** (e.g., Mumbai / ap-south-1 for India).

- Every extra region hop adds 30–80ms.

---

## 2. Best LLM for Low Latency

| LLM | Time to First Token (TTFT) | Why |

|-----|---------------------------|-----|

| **GPT-4o-mini** | ~150ms | Cheapest, fast enough for simple FAQ bots |

| **GPT-4.1** | ~200ms | Best balance of speed + quality. Best tool-calling for calendar/CRM |

| **Groq + Llama 3.3 70B** | ~180ms | Hardware-optimized (LPU). Fastest cloud inference |

| **Gemini 3 Flash** | ~870ms first answer | Best for multilingual (Indian languages) |

| **Local: Qwen3-4B via vLLM** | ~100ms (on GPU) | Free, private, but needs your own GPU |

**Recommendation:**

- Start with **GPT-4o-mini** (cheapest, fast enough).

- Upgrade to **GPT-4.1** when you need better tool-calling (calendar booking, CRM).

- For Indian languages, **Gemini 3 Flash** handles Hindi/Tamil well.

---

## 3. Noise Handling (3-Layer Defense)

```

Layer 1: Audio Preprocessing (before STT)

Layer 2: Noise-Robust STT Model (handles remaining noise)

Layer 3: LLM Forgiveness (understands garbled intent)

```

### Layer 1: Audio Preprocessing

| Technique | What it does | Tool |

|-----------|-------------|------|

| **Resampling** | Convert to 16kHz (STT expects this) | `ffmpeg` or `wav` in Node |

| **AGC (Automatic Gain Control)** | Normalizes volume — quiet callers amplified, loud callers reduced | WebRTC APM, or `speexdsp` |

| **Noise Suppression** | Removes background noise (fans, traffic, wind) | **RNNoise** (open-source, <5ms latency) or **Krisp SDK** (commercial) |

| **Echo Cancellation (AEC)** | Prevents the bot from hearing its own voice | WebRTC AEC3, or tag TTS frames and skip STT during playback |

| **Voice Isolation** | Neural network that extracts human voice from mixed audio | **ElevenLabs Audio Isolation**, or **ai-coustics** SDK |

**For telephony specifically (India):**

- PSTN audio arrives at 8kHz, compressed (G.711/G.729), often clipped.

- **Always resample to 16kHz before STT.**

- Apply AGC + RNNoise as a lightweight preprocessing chain.

- **Do NOT over-process.** Modern STT models (Deepgram, AssemblyAI) are trained on noisy audio. Heavy noise cancellation can actually _hurt_ accuracy. Use light preprocessing only.

**Node.js packages:**

- `rnnoise-node` or `pyrnnoise` (via child process) — RNNoise, 5ms latency

- `webrtc-apsm` — WebRTC Audio Processing Module (AEC + AGC + NS in one)

- `ffmpeg-static` — resampling, format conversion

### Layer 2: Best Noise-Robust STT Models

| STT | Noise Robustness | Latency | Best For |

|-----|-----------------|---------|----------|

| **Deepgram Nova-3** | ⭐⭐⭐⭐⭐ (built for telephony noise) | 90ms | **Your best pick.** Trained on phone audio, far-field, noisy conditions. |

| **AssemblyAI Universal-Streaming** | ⭐⭐⭐⭐⭐ | 90ms | Trained on diverse real-world noise. Great for Indian accents. |

| **ElevenLabs Scribe v2 Realtime** | ⭐⭐⭐⭐ | ~100ms | Has audio isolation built-in. Good for multilingual. |

| **NVIDIA Canary-Qwen 2.5B** (open-source) | ⭐⭐⭐⭐⭐ (2.41% WER at 10dB SNR) | Self-host | #1 on Open ASR Leaderboard. Best noise tolerance in open-source. |

| **Whisper Large V3 / Turbo** (open-source) | ⭐⭐⭐⭐ | Self-host | 99 languages. Strong in noise. Use `turbo` for speed. |

| **IBM Granite Speech 3.3 8B** (open-source) | ⭐⭐⭐⭐ (7.54% degradation clean→noisy) | Self-host | Enterprise accuracy, strong noise resilience. |

**STT Selection Matrix:**

| Scenario | STT to Use |

|----------|-----------|

| Fastest to build (API) | **Deepgram Nova-3** — purpose-built for telephony, 90ms, handles Indian phone noise |

| Best accuracy (API) | **AssemblyAI Universal-Streaming** — handles diverse accents + noise |

| Self-hosted (free, private) | **NVIDIA Canary-Qwen 2.5B** or **Whisper Turbo** on your GPU |

| Indian languages specifically | **Sarvam AI** (Indian company, built for Hindi/regional) or **IndicConformer 600M** |

### Layer 3: LLM Forgiveness Prompt

Add this to your system prompt:

```

If the caller's words are unclear or partially garbled, do NOT say "I didn't understand."

Instead, make your best guess at their intent and confirm:

"I think you'd like to book an appointment for tomorrow — is that right?"

If truly unclear, ask a short clarifying question:

"Could you repeat that, please?"

Never repeat the same question more than twice.

After two failed attempts, offer to transfer to a human agent.

```

---

## 4. Best TTS for Natural + Fast Voice

| TTS | Latency (TTFA) | Quality | Languages | Best For |

|-----|---------------|---------|-----------|----------|

| **Cartesia Sonic 3** | **40ms** ⚡ | ⭐⭐⭐⭐⭐ | 15+ | **Lowest latency. Your best pick for real-time.** |

| **ElevenLabs Flash v2.5** | ~75ms | ⭐⭐⭐⭐⭐ | 30+ | Most natural. Great for branded voices. |

| **Inworld Realtime TTS-2** | <100ms (25ms Flash) | ⭐⭐⭐⭐⭐ | 20+ | Natural language steering ("speak warmly") |

| **Kokoro 82M** (open-source) | ~30ms on GPU | ⭐⭐⭐⭐ | EN + Hindi | Free, fast, good enough for MVP |

| **CosyVoice2 0.5B** (open-source) | ~50ms | ⭐⭐⭐⭐ | 9+ | Best open-source for real-time streaming |

| **Indic Parler-TTS Mini** (open-source) | ~100ms | ⭐⭐⭐⭐ | 21 Indian | Best for Hindi, Tamil, Telugu, etc. |

**TTS Selection:**

| Scenario | TTS to Use |

|----------|-----------|

| English (API, fastest) | **Cartesia Sonic 3** — 40ms, ultra-natural |

| English (API, most natural) | **ElevenLabs Flash v2.5** — 75ms, best quality |

| Indian languages (API) | **ElevenLabs** (supports Hindi, Tamil, etc.) |

| Indian languages (self-hosted) | **Indic Parler-TTS Mini** — 21 Indian languages, Apache 2.0 |

| Budget/free (English) | **Kokoro 82M** on your GPU |

---

## 5. VAD Tuning (When Did the Caller Stop Speaking?)

This is where most bots feel "dumb" — they either cut off the caller or wait too long.

| Parameter | Default | Optimized | Effect |

|-----------|---------|-----------|--------|

| Speech threshold | 0.3 | **0.5** | Faster detection, fewer false triggers from noise |

| Min silence duration | 500ms | **300ms** | Bot responds faster after caller pauses |

| Min speech duration | 200ms | **100ms** | Catches short words like "yes", "no" |

| Frame size | 50ms | **20ms** | More precise detection |

**Key rule:** If the caller says "yes" (100ms) and then pauses (300ms), the bot should respond. Don't wait 500ms+ or it feels dead.

### Barge-in (Interruption) Logic

```typescript
// In orchestrator.ts

vad.on("speechStart", () => {
  if (tts.isPlaying()) {
    tts.cancel(); // stop TTS immediately

    discardRemainingAudio(); // flush buffer

    startListening(); // switch to STT mode
  }
});
```

---

## 6. Echo Cancellation (Prevent Bot Hearing Itself)

**Problem:** Bot speaks → its own TTS audio gets picked up by the mic → STT transcribes the bot's own words → LLM gets confused.

**Solutions (pick one):**

| Method | How | Best For |

|--------|-----|----------|

| **Frame tagging** | Tag every TTS audio frame with a timestamp. In STT pipeline, skip any frame that overlaps with a TTS frame. | Telephony (FreeSWITCH) |

| **WebRTC AEC3** | Hardware-level echo cancellation in the audio processing pipeline. | Browser-based calls |

| **Mute during TTS** | Simple: mute the mic (stop sending to STT) while TTS is playing. Sacrifices barge-in. | MVP / quick fix |

**Recommended for telephony:** Frame tagging. FreeSWITCH's `mod_audio_fork` lets you timestamp each frame. In your Node.js orchestrator, maintain a set of "TTS frame timestamps" and filter them out before sending to STT.

---

## 7. Final Recommended Stack (Optimized for India)

| Layer | Choice | Why |

|-------|--------|-----|

| **Telephony** | FreeSWITCH + Plivo SIP trunk | Self-hosted, scalable, India presence |

| **Audio Preprocessing** | RNNoise (denoise) + WebRTC APM (AGC + AEC) | <5ms overhead, handles Indian mobile noise |

| **VAD** | Silero VAD (threshold 0.5, 300ms silence) | Free, fast, accurate |

| **STT** | **Deepgram Nova-3** (API) or **Canary-Qwen 2.5B** (self-host) | Best telephony noise handling, 90ms |

| **LLM** | **GPT-4o-mini** (simple) / **GPT-4.1** (complex) | Fast, reliable, good tool-calling |

| **TTS** | **Cartesia Sonic 3** (EN) + **Indic Parler-TTS** (Indian) | 40ms latency, natural, multilingual |

| **Orchestrator** | LiveKit Agents (Node.js) | Handles streaming, barge-in, turn-taking |

| **Database** | Postgres + Redis | Multi-tenant, fast lookups |

| **Frontend** | Next.js + Tailwind + shadcn/ui | Dashboard for service providers |

---

## 8. Quick Wins (Do These First)

1. **Enable streaming on ALL three stages** (STT, LLM, TTS). This alone cuts perceived latency by 40–60%.

2. **Set VAD silence to 300ms** (not 500ms). Bot feels more responsive.

3. **Use sentence-level TTS flushing** — send each sentence to TTS as the LLM generates it, don't wait for the full reply.

4. **Add RNNoise** before STT. 5ms cost, big accuracy gain in noisy calls.

5. **Add a "I didn't catch that" fallback** in your LLM prompt. Never let the bot freeze or repeat the same question 3+ times.

6. **Co-locate everything** in the same region (Mumbai for India).

7. **Log latency at every stage** — `speechEndMs`, `sttFinalMs`, `llmFirstTokenMs`, `ttsFirstChunkMs`. You can't fix what you don't measure.

---

## 9. Latency Monitoring (Add to Every Call)

```typescript
// Log these timestamps for every call

interface CallLatency {
  callId: string;

  speechEndMs: number; // VAD detected silence

  sttFinalMs: number; // STT emitted final transcript

  llmFirstTokenMs: number; // LLM emitted first token

  llmSentenceCompleteMs: number; // LLM completed first sentence

  ttsFirstChunkMs: number; // TTS emitted first audio chunk

  callerHearsMs: number; // Audio reaches caller's phone

  // Computed

  sttLatency: number; // sttFinalMs - speechEndMs

  llmLatency: number; // llmSentenceCompleteMs - sttFinalMs

  ttsLatency: number; // ttsFirstChunkMs - llmSentenceCompleteMs

  totalLatency: number; // callerHearsMs - speechEndMs
}
```

**Alert thresholds:**

- `totalLatency` > 1000ms → warning

- `totalLatency` > 1500ms → alert (something is wrong)

- `sttLatency` > 200ms → check STT service health

- `ttsLatency` > 150ms → check TTS service health

```

Save this as `OPTIMIZE.md` in your project root. Now you have three files for your Cursor agent:

| File | Purpose |

|------|---------|

| `AGENTS.md` | Architecture, phases, project structure, build order |

| `FEATURES.md` | What to build (75 features with status tracking) |

| `OPTIMIZE.md` | How to make it fast, accurate, and noise-resistant |

```
