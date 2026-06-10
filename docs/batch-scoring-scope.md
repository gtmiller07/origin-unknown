# Scope: Migrate scoring to the Anthropic Message Batches API

*Status: proposal for review. No code changed yet. Author: pipeline investigation, 2026-06-09.*

## 1. Objective & why

Replace (or supplement) the synchronous, one-artifact-per-request scoring path with the
**Anthropic Message Batches API**, which processes many scoring requests asynchronously.

Three wins:
- **~50% lower cost.** Batch requests bill at half the standard rate. Opus 4.7 is
  $5/$25 per 1M in/out tokens → batch ≈ $2.50/$12.50. Per artifact: **~$0.098 → ~$0.049.**
- **No 504s, no serverless-timeout coupling.** We submit a batch and walk away; Anthropic
  does the compute. No 46s-per-call ceiling, no drain-loop gymnastics.
- **Throughput.** One batch can hold up to 100,000 requests / 256 MB. The whole 6,434-row
  backlog fits in a single submission.

The cost: **latency**. Batches complete within 24h (usually minutes–hours), not seconds. That
is fine for backlog drain and acceptable for a research instrument, but it changes the "live"
character of brand-new artifacts. → see the hybrid recommendation in §10.

## 2. What we REUSE unchanged (most of the system)

The batch path reuses the entire scoring *contract* — only the transport changes:
- `lib/scoring/rubric.ts` — `SCORING_TOOL`, `ScoringResultSchema`, `AXIS_KEYS`. Each batch
  request carries the same `tools: [SCORING_TOOL]` + `tool_choice` as today.
- `lib/scoring/render.ts` — `renderInstruction()` / `artifactMetadata()` / etc. build the same
  per-artifact user message.
- The active `scoring_prompts` row (systemPrompt + instructionTemplate, v1.2) — same system prompt.
- `normalizeToolInput()` (the paglen_questions double-encoding fix) — same post-processing;
  batch `tool_use` blocks have the identical shape.
- The **persistence transaction** in `lib/scoring/score-artifacts.ts` (scores ai_proposed_*,
  evidence_panels, artifacts taxonomy + status='scored', scoring_events) — reused verbatim.
- Cost caps: `api_call_log` inserts already fire the `apply_api_cost` trigger → `cost_caps`.
  Logging batch cost = inserting the same rows. `isCapped('anthropic')` still gates.
- The relevance gate is **untouched** — it still decides the queue; batch only scores the queue.
- Human-in-the-loop is **untouched** — results land as `ai_proposed_*`, pending curator confirm.

## 3. What's NEW or changes

### 3a. SDK surface (verified against installed version)
`@anthropic-ai/sdk@0.32.1` exposes batches **only under the beta namespace**:
`client.beta.messages.batches.{create,retrieve,results,cancel,list}` (the GA
`client.messages.batches` is absent in this version). Two options:
- **(A) Use the beta namespace** as-is, with the batches beta header. Zero dependency change.
- **(B) Bump `@anthropic-ai/sdk`** to a version with GA `messages.batches` (cleaner, no beta
  header, future-proof). Small dependency-migration risk; re-verify `messages.create` shape.
- *Recommendation:* (A) first to ship fast and de-risk, then (B) opportunistically. **The exact
  method signatures + beta header string must be confirmed against current Anthropic docs at
  implementation time — do not hand-write them from memory.**

### 3b. New file: `lib/scoring/batch-score.ts`
Three functions:
- `buildBatchRequests(artifacts, prompt) → BatchRequest[]` — for each artifact, render the
  instruction and produce `{ custom_id: <artifact.id>, params: { model, max_tokens, system,
  messages, tools, tool_choice } }`. **`custom_id` = the artifact UUID** (36 chars, well under
  the limit) so results map back trivially.
- `submitScoringBatch({ limit }) → { batchId, requestCount, estCostUsd }` — select gated queue
  (same predicate as `scorePendingArtifacts`: pending + embedded + gate='include'), bound by the
  remaining daily anthropic budget, call `batches.create`, record a row in `scoring_batches`,
  and mark those artifacts `status='scoring_submitted'` (new status) so they aren't double-submitted.
- `pollAndIngest() → { ingested, failed, stillRunning }` — for each `scoring_batches` row not yet
  `ended`, call `batches.retrieve`; when ended, stream `batches.results(id)` (JSONL async iterator),
  and for each result: `succeeded` → `normalizeToolInput` → `ScoringResultSchema.safeParse` →
  **reuse the persistence transaction**; `errored/expired` → mark artifact for retry (revert to
  `status='pending'`); log per-result `usage` to `api_call_log` (cost at 50%).

### 3c. Refactor (DRY): extract `persistScoringResult(tx, artifactId, result, model, promptVersion)`
Pull the per-artifact persistence block out of `score-artifacts.ts` into a shared helper so both
the synchronous path and the batch ingester write identically. ~1h, low risk, improves both.

### 3d. New DB table (migration `0021_scoring_batches.sql`)
```
scoring_batches(
  id text PRIMARY KEY,            -- Anthropic batch id (msgbatch_...)
  status text NOT NULL,           -- submitted | in_progress | ended | ingested | failed
  request_count int NOT NULL,
  ingested_count int DEFAULT 0,
  failed_count int DEFAULT 0,
  est_cost_usd numeric(10,4),
  actual_cost_usd numeric(10,4),
  scoring_prompt_version text,
  submitted_at timestamptz DEFAULT now(),
  completed_at timestamptz
)
```
Plus a new artifact status value `scoring_submitted` (between 'pending' and 'scored') so an
artifact in flight in a batch isn't re-selected. Resumable: ingestion is idempotent (the
persistence upserts onConflictDoUpdate already).

### 3e. New cron routes
- `app/api/cron/score-batch-submit` — gathers the gated queue, submits ONE batch sized to the
  remaining daily budget, records it. Runs e.g. 1–2×/day. Short (a single create call).
- `app/api/cron/score-batch-poll` — polls open batches and ingests completed results
  incrementally. Runs e.g. every 30–60 min. Bounded per call (stream + persist N results, fits
  maxDuration); the drain-loop pattern we just built handles "more results remain."

### 3f. Workflow + vercel.json
Add `score-batch-submit` (daily) and `score-batch-poll` (hourly, drain-looped) to
`.github/workflows/cron.yml`; add maxDuration entries to `vercel.json`.

### 3g. Local script `scripts/score-batch.ts`
Submit + poll the whole backlog from the laptop (no serverless ceiling) for the one-time drain.

## 4. Cost-cap interaction (the subtle part)

The synchronous path checks `isCapped('anthropic')` *before each* $0.098 call — tight, instant.
A batch is a **lump commitment**: once submitted, the spend is committed (modulo cancellation),
and the bill *accrues at ingest* when we log per-result usage. Design:
- **Gate at submit:** read remaining daily budget; size the batch so
  `requestCount × ~$0.049 ≤ remaining`. Never submit a batch that would blow the cap.
- **Log at ingest:** insert `api_call_log` rows from each result's `usage` (at 50% rate) → trigger
  accrues to `cost_caps`.
- **Day-boundary wrinkle:** a batch submitted late may ingest the next day, so its cost lands in
  the next cap window. Minor; acceptable for a daily research budget. (Mitigation if it matters:
  stamp the log row's accrual to the submit date.)

## 5. Cost analysis (concrete)

| | Synchronous (today) | Batch |
|---|---|---|
| Per artifact | ~$0.098 | ~$0.049 |
| Drain 6,434 backlog (one-time) | ~$630 | **~$315** |
| Daily throughput at the $30 cap | ~306/day | **~612/day** |

So: same budget → ~2× artifacts, or same volume → ~½ cost.

## 6. Failure modes handled

- **Per-request errors** inside a batch → that artifact reverts to `pending` for the next batch.
- **24h expiry** → expired requests revert to `pending`; the batch row marked `failed`.
- **Partial ingest / crash mid-stream** → resumable; already-persisted artifacts are `scored`
  (skipped on re-poll), the rest re-stream.
- **Double submission** → `scoring_submitted` status + the `scoring_batches` ledger prevent it.
- **Malformed tool output** → same `ScoringResultSchema` rejection + retry path as today.

## 7. Decision points for you

1. **Hybrid vs full batch** (see §10) — recommend hybrid.
2. **SDK: beta namespace now (A) vs bump SDK (B)** — recommend A first.
3. **Submission cadence / daily batch budget** — e.g. cap each day's batch at the $30 equivalent
   (~612 artifacts) or let it drain the whole backlog in one ~$315 submission (one-time, with
   your approval since it exceeds a single day's cap).
4. **Keep the synchronous looped cron for freshness?** — recommend yes (it's already working).

## 8. Effort & phasing

- Phase 1 — migration + `persistScoringResult` refactor + `batch-score.ts` + local script.
  Test end-to-end with a ~10-artifact batch. **~5–6h.**
- Phase 2 — cron routes + workflow + vercel.json; observe a full automated cycle. **~2–3h.**
- Phase 3 (optional) — SDK bump to GA, retire beta header. **~1–2h.**
- **Total ~8–11h**, shippable in phases; Phase 1 alone already enables the cheap backlog drain.

## 9. Risks

- Beta API surface / header string and exact `results()` iterator shape — **verify against live
  docs at build time** (don't trust memory). Low once confirmed.
- Day-boundary cost accounting wrinkle (§4) — cosmetic.
- Latency changes the "live feed" freshness for brand-new artifacts — addressed by hybrid.
- A submitted batch is committed spend — the submit-time budget gate is the control.

## 10. Recommendation — HYBRID

Keep the **synchronous looped cron we just fixed** for *freshness*: a small daily trickle
(e.g. the most recent gated artifacts) so `/live`, the tunnel, and the homepage finding stay
current within hours. Use **batch** for *volume*: drain the 6,434 backlog once (~$315, one
approval) and run a daily batch for the bulk of ongoing scoring at half price. This gives the
best of both — fresh-enough live surfaces *and* cheap, high-volume, timeout-proof throughput —
without betting the whole pipeline on async.

*Net: ~2× artifacts per dollar, the 504 class of failure eliminated for bulk scoring, and the
human-in-the-loop + methodology contract completely unchanged.*
