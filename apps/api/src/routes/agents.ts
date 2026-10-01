import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/client";
import { agents } from "../db/schema";
import { env } from "../env";
import { listVoices } from "../lib/elevenlabs";
import { HttpError, parseBody } from "../lib/http";

const agentFields = {
  name: z.string().trim().min(1).max(80),
  greeting: z.string().trim().min(1).max(500),
  systemPrompt: z.string().trim().min(1).max(4000),
  knowledge: z.string().max(8000).default(""),
  language: z.string().trim().min(2).max(12),
  greetingB: z.string().max(500).default(""),
  voiceId: z.string().trim().min(1).max(80),
  isActive: z.boolean().default(true),
};

const createSchema = z.object(agentFields);
const updateSchema = z
  .object(agentFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");

async function findAgent(organizationId: string, agentId: string) {
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.organizationId, organizationId)))
    .limit(1);
  if (!agent) throw new HttpError(404, "Agent not found");
  return agent;
}

export async function agentRoutes(app: FastifyInstance) {
  app.get("/voices", { preHandler: [app.authenticate] }, async () => {
    return { voices: await listVoices() };
  });

  app.get("/agents", { preHandler: [app.authenticate] }, async (request) => {
    return db
      .select()
      .from(agents)
      .where(eq(agents.organizationId, request.user.orgId))
      .orderBy(desc(agents.createdAt));
  });

  app.post("/agents", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = parseBody(createSchema, request.body);
    const [agent] = await db
      .insert(agents)
      .values({
        organizationId: request.user.orgId,
        name: body.name,
        greeting: body.greeting,
        systemPrompt: body.systemPrompt,
        knowledge: body.knowledge,
        language: body.language,
        greetingB: body.greetingB,
        voiceId: body.voiceId || env.ELEVENLABS_VOICE_ID,
        isActive: body.isActive,
      })
      .returning();
    return reply.code(201).send(agent);
  });

  app.get("/agents/:id", { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    return findAgent(request.user.orgId, id);
  });

  app.patch("/agents/:id", { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    await findAgent(request.user.orgId, id);
    const body = parseBody(updateSchema, request.body);
    const [agent] = await db
      .update(agents)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(agents.id, id), eq(agents.organizationId, request.user.orgId)))
      .returning();
    return agent;
  });

  app.delete("/agents/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await findAgent(request.user.orgId, id);
    await db
      .delete(agents)
      .where(and(eq(agents.id, id), eq(agents.organizationId, request.user.orgId)));
    return reply.code(204).send();
  });
}
