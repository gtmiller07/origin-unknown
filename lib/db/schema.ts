import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// Alias for clarity throughout schema — always with timezone
const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' });
import { sql } from 'drizzle-orm';

// Custom type for pgvector
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    return value.slice(1, -1).split(',').map(Number);
  },
});

// Custom type for tsvector (generated column)
const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const sourceCategoryEnum = pgEnum('source_category', [
  'youtube_api',
  'bluesky',
  'state_media_rss',
  'genai_open_api',
  'genai_curated_upload',
  'reddit',
  'mastodon',
  'manual_upload',
  'cultural_institution',
]);

export const sources = pgTable('sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  config: jsonb('config').notNull(),
  enabled: boolean('enabled').default(true),
  rateLimitPerHour: integer('rate_limit_per_hour'),
  lastRunAt: timestamptz('last_run_at'),
  lastSuccessAt: timestamptz('last_success_at'),
  consecutiveFailures: integer('consecutive_failures').default(0),
  notes: text('notes'),
  createdAt: timestamptz('created_at').defaultNow(),
  updatedAt: timestamptz('updated_at'),
});

export const curators = pgTable('curators', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().unique(),
  displayName: text('display_name').notNull(),
  affiliation: text('affiliation'),
  role: text('role').notNull(),
  isActive: boolean('is_active').default(true),
});

export const artifacts = pgTable(
  'artifacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: uuid('source_id').references(() => sources.id, { onDelete: 'restrict' }),
    externalId: text('external_id').notNull(),
    title: text('title'),
    description: text('description'),
    contentUrl: text('content_url'),
    thumbnailUrl: text('thumbnail_url'),
    thumbnailStoragePath: text('thumbnail_storage_path'),
    mediaType: text('media_type'),
    languageCodes: text('language_codes').array(),
    originCountryCodes: text('origin_country_codes').array(),
    publishedAt: timestamptz('published_at'),
    firstSeenAt: timestamptz('first_seen_at').defaultNow(),
    isAiGenerated: boolean('is_ai_generated'),
    aiGenerationMetadata: jsonb('ai_generation_metadata'),
    // Authorship taxonomy (migration 0010) for the incumbent-vs-challenger design.
    // Each value column has a companion *_provenance marker recording HOW it was set:
    // 'source_prior' (stamped deterministically from the source category),
    // 'ai_proposed' (set/revised by the scorer or Haiku classifier), or
    // 'human_confirmed' (curator). NULL value = not yet determined; ambiguity is
    // recorded as data ('ambiguous_unattributable', 'unknown', 'high'), never as a
    // silently missing value. CHECK constraints live in migration 0010.
    authorshipClass: text('authorship_class'),
    authorshipClassProvenance: text('authorship_class_provenance'),
    aiMediation: text('ai_mediation'),
    aiMediationProvenance: text('ai_mediation_provenance'),
    originAmbiguity: text('origin_ambiguity'),
    originAmbiguityProvenance: text('origin_ambiguity_provenance'),
    // Relevance gate (migration 0012), ORTHOGONAL to status: records whether the
    // artifact is eligible for Opus scoring and HOW that was decided
    // (gate_method: taxonomy_prior | baseline_sample | haiku_triage). NULL = not
    // yet gated. question_similarity is the demoted cosine-to-the-question feature
    // — stored for analysis, never a gate cutoff. CHECK constraints live in 0012.
    gateDecision: text('gate_decision'),
    gateMethod: text('gate_method'),
    gateReasoning: text('gate_reasoning'),
    gateConfidence: numeric('gate_confidence', { precision: 3, scale: 2 }),
    gateModel: text('gate_model'),
    gatedAt: timestamptz('gated_at'),
    // Two-axis triage verdict (migration 0013): Judgment A (cultural storytelling)
    // and Judgment B (AI mediation / origin ambiguity), kept on A OR B. Stored
    // per-axis so "which judgment kept this artifact" is recoverable research data;
    // gate_decision/gate_confidence above hold the collapsed keep + governing
    // confidence. NULL on rows gated before the two-axis revision.
    gateCulturalRelevant: boolean('gate_cultural_relevant'),
    gateCulturalConfidence: numeric('gate_cultural_confidence', { precision: 3, scale: 2 }),
    gateAiOrAmbiguous: boolean('gate_ai_or_ambiguous'),
    gateAiConfidence: numeric('gate_ai_confidence', { precision: 3, scale: 2 }),
    questionSimilarity: real('question_similarity'),
    rawPayload: jsonb('raw_payload'),
    embedding: vector('embedding'),
    altText: text('alt_text'),
    altTextConfirmed: boolean('alt_text_confirmed').default(false),
    bearsOnDissertationQuestion: boolean('bears_on_dissertation_question').default(false),
    dissertationRelevance: text('dissertation_relevance'),
    featured: boolean('featured').default(false),
    status: text('status').default('pending'),
    searchVector: tsvector('search_vector'),
    // Soft delete (migration 0016): removal hides the artifact from every public surface but keeps
    // the row and its scoring_events/takedown audit trail intact — a hard DELETE is blocked by those
    // RESTRICT foreign keys anyway. Reversible: clear removedAt to restore.
    removedAt: timestamptz('removed_at'),
    removedReason: text('removed_reason'),
    removedBy: uuid('removed_by').references(() => curators.id),
    // Human vetting (migration 0016): set when a curator reviews the asset in the vetting interview.
    vettedAt: timestamptz('vetted_at'),
    vettedBy: uuid('vetted_by').references(() => curators.id),
    // Thumbnail health (migration 0019): last time thumbnail_url was probed for reachability.
    // NULL = never checked. The heal-thumbnails cron processes oldest-first, ~monthly per artifact.
    thumbnailCheckedAt: timestamptz('thumbnail_checked_at'),
    // Batch scoring (migration 0021): set to the scoring_batches.id while an artifact is in-flight
    // in a Message Batch, so neither the batch submitter nor the synchronous scorer re-selects it.
    scoringBatchId: text('scoring_batch_id'),
    createdAt: timestamptz('created_at').defaultNow(),
    updatedAt: timestamptz('updated_at'),
  },
  (table) => [
    uniqueIndex('artifacts_source_external_idx').on(table.sourceId, table.externalId),
    index('artifacts_status_published_at_idx').on(table.status, table.publishedAt),
    index('artifacts_source_id_first_seen_idx').on(table.sourceId, table.firstSeenAt),
    index('artifacts_language_codes_idx').using('gin', table.languageCodes),
    index('artifacts_search_vector_idx').using('gin', table.searchVector),
  ]
);

// Hand-labeled calibration set (migration 0012): the human ground truth the Haiku
// relevance threshold is tuned against, persisted as research data. human_relevant
// is the curator label; the haiku_* columns hold the classifier's verdict on the
// same artifact so a recall figure / confusion matrix is reproducible from the DB.
export const relevanceCalibration = pgTable('relevance_calibration', {
  id: uuid('id').primaryKey().defaultRandom(),
  artifactId: uuid('artifact_id')
    .notNull()
    .references(() => artifacts.id, { onDelete: 'cascade' })
    .unique(),
  humanRelevant: boolean('human_relevant').notNull(),
  humanNotes: text('human_notes'),
  // Legacy single-axis verdict (migration 0012) — retained for back-compat, no
  // longer written by the two-axis classifier. haikuReasoning now holds the
  // one-sentence signal.
  haikuRelevant: boolean('haiku_relevant'),
  haikuConfidence: numeric('haiku_confidence', { precision: 3, scale: 2 }),
  haikuReasoning: text('haiku_reasoning'),
  haikuModel: text('haiku_model'),
  // Two-axis verdict (migration 0013): per-axis relevance + confidence so the
  // calibration sweep recomputes keep from both confidences. haikuKeep is the
  // model's own keep call, a fixed baseline vs. the tuned-threshold gate.
  haikuCulturalRelevant: boolean('haiku_cultural_relevant'),
  haikuCulturalConfidence: numeric('haiku_cultural_confidence', { precision: 3, scale: 2 }),
  haikuAiOrAmbiguous: boolean('haiku_ai_or_ambiguous'),
  haikuAiConfidence: numeric('haiku_ai_confidence', { precision: 3, scale: 2 }),
  haikuKeep: boolean('haiku_keep'),
  labeledAt: timestamptz('labeled_at').defaultNow(),
  classifiedAt: timestamptz('classified_at'),
});

export const scores = pgTable(
  'scores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    artifactId: uuid('artifact_id').references(() => artifacts.id, { onDelete: 'cascade' }),
    axis: text('axis').notNull(),
    value: numeric('value', { precision: 3, scale: 2 }),
    aiProposedValue: numeric('ai_proposed_value', { precision: 3, scale: 2 }),
    aiReasoning: text('ai_reasoning'),
    aiModel: text('ai_model'),
    aiProposedAt: timestamptz('ai_proposed_at'),
    humanConfirmedValue: numeric('human_confirmed_value', { precision: 3, scale: 2 }),
    humanReasoning: text('human_reasoning'),
    humanConfirmerId: uuid('human_confirmer_id').references(() => curators.id),
    humanConfirmedAt: timestamptz('human_confirmed_at'),
    isPublic: boolean('is_public').default(false),
    scoringPromptVersion: text('scoring_prompt_version'),
    createdAt: timestamptz('created_at').defaultNow(),
    updatedAt: timestamptz('updated_at'),
  },
  (table) => [uniqueIndex('scores_artifact_axis_idx').on(table.artifactId, table.axis)]
);

export const evidencePanels = pgTable('evidence_panels', {
  id: uuid('id').primaryKey().defaultRandom(),
  artifactId: uuid('artifact_id')
    .references(() => artifacts.id, { onDelete: 'cascade' })
    .unique(),
  provenance: jsonb('provenance'),
  trainingDataNotes: text('training_data_notes'),
  travelHistory: jsonb('travel_history'),
  paglenQuestions: text('paglen_questions').array(),
  isPublic: boolean('is_public').default(false),
  createdAt: timestamptz('created_at').defaultNow(),
  updatedAt: timestamptz('updated_at'),
});

export const ingestionRuns = pgTable('ingestion_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').references(() => sources.id, { onDelete: 'cascade' }),
  startedAt: timestamptz('started_at').defaultNow(),
  completedAt: timestamptz('completed_at'),
  status: text('status'),
  artifactsIngested: integer('artifacts_ingested').default(0),
  errors: jsonb('errors'),
  notes: text('notes'),
});

export const eraStations = pgTable('era_stations', {
  id: uuid('id').primaryKey().defaultRandom(),
  position: numeric('position', { precision: 5, scale: 2 }).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  technicalMarker: text('technical_marker'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  artifactDensity: integer('artifact_density'),
  isVisible: boolean('is_visible').default(true),
  interactiveVariables: jsonb('interactive_variables').default(sql`'[]'`),
  comparativeGrids: jsonb('comparative_grids').default(sql`'[]'`),
  createdAt: timestamptz('created_at').defaultNow(),
  updatedAt: timestamptz('updated_at'),
});

export const scoringEvents = pgTable(
  'scoring_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    artifactId: uuid('artifact_id').references(() => artifacts.id, { onDelete: 'restrict' }),
    axis: text('axis').notNull(),
    eventType: text('event_type'),
    previousValue: numeric('previous_value', { precision: 3, scale: 2 }),
    newValue: numeric('new_value', { precision: 3, scale: 2 }),
    reasoning: text('reasoning'),
    actorId: uuid('actor_id').references(() => curators.id),
    createdAt: timestamptz('created_at').defaultNow(),
  },
  (table) => [
    index('scoring_events_artifact_id_created_at_idx').on(table.artifactId, table.createdAt),
    index('scoring_events_axis_event_type_created_idx').on(
      table.axis,
      table.eventType,
      table.createdAt
    ),
  ]
);

export const scoringPrompts = pgTable('scoring_prompts', {
  id: uuid('id').primaryKey().defaultRandom(),
  version: text('version').notNull().unique(),
  systemPrompt: text('system_prompt').notNull(),
  instructionTemplate: text('instruction_template').notNull(),
  active: boolean('active').default(false),
  createdAt: timestamptz('created_at').defaultNow(),
  createdBy: uuid('created_by').references(() => curators.id),
  notes: text('notes'),
});

export const publicAppeals = pgTable('public_appeals', {
  id: uuid('id').primaryKey().defaultRandom(),
  artifactId: uuid('artifact_id').references(() => artifacts.id, { onDelete: 'cascade' }),
  axis: text('axis').notNull(),
  challengerEmail: text('challenger_email'),
  challengerReasoning: text('challenger_reasoning').notNull(),
  status: text('status').default('pending'),
  reviewerId: uuid('reviewer_id').references(() => curators.id),
  reviewedAt: timestamptz('reviewed_at'),
  reviewNotes: text('review_notes'),
  createdAt: timestamptz('created_at').defaultNow(),
});

export const takedownRequests = pgTable('takedown_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  artifactId: uuid('artifact_id').references(() => artifacts.id, { onDelete: 'restrict' }),
  requesterEmail: text('requester_email').notNull(),
  requesterRelationship: text('requester_relationship').notNull(),
  reasoning: text('reasoning').notNull(),
  status: text('status').default('pending'),
  reviewerId: uuid('reviewer_id').references(() => curators.id),
  reviewedAt: timestamptz('reviewed_at'),
  reviewNotes: text('review_notes'),
  createdAt: timestamptz('created_at').defaultNow(),
});

export const corpusSnapshots = pgTable('corpus_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  snapshotLabel: text('snapshot_label').notNull(),
  artifactCount: integer('artifact_count').notNull(),
  zenodoDepositionId: text('zenodo_deposition_id'),
  zenodoDoi: text('zenodo_doi'),
  archiveStoragePath: text('archive_storage_path'),
  notes: text('notes'),
  createdAt: timestamptz('created_at').defaultNow(),
  createdBy: uuid('created_by').references(() => curators.id),
});

export const curatorNotes = pgTable(
  'curator_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authorId: uuid('author_id').references(() => curators.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    body: text('body').notNull(),
    published: boolean('published').default(false),
    publishedAt: timestamptz('published_at'),
    slug: text('slug').unique(),
    readingTimeMinutes: integer('reading_time_minutes'),
    relatedArtifactIds: uuid('related_artifact_ids').array(),
    createdAt: timestamptz('created_at').defaultNow(),
    updatedAt: timestamptz('updated_at'),
  },
  (table) => [index('curator_notes_published_at_idx').on(table.publishedAt)]
);

export const viewerSessions = pgTable('viewer_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionToken: text('session_token').unique(),
  userAgentHash: text('user_agent_hash'),
  countryCode: text('country_code'),
  reducedMotionPreference: boolean('reduced_motion_preference'),
  viewportWidth: integer('viewport_width'),
  deviceClass: text('device_class'),
  ambientFieldQuestionShown: boolean('ambient_field_question_shown').default(false),
  firstSeenAt: timestamptz('first_seen_at').defaultNow(),
  lastSeenAt: timestamptz('last_seen_at'),
});

export const viewerInteractions = pgTable(
  'viewer_interactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id').references(() => viewerSessions.id, { onDelete: 'cascade' }),
    interactionType: text('interaction_type').notNull(),
    artifactId: uuid('artifact_id').references(() => artifacts.id, { onDelete: 'set null' }),
    payload: jsonb('payload'),
    occurredAt: timestamptz('occurred_at').defaultNow(),
  },
  (table) => [
    index('viewer_interactions_session_occurred_idx').on(table.sessionId, table.occurredAt),
  ]
);

export const costCaps = pgTable('cost_caps', {
  id: uuid('id').primaryKey().defaultRandom(),
  service: text('service').notNull().unique(),
  dailyCapUsd: numeric('daily_cap_usd', { precision: 10, scale: 2 }).notNull(),
  monthlyCapUsd: numeric('monthly_cap_usd', { precision: 10, scale: 2 }).notNull(),
  currentDailySpendUsd: numeric('current_daily_spend_usd', { precision: 10, scale: 2 }).default(
    '0'
  ),
  currentMonthlySpendUsd: numeric('current_monthly_spend_usd', { precision: 10, scale: 2 }).default(
    '0'
  ),
  spendWindowStartDate: date('spend_window_start_date').defaultNow(),
  isBreached: boolean('is_breached').default(false),
  breachedAt: timestamptz('breached_at'),
  updatedAt: timestamptz('updated_at'),
});

export const apiCallLog = pgTable(
  'api_call_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    service: text('service').notNull(),
    operation: text('operation').notNull(),
    artifactId: uuid('artifact_id').references(() => artifacts.id, { onDelete: 'set null' }),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    costUsd: numeric('cost_usd', { precision: 10, scale: 6 }),
    durationMs: integer('duration_ms'),
    status: text('status'),
    errorMessage: text('error_message'),
    occurredAt: timestamptz('occurred_at').defaultNow(),
  },
  (table) => [index('api_call_log_service_occurred_idx').on(table.service, table.occurredAt)]
);

// Message Batches ledger (migration 0021). One row per submitted scoring batch.
export const scoringBatches = pgTable('scoring_batches', {
  id: text('id').primaryKey(), // Anthropic batch id (msgbatch_...)
  status: text('status').notNull().default('submitted'),
  requestCount: integer('request_count').notNull(),
  ingestedCount: integer('ingested_count').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),
  estCostUsd: numeric('est_cost_usd', { precision: 10, scale: 4 }),
  actualCostUsd: numeric('actual_cost_usd', { precision: 10, scale: 4 }),
  scoringPromptVersion: text('scoring_prompt_version'),
  submittedAt: timestamptz('submitted_at').notNull().defaultNow(),
  completedAt: timestamptz('completed_at'),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
});

export const systemState = pgTable('system_state', {
  id: integer('id').primaryKey().default(1),
  mode: text('mode').notNull().default('live'),
  changedAt: timestamptz('changed_at').defaultNow(),
  changedBy: uuid('changed_by').references(() => curators.id),
  reason: text('reason'),
});

// Inferred types
export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;
export type Artifact = typeof artifacts.$inferSelect;
export type NewArtifact = typeof artifacts.$inferInsert;
export type Score = typeof scores.$inferSelect;
export type NewScore = typeof scores.$inferInsert;
export type Curator = typeof curators.$inferSelect;
export type EraStation = typeof eraStations.$inferSelect;
export type ScoringEvent = typeof scoringEvents.$inferSelect;
export type ScoringPrompt = typeof scoringPrompts.$inferSelect;
export type CuratorNote = typeof curatorNotes.$inferSelect;
export type ViewerSession = typeof viewerSessions.$inferSelect;
export type CostCap = typeof costCaps.$inferSelect;
export type SystemState = typeof systemState.$inferSelect;
export type RelevanceCalibration = typeof relevanceCalibration.$inferSelect;
export type NewRelevanceCalibration = typeof relevanceCalibration.$inferInsert;
