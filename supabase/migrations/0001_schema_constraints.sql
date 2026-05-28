-- Section 5 data-model integrity not expressible through the Drizzle schema:
-- CHECK constraints, the curators -> auth.users foreign key, and the
-- supplemental indexes (hnsw vector search, partial indexes).

-- CHECK constraints -----------------------------------------------------------
ALTER TABLE "sources" ADD CONSTRAINT "sources_category_check" CHECK ("category" IN ('youtube_api', 'bluesky', 'state_media_rss', 'genai_open_api', 'genai_curated_upload', 'reddit', 'manual_upload', 'cultural_institution'));--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_media_type_check" CHECK ("media_type" IN ('image', 'video', 'audio', 'text', 'mixed'));--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_status_check" CHECK ("status" IN ('pending', 'scored', 'published', 'flagged', 'removed', 'taken_down'));--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_axis_check" CHECK ("axis" IN ('origin', 'reach', 'aesthetic_signal', 'diplomatic_cross_boundary', 'diplomatic_authenticity', 'diplomatic_reciprocity'));--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_value_range_check" CHECK ("value" IS NULL OR ("value" >= 0 AND "value" <= 1));--> statement-breakpoint
ALTER TABLE "curators" ADD CONSTRAINT "curators_role_check" CHECK ("role" IN ('author', 'principal_curator', 'curator', 'observer'));--> statement-breakpoint
ALTER TABLE "ingestion_runs" ADD CONSTRAINT "ingestion_runs_status_check" CHECK ("status" IN ('running', 'success', 'partial', 'failed'));--> statement-breakpoint
ALTER TABLE "scoring_events" ADD CONSTRAINT "scoring_events_event_type_check" CHECK ("event_type" IN ('ai_proposed', 'human_confirmed', 'human_overrode', 'public_appeal', 'reverted'));--> statement-breakpoint
ALTER TABLE "public_appeals" ADD CONSTRAINT "public_appeals_status_check" CHECK ("status" IN ('pending', 'reviewed', 'accepted', 'rejected'));--> statement-breakpoint
ALTER TABLE "takedown_requests" ADD CONSTRAINT "takedown_requests_status_check" CHECK ("status" IN ('pending', 'reviewed', 'honored', 'declined'));--> statement-breakpoint
ALTER TABLE "cost_caps" ADD CONSTRAINT "cost_caps_service_check" CHECK ("service" IN ('anthropic', 'openai', 'youtube_api', 'all'));--> statement-breakpoint
ALTER TABLE "api_call_log" ADD CONSTRAINT "api_call_log_status_check" CHECK ("status" IN ('success', 'rate_limited', 'failed'));--> statement-breakpoint
ALTER TABLE "viewer_sessions" ADD CONSTRAINT "viewer_sessions_device_class_check" CHECK ("device_class" IN ('mobile', 'tablet', 'desktop'));--> statement-breakpoint
ALTER TABLE "system_state" ADD CONSTRAINT "system_state_singleton_check" CHECK ("id" = 1);--> statement-breakpoint
ALTER TABLE "system_state" ADD CONSTRAINT "system_state_mode_check" CHECK ("mode" IN ('live', 'reduced', 'archived'));--> statement-breakpoint

-- curators.user_id references Supabase auth.users ------------------------------
ALTER TABLE "curators" ADD CONSTRAINT "curators_user_id_auth_users_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade;--> statement-breakpoint

-- Supplemental indexes from Section 5 -----------------------------------------
CREATE INDEX IF NOT EXISTS "artifacts_embedding_hnsw_idx" ON "artifacts" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artifacts_bears_on_dissertation_idx" ON "artifacts" ("bears_on_dissertation_question") WHERE "bears_on_dissertation_question" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artifacts_featured_idx" ON "artifacts" ("featured", "published_at" DESC) WHERE "featured" = true AND "status" = 'published';
