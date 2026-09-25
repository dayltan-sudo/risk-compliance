CREATE TYPE "public"."approval_action" AS ENUM('Approve', 'Reject', 'Return');--> statement-breakpoint
CREATE TYPE "public"."assessment_state" AS ENUM('Draft', 'Submitted', 'Approved', 'Rejected');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('audited', 'unaudited', 'registry');--> statement-breakpoint
CREATE TYPE "public"."field_status" AS ENUM('Unconfirmed', 'Confirmed', 'Amended');--> statement-breakpoint
CREATE TYPE "public"."litigation_record" AS ENUM('Clean', 'Motor suits only', 'Other record');--> statement-breakpoint
CREATE TYPE "public"."paid_up_capital_source" AS ENUM('registry', 'statement-note', 'manual');--> statement-breakpoint
CREATE TYPE "public"."presentation_scale" AS ENUM('units', 'thousands', 'millions');--> statement-breakpoint
CREATE TYPE "public"."prompt_payment_record" AS ENUM('Good', 'Late', 'None held');--> statement-breakpoint
CREATE TYPE "public"."rating_class" AS ENUM('A', 'B', 'C');--> statement-breakpoint
CREATE TYPE "public"."recency_flag" AS ENUM('Recent', 'Non-Recent');--> statement-breakpoint
CREATE TYPE "public"."relationship_type" AS ENUM('New', 'Renewal');--> statement-breakpoint
CREATE TYPE "public"."statement_basis" AS ENUM('standalone', 'consolidated');--> statement-breakpoint
CREATE TYPE "public"."weight_set" AS ENUM('new', 'renewal');--> statement-breakpoint
CREATE TABLE "approval_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"assessment_id" text NOT NULL,
	"actor" text NOT NULL,
	"action" "approval_action" NOT NULL,
	"comments" text DEFAULT '' NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"policy_version" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"division" text NOT NULL,
	"version" integer NOT NULL,
	"state" "assessment_state" NOT NULL,
	"relationship_type" "relationship_type" NOT NULL,
	"relationship_type_overridden" boolean DEFAULT false NOT NULL,
	"relationship_type_override_reason" text,
	"assessment_year" integer NOT NULL,
	"recency_flag" "recency_flag",
	"periods" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"product_type" text,
	"contract_start_date" text,
	"contract_period_months" integer,
	"contract_value_or_average_demand" double precision,
	"principal_activities" text,
	"parentage_shareholding" text,
	"audited_financials_flag" boolean,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_by" text,
	"submitted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"before_value" text,
	"after_value" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "criterion_inputs" (
	"id" text PRIMARY KEY NOT NULL,
	"assessment_id" text NOT NULL,
	"criterion_number" integer NOT NULL,
	"paid_up_capital" double precision,
	"total_exposure" double precision,
	"currency" text,
	"source" "paid_up_capital_source",
	"source_document_id" text,
	"year_registered_sg" integer,
	"litigation_record" "litigation_record",
	"change_in_directors" boolean,
	"prompt_payment_record" "prompt_payment_record",
	"evidence_source" text,
	"evidence_period_or_date" text,
	"status" "field_status" DEFAULT 'Unconfirmed' NOT NULL,
	"amendment_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"entered_by" text,
	"confirmed_by" text,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"industry" text NOT NULL,
	"relationship_owner" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"assessment_id" text NOT NULL,
	"type" "document_type" NOT NULL,
	"period" text,
	"financials_date" text,
	"presentation_currency" text,
	"presentation_scale" "presentation_scale",
	"statement_basis" "statement_basis",
	"version" integer DEFAULT 1 NOT NULL,
	"uploader" text NOT NULL,
	"upload_date" timestamp with time zone DEFAULT now() NOT NULL,
	"file_name" text NOT NULL,
	"blob_url" text NOT NULL,
	"supersedes_document_id" text
);
--> statement-breakpoint
CREATE TABLE "extracted_fields" (
	"id" text PRIMARY KEY NOT NULL,
	"assessment_id" text NOT NULL,
	"document_id" text,
	"field_name" text NOT NULL,
	"section" text NOT NULL,
	"period" text NOT NULL,
	"value" jsonb,
	"original_extracted_value" jsonb,
	"scale_applied" "presentation_scale",
	"currency" text,
	"confidence_score" double precision,
	"source_pointer" text,
	"extraction_model_version" text,
	"status" "field_status" DEFAULT 'Unconfirmed' NOT NULL,
	"amendment_history" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrity_check_results" (
	"id" text PRIMARY KEY NOT NULL,
	"assessment_id" text NOT NULL,
	"check_name" text NOT NULL,
	"period" text NOT NULL,
	"operand_field_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expected" double precision,
	"actual" double precision,
	"passed" boolean NOT NULL,
	"tolerance_applied" double precision,
	"difference" double precision,
	"operand_movement_ranking" jsonb,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"id" text PRIMARY KEY NOT NULL,
	"assessment_id" text NOT NULL,
	"composite_score" integer NOT NULL,
	"rating_class" "rating_class" NOT NULL,
	"handling_route" text NOT NULL,
	"weight_set" "weight_set" NOT NULL,
	"driver_breakdown" jsonb NOT NULL,
	"scorecard_version" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ratios" (
	"id" text PRIMARY KEY NOT NULL,
	"assessment_id" text NOT NULL,
	"ratio_key" text NOT NULL,
	"label" text NOT NULL,
	"formula_display" text NOT NULL,
	"lineage_field_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"period" text,
	"value_numeric" double precision,
	"sign_pair" jsonb,
	"not_calculable_reason" text,
	"zero_divisor_field" text,
	"zero_divisor_tier_applied" integer,
	"scorecard_version" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_commentaries" (
	"id" text PRIMARY KEY NOT NULL,
	"assessment_id" text NOT NULL,
	"rating_id" text NOT NULL,
	"observations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"no_observations" boolean NOT NULL,
	"model_version" text NOT NULL,
	"prompt_version" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criterion_inputs" ADD CONSTRAINT "criterion_inputs_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_fields" ADD CONSTRAINT "extracted_fields_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_fields" ADD CONSTRAINT "extracted_fields_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrity_check_results" ADD CONSTRAINT "integrity_check_results_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratios" ADD CONSTRAINT "ratios_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_commentaries" ADD CONSTRAINT "risk_commentaries_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_commentaries" ADD CONSTRAINT "risk_commentaries_rating_id_ratings_id_fk" FOREIGN KEY ("rating_id") REFERENCES "public"."ratings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "criterion_inputs_assessment_criterion_idx" ON "criterion_inputs" USING btree ("assessment_id","criterion_number");