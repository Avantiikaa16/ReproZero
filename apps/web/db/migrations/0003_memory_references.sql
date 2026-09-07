CREATE TABLE "memory_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"incident_id" uuid,
	"signature" text NOT NULL,
	"title" text NOT NULL,
	"root_cause" text,
	"code_path" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attempted_fixes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verified_repair" text,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence" real,
	"source" text DEFAULT 'hosted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memory_references" ADD CONSTRAINT "memory_references_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_references" ADD CONSTRAINT "memory_references_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE set null ON UPDATE no action;