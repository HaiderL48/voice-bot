import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { calls, documents, faqs, messages, organizations, records, resources } from "../db/schema";
import { matchEscalation, officeStatus, parseHours, parseWhen, rankText, scoreLead, triageUrgency } from "./office";
import { queueForPhoneLine } from "./telephony";

export const DESK_TOOL = {
  name: "desk",
  description:
    "Look up or change the business desk. Use it before you claim something was booked, cancelled, transferred, or sent. Actions: hours, search, availability, book, reschedule, cancel, waitlist, callback, transfer, emergency, lead, complaint, order, order_status, survey, triage, workflow, message, payment, loyalty, noshow, tag.",
  parameters: {
    type: "OBJECT",
    properties: {
      action: { type: "STRING" },
      name: { type: "STRING" },
      phone: { type: "STRING" },
      email: { type: "STRING" },
      resource: { type: "STRING", description: "Doctor, room, table, or staff name" },
      when: { type: "STRING", description: "ISO 8601 datetime in the business timezone" },
      kind: {
        type: "STRING",
        description:
          "appointment, reservation, event, demo, or workflow: refill, referral, insurance, billing, portal, lab, discharge, medication, vaccination, request, warranty, admission",
      },
      detail: { type: "STRING" },
      query: { type: "STRING" },
      rating: { type: "NUMBER" },
      amount: { type: "STRING" },
      channel: { type: "STRING", description: "sms, email, or call" },
      target: { type: "STRING" },
      budget: { type: "STRING" },
      timeline: { type: "STRING" },
    },
    required: ["action"],
  },
};

export type DeskArgs = {
  action?: string;
  name?: string;
  phone?: string;
  email?: string;
  resource?: string;
  when?: string;
  kind?: string;
  detail?: string;
  query?: string;
  rating?: number | string;
  amount?: string;
  channel?: string;
  target?: string;
  budget?: string;
  timeline?: string;
};

export type DeskResult = { speech: string; notice: string };

const BOOKING_KINDS = new Set(["appointment", "reservation", "event", "demo"]);

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

async function orgRow(organizationId: string) {
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return organization ?? null;
}

async function saveRecord(input: typeof records.$inferInsert) {
  const [row] = await db.insert(records).values(input).returning();
  if (!row) throw new Error("Could not save record");
  return row;
}

async function latestBooking(organizationId: string, phone: string, name: string) {
  const rows = await db
    .select()
    .from(records)
    .where(and(eq(records.organizationId, organizationId), eq(records.status, "booked")))
    .orderBy(desc(records.createdAt))
    .limit(40);
  return (
    rows.find((row) => phone && row.phone === phone) ??
    rows.find((row) => name && row.name.toLowerCase() === name.toLowerCase()) ??
    null
  );
}

async function transcriptExcerpt(callId: string) {
  const rows = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.callId, callId))
    .orderBy(desc(messages.createdAt))
    .limit(8);
  return rows
    .reverse()
    .map((row) => `${row.role}: ${row.content}`)
    .join("\n");
}

export async function officeBrief(organizationId: string, knowledge: string) {
  const organization = await orgRow(organizationId);
  if (!organization) return "";
  const hours = parseHours(organization.hours);
  const status = officeStatus(new Date(), organization.timezone, hours);
  const [faqRows, docRows, resourceRows] = await Promise.all([
    db.select().from(faqs).where(eq(faqs.organizationId, organizationId)).limit(20),
    db.select().from(documents).where(eq(documents.organizationId, organizationId)).limit(20),
    db.select().from(resources).where(eq(resources.organizationId, organizationId)).limit(20),
  ]);
  const industry =
    organization.industry === "clinic"
      ? "This is a clinic. Book providers, triage symptoms, and take refill, referral, lab, and billing requests. Transfer emergencies immediately."
      : organization.industry === "hospitality"
        ? "This is hospitality. Book rooms or tables, take orders, and note dietary needs and special occasions."
        : "This is a general business. Answer questions, book visits, qualify leads, and take messages.";
  const faqBlock = faqRows.map((faq) => `Q: ${faq.question}\nA: ${faq.answer}`).join("\n");
  const docBlock = docRows.map((doc) => `${doc.title}: ${doc.body}`).join("\n");
  const resourceBlock = resourceRows.map((resource) => `${resource.kind}: ${resource.name} ${resource.notes}`.trim()).join("\n");
  return [
    industry,
    `Now: ${new Date().toLocaleString("en-IN", { timeZone: organization.timezone })}. The office is ${status.open ? "OPEN" : "CLOSED"}.`,
    `Hours: ${status.label}.`,
    organization.transferPhone ? `Human transfer number: ${organization.transferPhone}.` : "",
    `Emergency number: ${organization.emergencyPhone}.`,
    faqBlock ? `FAQs:\n${faqBlock}` : "",
    docBlock ? `Knowledge base:\n${docBlock}` : "",
    knowledge.trim() ? `Extra facts:\n${knowledge.trim()}` : "",
    resourceBlock ? `Bookable resources:\n${resourceBlock}` : "",
    organization.offers.trim() ? `Approved offers to mention when they fit: ${organization.offers.trim()}` : "",
    organization.competitorNotes.trim() ? `Approved competitor talking points: ${organization.competitorNotes.trim()}` : "",
    "Use the desk tool for bookings, changes, callbacks, transfers, leads, complaints, orders, clinical requests, messages, and payments. Confirm only what the tool returns. The phone line places real calls, SMS, email, and payments later; tell the caller the request is saved.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function runDeskAction(
  organizationId: string,
  input: DeskArgs & { callId?: string | null; callerPhone?: string },
): Promise<DeskResult> {
  const action = text(input.action);
  const organization = await orgRow(organizationId);
  if (!organization) return { speech: "The business profile is missing.", notice: "No business profile" };
  const phone = text(input.phone) || text(input.callerPhone);
  const name = text(input.name);
  const detail = text(input.detail);
  const resource = text(input.resource) || "Front desk";

  if (action === "hours") {
    const status = officeStatus(new Date(), organization.timezone, parseHours(organization.hours));
    const speech = status.open
      ? `The office is open. ${status.label}`
      : `The office is closed. ${status.label} Offer a callback or the next opening.`;
    return { speech, notice: status.open ? "Office is open" : "Office is closed" };
  }

  if (action === "search") {
    const query = text(input.query) || detail;
    const [faqRows, docRows] = await Promise.all([
      db.select().from(faqs).where(eq(faqs.organizationId, organizationId)),
      db.select().from(documents).where(eq(documents.organizationId, organizationId)),
    ]);
    const hits = rankText(query, [
      ...faqRows.map((faq) => ({ title: faq.question, body: faq.answer })),
      ...docRows.map((doc) => ({ title: doc.title, body: doc.body })),
    ]);
    if (hits.length === 0) return { speech: "No matching fact is on file. Say you do not have it.", notice: "No knowledge match" };
    return {
      speech: hits.map((hit) => `${hit.title}: ${hit.body}`).join("\n"),
      notice: `Found ${hits.length} knowledge match${hits.length === 1 ? "" : "es"}`,
    };
  }

  if (action === "availability") {
    const rows = await db.select().from(resources).where(eq(resources.organizationId, organizationId));
    const booked = await db
      .select()
      .from(records)
      .where(and(eq(records.organizationId, organizationId), eq(records.status, "booked")));
    const names = rows.length > 0 ? rows.map((row) => `${row.name} (${row.kind})`).join(", ") : "Front desk";
    const taken = booked
      .filter((row) => row.startsAt)
      .slice(0, 8)
      .map((row) => `${row.title} at ${row.startsAt?.toLocaleString("en-IN", { timeZone: organization.timezone })}`)
      .join("; ");
    return {
      speech: `Resources: ${names}. Already booked: ${taken || "nothing upcoming"}.`,
      notice: "Checked availability",
    };
  }

  if (action === "book") {
    const when = parseWhen(text(input.when));
    if (!when || !name) {
      return { speech: "Need the caller's name and a date and time before booking.", notice: "Booking needs a time" };
    }
    const kind = BOOKING_KINDS.has(text(input.kind)) ? text(input.kind) : "appointment";
    const ends = addMinutes(when, 30);
    const clashes = await db
      .select()
      .from(records)
      .where(and(eq(records.organizationId, organizationId), eq(records.status, "booked"), eq(records.title, resource)));
    const clash = clashes.find((row) => row.startsAt && row.endsAt && row.startsAt < ends && row.endsAt > when);
    if (clash) {
      return { speech: `${resource} is already booked then. Offer another time or the waitlist.`, notice: "Slot taken" };
    }
    const row = await saveRecord({
      organizationId,
      callId: input.callId ?? null,
      kind,
      title: resource,
      status: "booked",
      name,
      phone,
      email: text(input.email),
      detail,
      startsAt: when,
      endsAt: ends,
    });
    const whenLabel = when.toLocaleString("en-IN", { timeZone: organization.timezone });
    return {
      speech: `Booked ${kind} with ${resource} for ${name} at ${whenLabel}. Reference ${row.id.slice(0, 8)}.`,
      notice: `Booked ${resource}`,
    };
  }

  if (action === "reschedule" || action === "cancel" || action === "noshow") {
    const current = await latestBooking(organizationId, phone, name);
    if (!current) return { speech: "No active booking was found for that caller.", notice: "No booking found" };
    if (action === "cancel") {
      await db.update(records).set({ status: "cancelled" }).where(eq(records.id, current.id));
      return {
        speech: `Cancelled ${current.title} for ${current.name}. Offer the waitlist or another time.`,
        notice: "Booking cancelled",
      };
    }
    if (action === "noshow") {
      await db.update(records).set({ status: "no_show" }).where(eq(records.id, current.id));
      const queued = queueForPhoneLine({ type: "outbound", to: current.phone, purpose: "no-show recovery" });
      await saveRecord({
        organizationId,
        callId: input.callId ?? null,
        kind: "outbound",
        title: "No-show recovery",
        status: queued.status,
        name: current.name,
        phone: current.phone,
        detail: queued.detail,
      });
      return { speech: `Marked ${current.name} as a no-show. A recovery call is waiting for a DND check.`, notice: "No-show marked" };
    }
    const when = parseWhen(text(input.when));
    if (!when) return { speech: "Need the new date and time to reschedule.", notice: "Reschedule needs a time" };
    await db
      .update(records)
      .set({ startsAt: when, endsAt: addMinutes(when, 30), title: text(input.resource) || current.title, detail: detail || current.detail })
      .where(eq(records.id, current.id));
    return {
      speech: `Moved ${current.name} to ${when.toLocaleString("en-IN", { timeZone: organization.timezone })}.`,
      notice: "Booking moved",
    };
  }

  if (action === "waitlist" || action === "callback") {
    if (!name && !phone) return { speech: "Need a name or phone number.", notice: "Missing caller" };
    const kind = action === "waitlist" ? "waitlist" : "callback";
    const row = await saveRecord({
      organizationId,
      callId: input.callId ?? null,
      kind,
      title: kind === "waitlist" ? resource : "Callback",
      status: "open",
      name,
      phone,
      detail,
      startsAt: text(input.when) ? parseWhen(text(input.when)) : null,
    });
    return {
      speech: `Saved a ${kind} for ${name || phone}. Reference ${row.id.slice(0, 8)}.`,
      notice: kind === "waitlist" ? "Added to waitlist" : "Callback saved",
    };
  }

  if (action === "transfer" || action === "emergency") {
    const urgent = action === "emergency" || triageUrgency(detail) === "emergency";
    const matched = matchEscalation(`${detail} ${text(input.target)}`, organization.escalation);
    const target = urgent
      ? organization.emergencyPhone || "108"
      : text(input.target) || matched?.target || organization.transferPhone || "the front desk";
    const context = input.callId ? await transcriptExcerpt(input.callId) : detail;
    const queued = queueForPhoneLine({ type: "transfer", callId: input.callId ?? "", target, context });
    await saveRecord({
      organizationId,
      callId: input.callId ?? null,
      kind: "transfer",
      title: target,
      status: queued.status,
      name,
      phone,
      detail: `${queued.detail}\n${context}`.slice(0, 4000),
    });
    if (input.callId) {
      await db.update(calls).set({ transferTarget: target, tags: urgent ? "emergency" : "transfer" }).where(eq(calls.id, input.callId));
    }
    return {
      speech: urgent
        ? `Emergency handoff queued to ${target} with the transcript. Tell the caller help is being reached and to call ${target} now if they are in danger.`
        : `Transfer queued to ${target} with the transcript attached. Tell the caller a person will receive the notes.`,
      notice: urgent ? `Emergency queued to ${target}` : `Transfer queued to ${target}`,
    };
  }

  if (action === "lead") {
    const score = scoreLead({ budget: text(input.budget), timeline: text(input.timeline), requirements: detail });
    const row = await saveRecord({
      organizationId,
      callId: input.callId ?? null,
      kind: "lead",
      title: text(input.kind) || "Lead",
      status: "open",
      name,
      phone,
      email: text(input.email),
      detail: `Budget: ${text(input.budget) || "unknown"}. Timeline: ${text(input.timeline) || "unknown"}. ${detail}`.trim(),
      score,
    });
    return { speech: `Lead saved as ${score}. Reference ${row.id.slice(0, 8)}.`, notice: `Lead marked ${score}` };
  }

  if (action === "complaint") {
    const row = await saveRecord({
      organizationId,
      callId: input.callId ?? null,
      kind: "complaint",
      title: "Complaint",
      status: "open",
      name,
      phone,
      detail,
    });
    return {
      speech: `Complaint logged. Ticket ${row.id.slice(0, 8)}. Promise a follow-up.`,
      notice: `Ticket ${row.id.slice(0, 8)}`,
    };
  }

  if (action === "order") {
    const row = await saveRecord({
      organizationId,
      callId: input.callId ?? null,
      kind: "order",
      title: text(input.kind) || "Phone order",
      status: "open",
      name,
      phone,
      detail,
      amount: text(input.amount),
    });
    return { speech: `Order saved. Reference ${row.id.slice(0, 8)}.`, notice: "Order saved" };
  }

  if (action === "order_status") {
    const rows = await db
      .select()
      .from(records)
      .where(and(eq(records.organizationId, organizationId), eq(records.kind, "order")))
      .orderBy(desc(records.createdAt))
      .limit(20);
    const found = rows.find((row) => (phone && row.phone === phone) || (name && row.name.toLowerCase() === name.toLowerCase()));
    if (!found) return { speech: "No order was found for that caller.", notice: "No order" };
    return { speech: `Order ${found.id.slice(0, 8)} is ${found.status}. ${found.detail}`, notice: "Order status" };
  }

  if (action === "survey") {
    const rating = Number(input.rating);
    const score = Number.isFinite(rating) ? String(Math.min(5, Math.max(1, Math.round(rating)))) : "";
    await saveRecord({
      organizationId,
      callId: input.callId ?? null,
      kind: "survey",
      title: "Feedback",
      status: "done",
      name,
      phone,
      detail,
      score,
    });
    if (score && Number(score) <= 2) {
      const queued = queueForPhoneLine({ type: "outbound", to: organization.transferPhone || phone, purpose: "low rating callback" });
      await saveRecord({
        organizationId,
        callId: input.callId ?? null,
        kind: "outbound",
        title: "Manager callback",
        status: queued.status,
        name,
        phone: organization.transferPhone || phone,
        detail: queued.detail,
      });
      return { speech: `Feedback ${score} of 5 saved. A manager callback is queued.`, notice: "Low rating escalated" };
    }
    return { speech: `Feedback ${score || "saved"}. Thank the caller.`, notice: "Feedback saved" };
  }

  if (action === "triage") {
    const urgency = triageUrgency(`${detail} ${text(input.query)}`);
    await saveRecord({
      organizationId,
      callId: input.callId ?? null,
      kind: "triage",
      title: urgency,
      status: urgency === "emergency" ? "queued" : "open",
      name,
      phone,
      detail,
    });
    if (urgency === "emergency") {
      return runDeskAction(organizationId, { ...input, action: "emergency", detail });
    }
    return {
      speech: `Triage is ${urgency}. It is not an emergency. Offer a booking or a callback. Do not give a diagnosis.`,
      notice: `Triage ${urgency}`,
    };
  }

  if (action === "workflow") {
    const kind = text(input.kind) || "request";
    const row = await saveRecord({
      organizationId,
      callId: input.callId ?? null,
      kind,
      title: kind,
      status: "open",
      name,
      phone,
      detail,
      amount: text(input.amount),
    });
    return { speech: `${kind} request saved. Reference ${row.id.slice(0, 8)}.`, notice: `${kind} saved` };
  }

  if (action === "message") {
    const channel = text(input.channel) || "sms";
    const body = detail || "Follow-up from the front desk.";
    if (channel === "call") {
      const queued = queueForPhoneLine({ type: "outbound", to: phone, purpose: body });
      await saveRecord({
        organizationId,
        callId: input.callId ?? null,
        kind: "outbound",
        title: "Outbound call",
        status: queued.status,
        name,
        phone,
        detail: `${body}\n${queued.detail}`,
        startsAt: text(input.when) ? parseWhen(text(input.when)) : null,
      });
      return { speech: queued.detail, notice: "Outbound call waiting on DND" };
    }
    const queued = queueForPhoneLine(channel === "email" ? { type: "email", to: text(input.email) || phone, body } : { type: "sms", to: phone, body });
    await saveRecord({
      organizationId,
      callId: input.callId ?? null,
      kind: channel === "email" ? "email" : "sms",
      title: channel,
      status: queued.status,
      name,
      phone,
      email: text(input.email),
      detail: `${body}\n${queued.detail}`,
    });
    return { speech: queued.detail, notice: `${channel} queued` };
  }

  if (action === "payment") {
    const queued = queueForPhoneLine({ type: "payment", to: phone, amount: text(input.amount) || "unspecified" });
    await saveRecord({
      organizationId,
      callId: input.callId ?? null,
      kind: "payment",
      title: "Payment",
      status: queued.status,
      name,
      phone,
      amount: text(input.amount),
      detail: queued.detail,
    });
    return { speech: queued.detail, notice: "Payment request saved" };
  }

  if (action === "loyalty") {
    const rows = await db
      .select()
      .from(records)
      .where(and(eq(records.organizationId, organizationId), eq(records.kind, "loyalty"), eq(records.phone, phone)));
    const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    if (text(input.amount)) {
      await saveRecord({
        organizationId,
        callId: input.callId ?? null,
        kind: "loyalty",
        title: "Points",
        status: "done",
        name,
        phone,
        amount: text(input.amount),
        detail,
      });
      return { speech: `Points updated. New balance about ${total + Number(input.amount)}.`, notice: "Loyalty updated" };
    }
    return { speech: phone ? `Current points on file: ${total}.` : "Need a phone number to look up loyalty.", notice: "Loyalty lookup" };
  }

  if (action === "tag" && input.callId) {
    await db.update(calls).set({ tags: detail || text(input.kind), intent: text(input.kind) || detail }).where(eq(calls.id, input.callId));
    return { speech: "Call tagged.", notice: "Call tagged" };
  }

  return {
    speech: "That desk action is not available. Ask a short clarifying question.",
    notice: "Unknown desk action",
  };
}
