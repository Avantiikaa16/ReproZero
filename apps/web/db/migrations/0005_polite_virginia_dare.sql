ALTER TABLE "incidents" ADD COLUMN "public_slug" text;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_public_slug_unique" UNIQUE("public_slug");