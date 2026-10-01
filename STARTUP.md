# Startup: AI Voice Call Bot (White-Label SaaS)

## Mission

Build a multi-tenant AI voice agent platform in Node.js. Service providers (clinics, salons, dealerships) sign up, configure their bot (persona, voice, language, phone number), and the bot answers their incoming calls 24/7 using STT → LLM → TTS.

## Tech Stack

- **Runtime:** Node.js 20+, TypeScript 5.x (strict mode)

- **Backend:** Fastify 5, WebSocket via `@fastify/websocket`

- **Frontend (dashboard):** Next.js 15 (App Router), Tailwind CSS, shadcn/ui

- **Database:** PostgreSQL 16 + Drizzle ORM

- **Cache/Queue:** Redis 7 (ioredis)

- **STT:** Deepgram streaming API (Phase 1–2), faster-whisper via gRPC microservice (Phase 3+)

- **LLM:** OpenAI API (gpt-4o-mini) with streaming. Local Llama 3 via vLLM later.

- **TTS:** Cartesia API (streaming, low latency). Kokoro/Indic Parler-TTS later for self-hosting.

- **VAD:** Silero VAD via `sherpa-onnx-node` (Phase 2+)

- **Telephony:** FreeSWITCH (Phase 3+), SIP trunk via Plivo

- **Auth:** NextAuth (dashboard), JWT for API

- **Testing:** Vitest, Playwright (E2E)

- **Monorepo:** pnpm workspaces

## Commands

- Install: `pnpm install`

- Dev (backend): `pnpm --filter api dev`

- Dev (frontend): `pnpm --filter web dev`

- Dev (all): `pnpm dev`

- Test: `pnpm test`

- Test single: `pnpm test -- --filter <name>`

- Typecheck: `pnpm typecheck`

- Lint: `pnpm lint --fix`

- DB migrate: `pnpm --filter api db:migrate`

- DB seed: `pnpm --filter api db:seed`

## Project Structure
