import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { corsOrigins, env } from "./env";
import { HttpError } from "./lib/http";
import { agentRoutes } from "./routes/agents";
import { authRoutes } from "./routes/auth";
import { callRoutes } from "./routes/calls";
import { deskRoutes } from "./routes/desk";
import "./types";

const app = Fastify({
  logger: {
    redact: ["req.headers.authorization"],
    serializers: {
      req(request) {
        return {
          method: request.method,
          url: request.url.replace(/token=[^&]+/g, "token=redacted"),
        };
      },
    },
  },
});

await app.register(cors, {
  origin: corsOrigins,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
});

await app.register(jwt, { secret: env.JWT_SECRET });
await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024 } });
await app.register(websocket, {
  options: { maxPayload: 8 * 1024 * 1024 },
});

app.decorate("authenticate", async (request, reply) => {
  const header = request.headers.authorization;
  const queryToken =
    typeof request.query === "object" &&
    request.query !== null &&
    "token" in request.query &&
    typeof request.query.token === "string"
      ? request.query.token
      : undefined;

  if (!header && queryToken) {
    request.headers.authorization = `Bearer ${queryToken}`;
  }

  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
});

app.setErrorHandler((error: unknown, request, reply) => {
  if (error instanceof HttpError) {
    return reply.code(error.statusCode).send({ error: error.message });
  }

  request.log.error(error);
  const statusCode =
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
      ? error.statusCode
      : 500;
  const message =
    statusCode >= 500
      ? "Something went wrong"
      : error instanceof Error
        ? error.message
        : "Request failed";
  return reply.code(statusCode).send({ error: message });
});

app.get("/health", async () => ({ ok: true }));

await app.register(authRoutes);
await app.register(agentRoutes);
await app.register(callRoutes);
await app.register(deskRoutes);

await app.listen({ port: env.PORT, host: "0.0.0.0" });
