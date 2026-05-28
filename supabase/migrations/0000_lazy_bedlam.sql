CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."source_category" AS ENUM('youtube_api', 'bluesky', 'state_media_rss', 'genai_open_api', 'genai_curated_upload', 'reddit', 'manual_upload', 'cultural_institution');--> statement-breakpoint
CREATE TABLE "api_call_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service" text NOT NULL,
	"operation" text NOT NULL,
	"artifact_id" uuid,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_usd" numeric(10, 6),
	"duration_ms" integer,
	"status" text,
	"error_message" text,
	"occurred_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid,
	"external_id" text NOT NULL,
	"title" text,
	"description" text,
	"content_url" text,
	"thumbnail_url" text,
	"thumbnail_storage_path" text,
	"media_type" text,
	"language_codes" text[],
	"origin_country_codes" text[],
	"published_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now(),
	"is_ai_generated" boolean,
	"ai_generation_metadata" jsonb,
	"raw_payload" jsonb,
	"embedding" vector(1536),
	"alt_text" text,
	"alt_text_confirmed" boolean DEFAULT false,
	"bears_on_dissertation_question" boolean DEFAULT false,
	"dissertation_relevance" text,
	"featured" boolean DEFAULT false,
	"status" text DEFAULT 'pending',
	"search_vector" tsvector GENERATED ALWAYS AS (
		setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
		setweight(to_tsvector('english', coalesce("description", '')), 'B')
	) STORED,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "corpus_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_label" text NOT NULL,
	"artifact_count" integer NOT NULL,
	"zenodo_deposition_id" text,
	"zenodo_doi" text,
	"archive_storage_path" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "cost_caps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service" text NOT NULL,
	"daily_cap_usd" numeric(10, 2) NOT NULL,
	"monthly_cap_usd" numeric(10, 2) NOT NULL,
	"current_daily_spend_usd" numeric(10, 2) DEFAULT '0',
	"current_monthly_spend_usd" numeric(10, 2) DEFAULT '0',
	"spend_window_start_date" date DEFAULT now(),
	"is_breached" boolean DEFAULT false,
	"breached_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	CONSTRAINT "cost_caps_service_unique" UNIQUE("service")
);
--> statement-breakpoint
CREATE TABLE "curator_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"published" boolean DEFAULT false,
	"published_at" timestamp with time zone,
	"slug" text,
	"reading_time_minutes" integer,
	"related_artifact_ids" uuid[],
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone,
	CONSTRAINT "curator_notes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "curators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"affiliation" text,
	"role" text NOT NULL,
	"is_active" boolean DEFAULT true,
	CONSTRAINT "curators_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "era_stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"position" numeric(5, 2) NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"technical_marker" text,
	"start_date" date,
	"end_date" date,
	"artifact_density" integer,
	"is_visible" boolean DEFAULT true,
	"interactive_variables" jsonb DEFAULT '[]',
	"comparative_grids" jsonb DEFAULT '[]',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "evidence_panels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_id" uuid,
	"provenance" jsonb,
	"training_data_notes" text,
	"travel_history" jsonb,
	"paglen_questions" text[],
	"is_public" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone,
	CONSTRAINT "evidence_panels_artifact_id_unique" UNIQUE("artifact_id")
);
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid,
	"started_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone,
	"status" text,
	"artifacts_ingested" integer DEFAULT 0,
	"errors" jsonb,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "public_appeals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_id" uuid,
	"axis" text NOT NULL,
	"challenger_email" text,
	"challenger_reasoning" text NOT NULL,
	"status" text DEFAULT 'pending',
	"reviewer_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_notes" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_id" uuid,
	"axis" text NOT NULL,
	"value" numeric(3, 2),
	"ai_proposed_value" numeric(3, 2),
	"ai_reasoning" text,
	"ai_model" text,
	"ai_proposed_at" timestamp with time zone,
	"human_confirmed_value" numeric(3, 2),
	"human_reasoning" text,
	"human_confirmer_id" uuid,
	"human_confirmed_at" timestamp with time zone,
	"is_public" boolean DEFAULT false,
	"scoring_prompt_version" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "scoring_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_id" uuid,
	"axis" text NOT NULL,
	"event_type" text,
	"previous_value" numeric(3, 2),
	"new_value" numeric(3, 2),
	"reasoning" text,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scoring_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"system_prompt" text NOT NULL,
	"instruction_template" text NOT NULL,
	"active" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"created_by" uuid,
	"notes" text,
	CONSTRAINT "scoring_prompts_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"config" jsonb NOT NULL,
	"enabled" boolean DEFAULT true,
	"rate_limit_per_hour" integer,
	"last_run_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"consecutive_failures" integer DEFAULT 0,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "system_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"mode" text DEFAULT 'live' NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now(),
	"changed_by" uuid,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "takedown_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_id" uuid,
	"requester_email" text NOT NULL,
	"requester_relationship" text NOT NULL,
	"reasoning" text NOT NULL,
	"status" text DEFAULT 'pending',
	"reviewer_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_notes" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "viewer_interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"interaction_type" text NOT NULL,
	"artifact_id" uuid,
	"payload" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "viewer_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_token" text,
	"user_agent_hash" text,
	"country_code" text,
	"reduced_motion_preference" boolean,
	"viewport_width" integer,
	"device_class" text,
	"ambient_field_question_shown" boolean DEFAULT false,
	"first_seen_at" timestamp with time zone DEFAULT now(),
	"last_seen_at" timestamp with time zone,
	CONSTRAINT "viewer_sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
ALTER TABLE "api_call_log" ADD CONSTRAINT "api_call_log_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corpus_snapshots" ADD CONSTRAINT "corpus_snapshots_created_by_curators_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."curators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curator_notes" ADD CONSTRAINT "curator_notes_author_id_curators_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."curators"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_panels" ADD CONSTRAINT "evidence_panels_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_runs" ADD CONSTRAINT "ingestion_runs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_appeals" ADD CONSTRAINT "public_appeals_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_appeals" ADD CONSTRAINT "public_appeals_reviewer_id_curators_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."curators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_human_confirmer_id_curators_id_fk" FOREIGN KEY ("human_confirmer_id") REFERENCES "public"."curators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_events" ADD CONSTRAINT "scoring_events_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_events" ADD CONSTRAINT "scoring_events_actor_id_curators_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."curators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_prompts" ADD CONSTRAINT "scoring_prompts_created_by_curators_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."curators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_state" ADD CONSTRAINT "system_state_changed_by_curators_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."curators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takedown_requests" ADD CONSTRAINT "takedown_requests_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takedown_requests" ADD CONSTRAINT "takedown_requests_reviewer_id_curators_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."curators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewer_interactions" ADD CONSTRAINT "viewer_interactions_session_id_viewer_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."viewer_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewer_interactions" ADD CONSTRAINT "viewer_interactions_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_call_log_service_occurred_idx" ON "api_call_log" USING btree ("service","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "artifacts_source_external_idx" ON "artifacts" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE INDEX "artifacts_status_published_at_idx" ON "artifacts" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "artifacts_source_id_first_seen_idx" ON "artifacts" USING btree ("source_id","first_seen_at");--> statement-breakpoint
CREATE INDEX "artifacts_language_codes_idx" ON "artifacts" USING gin ("language_codes");--> statement-breakpoint
CREATE INDEX "artifacts_search_vector_idx" ON "artifacts" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "curator_notes_published_at_idx" ON "curator_notes" USING btree ("published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scores_artifact_axis_idx" ON "scores" USING btree ("artifact_id","axis");--> statement-breakpoint
CREATE INDEX "scoring_events_artifact_id_created_at_idx" ON "scoring_events" USING btree ("artifact_id","created_at");--> statement-breakpoint
CREATE INDEX "scoring_events_axis_event_type_created_idx" ON "scoring_events" USING btree ("axis","event_type","created_at");--> statement-breakpoint
CREATE INDEX "viewer_interactions_session_occurred_idx" ON "viewer_interactions" USING btree ("session_id","occurred_at");