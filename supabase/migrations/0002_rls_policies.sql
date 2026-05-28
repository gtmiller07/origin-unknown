-- Row Level Security. Verbatim policy logic from Section 5.
-- Policies are dropped-if-exists before creation so this file is re-runnable.

ALTER TABLE "artifacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evidence_panels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "curators" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ingestion_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "era_stations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scoring_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scoring_prompts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public_appeals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "takedown_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "corpus_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "curator_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "viewer_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "viewer_interactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cost_caps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "api_call_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "system_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE OR REPLACE FUNCTION is_curator() RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM curators
    WHERE user_id = auth.uid() AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;--> statement-breakpoint

-- artifacts -------------------------------------------------------------------
DROP POLICY IF EXISTS "Public reads published artifacts" ON "artifacts";--> statement-breakpoint
CREATE POLICY "Public reads published artifacts" ON "artifacts"
  FOR SELECT USING (status = 'published');--> statement-breakpoint
DROP POLICY IF EXISTS "Curators read all artifacts" ON "artifacts";--> statement-breakpoint
CREATE POLICY "Curators read all artifacts" ON "artifacts"
  FOR SELECT USING (is_curator());--> statement-breakpoint
DROP POLICY IF EXISTS "Curators write artifacts" ON "artifacts";--> statement-breakpoint
CREATE POLICY "Curators write artifacts" ON "artifacts"
  FOR ALL USING (is_curator()) WITH CHECK (is_curator());--> statement-breakpoint

-- scores ----------------------------------------------------------------------
DROP POLICY IF EXISTS "Public reads public scores" ON "scores";--> statement-breakpoint
CREATE POLICY "Public reads public scores" ON "scores"
  FOR SELECT USING (
    is_public = true
    AND EXISTS (SELECT 1 FROM artifacts WHERE artifacts.id = scores.artifact_id AND artifacts.status = 'published')
  );--> statement-breakpoint
DROP POLICY IF EXISTS "Curators read all scores" ON "scores";--> statement-breakpoint
CREATE POLICY "Curators read all scores" ON "scores"
  FOR SELECT USING (is_curator());--> statement-breakpoint
DROP POLICY IF EXISTS "Curators write scores" ON "scores";--> statement-breakpoint
CREATE POLICY "Curators write scores" ON "scores"
  FOR ALL USING (is_curator()) WITH CHECK (is_curator());--> statement-breakpoint

-- evidence_panels -------------------------------------------------------------
DROP POLICY IF EXISTS "Public reads public evidence" ON "evidence_panels";--> statement-breakpoint
CREATE POLICY "Public reads public evidence" ON "evidence_panels"
  FOR SELECT USING (
    is_public = true
    AND EXISTS (SELECT 1 FROM artifacts WHERE artifacts.id = evidence_panels.artifact_id AND artifacts.status = 'published')
  );--> statement-breakpoint
DROP POLICY IF EXISTS "Curators read all evidence" ON "evidence_panels";--> statement-breakpoint
CREATE POLICY "Curators read all evidence" ON "evidence_panels"
  FOR SELECT USING (is_curator());--> statement-breakpoint
DROP POLICY IF EXISTS "Curators write evidence" ON "evidence_panels";--> statement-breakpoint
CREATE POLICY "Curators write evidence" ON "evidence_panels"
  FOR ALL USING (is_curator()) WITH CHECK (is_curator());--> statement-breakpoint

-- sources ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Curators read sources" ON "sources";--> statement-breakpoint
CREATE POLICY "Curators read sources" ON "sources" FOR SELECT USING (is_curator());--> statement-breakpoint
DROP POLICY IF EXISTS "Curators write sources" ON "sources";--> statement-breakpoint
CREATE POLICY "Curators write sources" ON "sources" FOR ALL USING (is_curator()) WITH CHECK (is_curator());--> statement-breakpoint

-- curators --------------------------------------------------------------------
DROP POLICY IF EXISTS "Users read own curator record" ON "curators";--> statement-breakpoint
CREATE POLICY "Users read own curator record" ON "curators" FOR SELECT USING (user_id = auth.uid());--> statement-breakpoint
DROP POLICY IF EXISTS "Author manages curators" ON "curators";--> statement-breakpoint
CREATE POLICY "Author manages curators" ON "curators"
  FOR ALL USING (
    EXISTS (SELECT 1 FROM curators c WHERE c.user_id = auth.uid() AND c.role = 'author' AND c.is_active = true)
  );--> statement-breakpoint

-- ingestion_runs --------------------------------------------------------------
DROP POLICY IF EXISTS "Curators read ingestion runs" ON "ingestion_runs";--> statement-breakpoint
CREATE POLICY "Curators read ingestion runs" ON "ingestion_runs" FOR SELECT USING (is_curator());--> statement-breakpoint

-- era_stations ----------------------------------------------------------------
DROP POLICY IF EXISTS "Public reads visible stations" ON "era_stations";--> statement-breakpoint
CREATE POLICY "Public reads visible stations" ON "era_stations" FOR SELECT USING (is_visible = true);--> statement-breakpoint
DROP POLICY IF EXISTS "Curators write stations" ON "era_stations";--> statement-breakpoint
CREATE POLICY "Curators write stations" ON "era_stations" FOR ALL USING (is_curator()) WITH CHECK (is_curator());--> statement-breakpoint

-- scoring_events (public transparency) ----------------------------------------
DROP POLICY IF EXISTS "Public reads all scoring events" ON "scoring_events";--> statement-breakpoint
CREATE POLICY "Public reads all scoring events" ON "scoring_events" FOR SELECT USING (true);--> statement-breakpoint
DROP POLICY IF EXISTS "Curators write scoring events" ON "scoring_events";--> statement-breakpoint
CREATE POLICY "Curators write scoring events" ON "scoring_events" FOR INSERT WITH CHECK (is_curator());--> statement-breakpoint

-- scoring_prompts (public transparency) ---------------------------------------
DROP POLICY IF EXISTS "Public reads scoring prompts" ON "scoring_prompts";--> statement-breakpoint
CREATE POLICY "Public reads scoring prompts" ON "scoring_prompts" FOR SELECT USING (true);--> statement-breakpoint
DROP POLICY IF EXISTS "Author writes scoring prompts" ON "scoring_prompts";--> statement-breakpoint
CREATE POLICY "Author writes scoring prompts" ON "scoring_prompts"
  FOR ALL USING (
    EXISTS (SELECT 1 FROM curators c WHERE c.user_id = auth.uid() AND c.role = 'author' AND c.is_active = true)
  );--> statement-breakpoint

-- public_appeals --------------------------------------------------------------
DROP POLICY IF EXISTS "Public submits appeals" ON "public_appeals";--> statement-breakpoint
CREATE POLICY "Public submits appeals" ON "public_appeals" FOR INSERT WITH CHECK (true);--> statement-breakpoint
DROP POLICY IF EXISTS "Curators manage appeals" ON "public_appeals";--> statement-breakpoint
CREATE POLICY "Curators manage appeals" ON "public_appeals" FOR ALL USING (is_curator()) WITH CHECK (is_curator());--> statement-breakpoint

-- takedown_requests -----------------------------------------------------------
DROP POLICY IF EXISTS "Public submits takedowns" ON "takedown_requests";--> statement-breakpoint
CREATE POLICY "Public submits takedowns" ON "takedown_requests" FOR INSERT WITH CHECK (true);--> statement-breakpoint
DROP POLICY IF EXISTS "Curators manage takedowns" ON "takedown_requests";--> statement-breakpoint
CREATE POLICY "Curators manage takedowns" ON "takedown_requests" FOR ALL USING (is_curator()) WITH CHECK (is_curator());--> statement-breakpoint

-- corpus_snapshots ------------------------------------------------------------
DROP POLICY IF EXISTS "Public reads corpus snapshots" ON "corpus_snapshots";--> statement-breakpoint
CREATE POLICY "Public reads corpus snapshots" ON "corpus_snapshots" FOR SELECT USING (true);--> statement-breakpoint
DROP POLICY IF EXISTS "Curators write corpus snapshots" ON "corpus_snapshots";--> statement-breakpoint
CREATE POLICY "Curators write corpus snapshots" ON "corpus_snapshots" FOR ALL USING (is_curator()) WITH CHECK (is_curator());--> statement-breakpoint

-- curator_notes ---------------------------------------------------------------
DROP POLICY IF EXISTS "Public reads published notes" ON "curator_notes";--> statement-breakpoint
CREATE POLICY "Public reads published notes" ON "curator_notes" FOR SELECT USING (published = true);--> statement-breakpoint
DROP POLICY IF EXISTS "Curators read all notes" ON "curator_notes";--> statement-breakpoint
CREATE POLICY "Curators read all notes" ON "curator_notes" FOR SELECT USING (is_curator());--> statement-breakpoint
DROP POLICY IF EXISTS "Author writes notes" ON "curator_notes";--> statement-breakpoint
CREATE POLICY "Author writes notes" ON "curator_notes"
  FOR ALL USING (
    EXISTS (SELECT 1 FROM curators c WHERE c.user_id = auth.uid() AND c.role = 'author' AND c.is_active = true)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM curators c WHERE c.user_id = auth.uid() AND c.role = 'author' AND c.is_active = true)
  );--> statement-breakpoint

-- viewer_sessions -------------------------------------------------------------
DROP POLICY IF EXISTS "Public inserts viewer sessions" ON "viewer_sessions";--> statement-breakpoint
CREATE POLICY "Public inserts viewer sessions" ON "viewer_sessions" FOR INSERT WITH CHECK (true);--> statement-breakpoint
DROP POLICY IF EXISTS "Author reads viewer sessions" ON "viewer_sessions";--> statement-breakpoint
CREATE POLICY "Author reads viewer sessions" ON "viewer_sessions"
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM curators c WHERE c.user_id = auth.uid() AND c.role = 'author' AND c.is_active = true)
  );--> statement-breakpoint

-- viewer_interactions ---------------------------------------------------------
DROP POLICY IF EXISTS "Public inserts viewer interactions" ON "viewer_interactions";--> statement-breakpoint
CREATE POLICY "Public inserts viewer interactions" ON "viewer_interactions" FOR INSERT WITH CHECK (true);--> statement-breakpoint
DROP POLICY IF EXISTS "Author reads viewer interactions" ON "viewer_interactions";--> statement-breakpoint
CREATE POLICY "Author reads viewer interactions" ON "viewer_interactions"
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM curators c WHERE c.user_id = auth.uid() AND c.role = 'author' AND c.is_active = true)
  );--> statement-breakpoint

-- cost_caps -------------------------------------------------------------------
DROP POLICY IF EXISTS "Curators read cost caps" ON "cost_caps";--> statement-breakpoint
CREATE POLICY "Curators read cost caps" ON "cost_caps" FOR SELECT USING (is_curator());--> statement-breakpoint
DROP POLICY IF EXISTS "Service role manages cost caps" ON "cost_caps";--> statement-breakpoint
CREATE POLICY "Service role manages cost caps" ON "cost_caps"
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');--> statement-breakpoint

-- api_call_log ----------------------------------------------------------------
DROP POLICY IF EXISTS "Curators read api call log" ON "api_call_log";--> statement-breakpoint
CREATE POLICY "Curators read api call log" ON "api_call_log" FOR SELECT USING (is_curator());--> statement-breakpoint

-- system_state ----------------------------------------------------------------
DROP POLICY IF EXISTS "Public reads system state" ON "system_state";--> statement-breakpoint
CREATE POLICY "Public reads system state" ON "system_state" FOR SELECT USING (true);--> statement-breakpoint
DROP POLICY IF EXISTS "Curators write system state" ON "system_state";--> statement-breakpoint
CREATE POLICY "Curators write system state" ON "system_state" FOR ALL USING (is_curator()) WITH CHECK (is_curator());
