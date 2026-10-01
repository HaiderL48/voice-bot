import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/client";
import { agents, organizations, users } from "../db/schema";
import { env } from "../env";
import { HttpError, isUniqueViolation, parseBody } from "../lib/http";

const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  businessName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

function publicUser(input: {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  organizationName: string;
}) {
  return input;
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/register", async (request) => {
    const body = parseBody(registerSchema, request.body);
    const email = body.email.toLowerCase();
    const passwordHash = await bcrypt.hash(body.password, 10);

    try {
      const created = await db.transaction(async (tx) => {
        const [organization] = await tx
          .insert(organizations)
          .values({ name: body.businessName })
          .returning();
        if (!organization) throw new HttpError(500, "Could not create organization");

        const [user] = await tx
          .insert(users)
          .values({
            organizationId: organization.id,
            email,
            passwordHash,
            name: body.name,
          })
          .returning();
        if (!user) throw new HttpError(500, "Could not create user");

        await tx.insert(agents).values({
          organizationId: organization.id,
          name: "Front Desk",
          greeting: `Thanks for calling ${body.businessName}. This is the front desk. How can I help you today?`,
          systemPrompt:
            "You are warm, brief, and professional. You answer questions, offer to book an appointment, and take a message when you cannot help directly.",
          knowledge: "",
          language: "gu",
          voiceId: env.ELEVENLABS_VOICE_ID,
        });

        return { user, organization };
      });

      const token = app.jwt.sign({
        sub: created.user.id,
        orgId: created.organization.id,
        email: created.user.email,
      });

      return {
        token,
        user: publicUser({
          id: created.user.id,
          email: created.user.email,
          name: created.user.name,
          organizationId: created.organization.id,
          organizationName: created.organization.name,
        }),
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new HttpError(409, "Email already registered");
      }
      throw error;
    }
  });

  app.post("/auth/login", async (request) => {
    const body = parseBody(loginSchema, request.body);
    const email = body.email.toLowerCase();

    const [row] = await db
      .select({
        user: users,
        organizationName: organizations.name,
      })
      .from(users)
      .innerJoin(organizations, eq(organizations.id, users.organizationId))
      .where(eq(users.email, email))
      .limit(1);

    if (!row || !(await bcrypt.compare(body.password, row.user.passwordHash))) {
      throw new HttpError(401, "Invalid email or password");
    }

    const token = app.jwt.sign({
      sub: row.user.id,
      orgId: row.user.organizationId,
      email: row.user.email,
    });

    return {
      token,
      user: publicUser({
        id: row.user.id,
        email: row.user.email,
        name: row.user.name,
        organizationId: row.user.organizationId,
        organizationName: row.organizationName,
      }),
    };
  });

  app.get("/auth/me", { preHandler: [app.authenticate] }, async (request) => {
    const [row] = await db
      .select({
        user: users,
        organizationName: organizations.name,
      })
      .from(users)
      .innerJoin(organizations, eq(organizations.id, users.organizationId))
      .where(eq(users.id, request.user.sub))
      .limit(1);

    if (!row) throw new HttpError(401, "Unauthorized");

    return publicUser({
      id: row.user.id,
      email: row.user.email,
      name: row.user.name,
      organizationId: row.user.organizationId,
      organizationName: row.organizationName,
    });
  });
}
