import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError, parseBody } from "../lib/http";
import { latencySeverity, measureLatency } from "../lib/latency";
import { openScribe } from "../lib/scribe-live";
import { endCall, getCall, getCallLanguage, listCalls, runTurn, speakTurn, startCall } from "../lib/turns";

const startSchema = z.object({
  agentId: z.string().uuid(),
  callerPhone: z.string().trim().max(30).optional(),
});

const textSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

const pcmMessageSchema = z.object({
  type: z.literal("pcm"),
  data: z.string().min(1),
});

const textMessageSchema = z.object({
  type: z.literal("text"),
  text: z.string().trim().min(1).max(2000),
});

const bargeMessageSchema = z.object({
  type: z.literal("barge"),
});

export async function callRoutes(app: FastifyInstance) {
  app.get("/calls", { preHandler: [app.authenticate] }, async (request) => {
    return listCalls(request.user.orgId);
  });

  app.get("/calls/:id", { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    return getCall(request.user.orgId, id);
  });

  app.post("/calls", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = parseBody(startSchema, request.body);
    const started = await startCall(request.user.orgId, body.agentId, { callerPhone: body.callerPhone });
    return reply.code(201).send(started);
  });

  app.post("/calls/:id/end", { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    return endCall(request.user.orgId, id);
  });

  app.post("/calls/:id/turn", { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const contentType = request.headers["content-type"] ?? "";

    if (contentType.includes("multipart/form-data")) {
      const file = await request.file();
      if (!file) throw new HttpError(400, "Audio file is required");
      const audio = await file.toBuffer();
      return runTurn(request.user.orgId, id, { audio, mime: file.mimetype });
    }

    const body = parseBody(textSchema, request.body);
    return runTurn(request.user.orgId, id, { text: body.text });
  });

  app.get(
    "/ws/calls/:id",
    { websocket: true, preHandler: [app.authenticate] },
    (socket, request) => {
      const { id } = request.params as { id: string };
      const organizationId = request.user.orgId;
      let closed = false;
      let busy = false;
      let generation = 0;
      let activeTurn: AbortController | null = null;
      const queue: string[] = [];
      let scribe: ReturnType<typeof openScribe> | null = null;

      const send = (payload: unknown) => {
        if (!closed) socket.send(JSON.stringify(payload));
      };

      const interrupt = () => {
        generation += 1;
        activeTurn?.abort();
        activeTurn = null;
        queue.length = 0;
        busy = false;
        send({ type: "status", phase: "listening" });
      };

      const pump = async () => {
        if (busy || closed) return;
        const text = queue.shift();
        if (!text) return;
        busy = true;
        const mine = ++generation;
        const controller = new AbortController();
        activeTurn = controller;
        const speechEndMs = Date.now();
        const marks = {
          callId: id,
          speechEndMs,
          sttFinalMs: Date.now(),
          llmFirstTokenMs: 0,
          llmSentenceCompleteMs: 0,
          ttsFirstChunkMs: 0,
        };
        let logged = false;
        send({ type: "user", text });
        send({ type: "status", phase: "thinking" });
        try {
          for await (const event of speakTurn(organizationId, id, text, {
            signal: controller.signal,
            onMark: (mark) => {
              const now = Date.now();
              if (mark === "llmFirstToken") marks.llmFirstTokenMs = now;
              if (mark === "llmSentence") marks.llmSentenceCompleteMs = now;
              if (mark === "ttsFirst" && !logged) {
                marks.ttsFirstChunkMs = now;
                logged = true;
                const latency = measureLatency(marks);
                const severity = latencySeverity(latency);
                const line = { latency };
                if (severity === "alert") request.log.error(line, "turn latency");
                else if (severity === "warning") request.log.warn(line, "turn latency");
                else request.log.info(line, "turn latency");
                send({ type: "latency", totalMs: latency.totalLatency });
              }
            },
          })) {
            if (closed || mine !== generation) return;
            if (event.type === "audio") send({ type: "audio", data: event.data, sampleRate: 24000 });
            else if (event.type === "notice") send({ type: "notice", text: event.text });
            else send({ type: "assistant", text: event.text });
          }
          if (mine === generation) send({ type: "status", phase: "listening" });
        } catch (error) {
          if (mine !== generation || controller.signal.aborted) return;
          const message = error instanceof HttpError ? error.message : "Turn failed";
          send({ type: "error", message });
          send({ type: "status", phase: "listening" });
        } finally {
          if (mine === generation) {
            busy = false;
            activeTurn = null;
            void pump();
          }
        }
      };

      void getCallLanguage(organizationId, id)
        .then((language) => {
          if (closed) return;
          scribe = openScribe({
            language,
            onPartial: (text) => {
              if (!busy) send({ type: "partial", text });
            },
            onCommit: (text) => {
              if (text.length < 2) return;
              queue.push(text);
              void pump();
            },
            onError: (message) => send({ type: "error", message }),
          });
        })
        .catch((error: unknown) => {
          const message = error instanceof HttpError ? error.message : "Could not start listening";
          send({ type: "error", message });
        });

      socket.on("message", (raw: Buffer | ArrayBuffer | Buffer[]) => {
        try {
          const encoded = Buffer.isBuffer(raw)
            ? raw
            : Array.isArray(raw)
              ? Buffer.concat(raw)
              : Buffer.from(raw);
          const parsed: unknown = JSON.parse(encoded.toString());
          const pcm = pcmMessageSchema.safeParse(parsed);
          const text = textMessageSchema.safeParse(parsed);
          const barge = bargeMessageSchema.safeParse(parsed);
          if (pcm.success) {
            if (!busy) scribe?.sendPcm(pcm.data.data);
            return;
          }
          if (barge.success) {
            interrupt();
            return;
          }
          if (text.success) {
            queue.push(text.data.text);
            void pump();
            return;
          }
          send({ type: "error", message: "Unrecognized message" });
        } catch (error) {
          const message = error instanceof HttpError ? error.message : "Turn failed";
          send({ type: "error", message });
        }
      });

      socket.on("close", () => {
        closed = true;
        scribe?.close();
      });
    },
  );
}
