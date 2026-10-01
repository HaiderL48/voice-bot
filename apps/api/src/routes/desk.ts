import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/client";
import { calls, documents, faqs, organizations, records, resources } from "../db/schema";
import { runDeskAction, type DeskArgs } from "../lib/desk";
import { bucketCalls } from "../lib/office";
import { HttpError, parseBody } from "../lib/http";

const settingsSchema = z.object({
  timezone: z.string().trim().min(1).max(80).optional(),
  industry: z.enum(["general", "clinic", "hospitality"]).optional(),
  hours: z.string().max(2000).optional(),
  transferPhone: z.string().max(30).optional(),
  emergencyPhone: z.string().max(30).optional(),
  afterHoursGreeting: z.string().max(500).optional(),
  offers: z.string().max(2000).optional(),
  competitorNotes: z.string().max(2000).optional(),
  escalation: z.string().max(2000).optional(),
});

const faqSchema = z.object({
  question: z.string().trim().min(1).max(300),
  answer: z.string().trim().min(1).max(2000),
});

const documentSchema = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(8000),
});

const resourceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.string().trim().min(1).max(40).default("staff"),
  notes: z.string().max(500).default(""),
});

const recordSchema = z.object({
  action: z.string().trim().min(1).max(40),
  name: z.string().max(80).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().max(200).optional(),
  resource: z.string().max(80).optional(),
  when: z.string().max(40).optional(),
  kind: z.string().max(40).optional(),
  detail: z.string().max(2000).optional(),
  query: z.string().max(300).optional(),
  rating: z.coerce.number().optional(),
  amount: z.string().max(40).optional(),
  channel: z.string().max(20).optional(),
  target: z.string().max(80).optional(),
  budget: z.string().max(80).optional(),
  timeline: z.string().max(80).optional(),
});

const recordPatchSchema = z.object({
  status: z.string().trim().min(1).max(40),
});

export async function deskRoutes(app: FastifyInstance) {
  app.get("/office", { preHandler: [app.authenticate] }, async (request) => {
    const organizationId = request.user.orgId;
    const [organization] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
    if (!organization) throw new HttpError(404, "Business not found");
    const [faqRows, documentRows, resourceRows] = await Promise.all([
      db.select().from(faqs).where(eq(faqs.organizationId, organizationId)).orderBy(desc(faqs.createdAt)),
      db.select().from(documents).where(eq(documents.organizationId, organizationId)).orderBy(desc(documents.createdAt)),
      db.select().from(resources).where(eq(resources.organizationId, organizationId)).orderBy(desc(resources.createdAt)),
    ]);
    return { organization, faqs: faqRows, documents: documentRows, resources: resourceRows };
  });

  app.patch("/office", { preHandler: [app.authenticate] }, async (request) => {
    const body = parseBody(settingsSchema, request.body);
    const [organization] = await db
      .update(organizations)
      .set(body)
      .where(eq(organizations.id, request.user.orgId))
      .returning();
    if (!organization) throw new HttpError(404, "Business not found");
    return organization;
  });

  app.post("/office/faqs", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = parseBody(faqSchema, request.body);
    const [faq] = await db.insert(faqs).values({ organizationId: request.user.orgId, ...body }).returning();
    return reply.code(201).send(faq);
  });

  app.delete("/office/faqs/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db.delete(faqs).where(and(eq(faqs.id, id), eq(faqs.organizationId, request.user.orgId)));
    return reply.code(204).send();
  });

  app.post("/office/documents", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = parseBody(documentSchema, request.body);
    const [document] = await db.insert(documents).values({ organizationId: request.user.orgId, ...body }).returning();
    return reply.code(201).send(document);
  });

  app.delete("/office/documents/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db.delete(documents).where(and(eq(documents.id, id), eq(documents.organizationId, request.user.orgId)));
    return reply.code(204).send();
  });

  app.post("/office/resources", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = parseBody(resourceSchema, request.body);
    const [resource] = await db.insert(resources).values({ organizationId: request.user.orgId, ...body }).returning();
    return reply.code(201).send(resource);
  });

  app.delete("/office/resources/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db.delete(resources).where(and(eq(resources.id, id), eq(resources.organizationId, request.user.orgId)));
    return reply.code(204).send();
  });

  app.get("/records", { preHandler: [app.authenticate] }, async (request) => {
    const kind = typeof request.query === "object" && request.query && "kind" in request.query ? String(request.query.kind) : "";
    const rows = await db
      .select()
      .from(records)
      .where(eq(records.organizationId, request.user.orgId))
      .orderBy(desc(records.createdAt))
      .limit(200);
    return kind ? rows.filter((row) => row.kind === kind) : rows;
  });

  app.post("/records", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = parseBody(recordSchema, request.body);
    const result = await runDeskAction(request.user.orgId, body satisfies DeskArgs);
    return reply.code(201).send(result);
  });

  app.patch("/records/:id", { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const body = parseBody(recordPatchSchema, request.body);
    const [row] = await db
      .update(records)
      .set({ status: body.status })
      .where(and(eq(records.id, id), eq(records.organizationId, request.user.orgId)))
      .returning();
    if (!row) throw new HttpError(404, "Record not found");
    return row;
  });

  app.get("/insights", { preHandler: [app.authenticate] }, async (request) => {
    const organizationId = request.user.orgId;
    const [organization] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
    const callRows = await db
      .select()
      .from(calls)
      .where(eq(calls.organizationId, organizationId))
      .orderBy(desc(calls.startedAt))
      .limit(500);
    const recordRows = await db.select().from(records).where(eq(records.organizationId, organizationId));
    const tagCounts = new Map<string, number>();
    for (const call of callRows) {
      for (const tag of call.tags.split(",").map((item) => item.trim()).filter(Boolean)) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }
    const variants = { a: { calls: 0, bookings: 0 }, b: { calls: 0, bookings: 0 } };
    for (const call of callRows) {
      const variant = call.greetingVariant === "b" ? "b" : "a";
      variants[variant].calls += 1;
    }
    for (const record of recordRows) {
      if (record.status !== "booked" || !record.callId) continue;
      const call = callRows.find((item) => item.id === record.callId);
      if (!call) continue;
      variants[call.greetingVariant === "b" ? "b" : "a"].bookings += 1;
    }
    return {
      calls: callRows.length,
      pickedUp: callRows.length,
      withTranscript: callRows.filter((call) => call.recordingStatus === "transcript" || call.recordingStatus === "audio").length,
      bookings: recordRows.filter((record) => record.status === "booked").length,
      leads: recordRows.filter((record) => record.kind === "lead").length,
      openCallbacks: recordRows.filter((record) => record.kind === "callback" && record.status === "open").length,
      tags: [...tagCounts.entries()].map(([tag, count]) => ({ tag, count })).sort((left, right) => right.count - left.count),
      heatmap: bucketCalls(
        callRows.map((call) => call.startedAt),
        organization?.timezone ?? "Asia/Kolkata",
      ),
      variants,
    };
  });
}
