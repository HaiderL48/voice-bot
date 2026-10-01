CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faqs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"call_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"score" text DEFAULT '' NOT NULL,
	"amount" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'staff' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "language" SET DEFAULT 'gu';--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "greeting_b" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "channel" text DEFAULT 'browser' NOT NULL;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "caller_phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "summary" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "tags" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "intent" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "greeting_variant" text DEFAULT 'a' NOT NULL;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "transfer_target" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "recording_status" text DEFAULT 'transcript' NOT NULL;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "recording_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "timezone" text DEFAULT 'Asia/Kolkata' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "industry" text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "hours" text DEFAULT '{"sun":null,"mon":["09:00","18:00"],"tue":["09:00","18:00"],"wed":["09:00","18:00"],"thu":["09:00","18:00"],"fri":["09:00","18:00"],"sat":["09:00","18:00"]}' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "transfer_phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "emergency_phone" text DEFAULT '108' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "after_hours_greeting" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "offers" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "competitor_notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "escalation" text DEFAULT '[{"phrase":"emergency","target":"108"}]' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;