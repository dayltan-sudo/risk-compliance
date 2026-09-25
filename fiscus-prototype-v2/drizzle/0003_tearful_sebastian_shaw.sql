CREATE TYPE "public"."agent_status" AS ENUM('idle', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."agent_type" AS ENUM('extraction', 'risk_commentary');--> statement-breakpoint
CREATE TABLE "agent_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"assessment_id" text NOT NULL,
	"agent_type" "agent_type" NOT NULL,
	"status" "agent_status" NOT NULL,
	"detail" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_activity" ADD CONSTRAINT "agent_activity_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_activity_assessment_agent_idx" ON "agent_activity" USING btree ("assessment_id","agent_type");