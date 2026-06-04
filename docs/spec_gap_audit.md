# Spec gap audit — Phases 4–9 (vs claude_code_build_prompt_v3_5_1.md §13)

Honest per-task accounting of the build against the spec's phase task lists, done 2026-06-04.
The clock estimates in the spec are solo-human hours; the meaningful yardstick is the task list.

**Status:** ✓ done · ◐ partial · ✗ missing
**Relevance:** `[app]` matters for the PhD application artifact (a committee sees/uses it) ·
`[launch]` operational, only needed to run a sustained public site · `[both]`.

---

## Phase 4 — Evidence panel  ·  ~85%

| | Task | Note |
|---|---|---|
| ✓ `[app]` | `artifact/[id]` route | fetches artifact, 6 scores, panel, adjacency |
| ◐ `[app]` | MediaRenderer branching | YouTube-nocookie+IO ✓, HTML5 video+poster ✓, image+lightbox ✓, audio ✓, text blockquote ✓ — **TikTok is thumbnail+link, not true oEmbed** |
| ✓ `[app]` | ProvenanceBlock | source/URL/first-seen/origin/taxonomy/gate in mono |
| ✓ `[app]` | ScoreDisplay (6-axis + triad + composite) | |
| ✓ `[app]` | ReasoningPanel (collapsed/expand) | implemented as per-axis `<details>` inside ScoreDisplay, not a separate file |
| ✓ `[app]` | AdjacencyRow (pgvector + "why adjacent") | |
| ✓ `[app]` | PaglenQuestions | |
| ◐ `[app]` | ContentCredentials (C2PA) | badge + expands to ai_generation_metadata + honest absence; **no real C2PA manifest parsing (we hold no C2PA data)** |
| ✓ `[app]` | Training-data notes | honest "undisclosed" |
| ✓ `[app]` | Travel-history sparkline | honest empty state |
| ◐ `[app]` | Forensic layout + mobile modal | desktop 2/3+1/3 ✓; **mobile is a responsive stack, not a full-screen modal** |
| ◐ `[app]` | Reading-mode variant | MediaRenderer has the `readingMode` prop but **no toggle exists to activate it** (tied to P7) |
| ✓ `[both]` | submit-appeal Server Action | |
| ✓ `[both]` | takedown link → `/takedown?artifact=` | |

**Gaps:** TikTok oEmbed · true mobile modal · reading-mode toggle · C2PA depth (data-limited).

## Phase 5 — The tunnel  ·  core v1 built (commit d5b85d3); Stage B deferred

> Update 2026-06-04: core v1 shipped — widening r(z) corridor, artifact walls (Z=time, X=origin),
> camera auto-dolly + scroll/keys, click→evidence, density sparkline, 2D `?mode=flat` fallback,
> WebGL/mobile redirect, reduced-motion, seeded stations. The ✗ rows below are superseded for those
> items; the ones that remain Stage B are: live station-variable filtering, ComparativeGrid reorg,
> compute-stations cron, viewer_interactions tracking, thumbnail textures (quads for now). Historical
> eras read sparse because the corpus is honestly recent.

| | Task |
|---|---|
| ✗ `[app]` | R3F TunnelScene (dynamic, ssr:false) |
| ✗ `[app]` | TunnelGeometry — widening `r(z)` 1.0→3.5 through control points |
| ✗ `[app]` | Wireframe corridor tracking `r(z)` |
| ✗ `[app]` | Artifact wall laterally by origin region, thumbnails scaling with `r(z)` |
| ✗ `[both]` | Era stations via `/api/cron/compute-stations` |
| ✗ `[app]` | StationPanel (era_stations.interactive_variables) |
| ✗ `[app]` | ComparativeGrid (Selfiecity grid moments) |
| ✗ `[app]` | `lib/utils/variable-filter.ts` |
| ✗ `[app]` | Camera controls (scroll/keyboard/touch) |
| ✗ `[app]` | Click → evidence panel overlay |
| ✗ `[app]` | Progress sparkline |
| ✗ `[app]` | 2D fallback `/tunnel?mode=flat` (full parity) |
| ✗ `[app]` | WebGL detection → flat redirect |
| ✗ `[app]` | Mobile → flat redirect + notice |
| ✗ `[app]` | Reduced-motion compatibility |
| ✗ `[launch]` | interaction tracking (viewer_interactions) |
| ✗ `[app]` | `scripts/seed-stations.ts` (4 inflection points) |

**Gap:** the entire phase. The homepage's "Enter the tunnel" is the named centerpiece and currently dead-ends in a stub. Largest single gap.

## Phase 6 — Live feed + ambient field  ·  ~70%

| | Task | Note |
|---|---|---|
| ✓ `[app]` | `/live` R3F AmbientField | + **bonus beyond spec**: orbit/zoom, hover scorecard, legend, origin/diplomatic layout toggle |
| ✓ `[app]` | Particle mapping incl. composite-glow | |
| ◐ `[app]` | Mobile <30fps → list | WebGL detection → list ✓, **no fps runtime test** |
| ◐ `[app]` | DissertationQuestion (5s/30s/dissolve) | timing ✓; **gated via localStorage, not `viewer_sessions.ambient_field_question_shown`** |
| ✗ `[app]` | SonicDrift (Tone.js) | optional/off-by-default in spec; not built |
| ✗ `[app]` | Realtime updates (Supabase Realtime on scores) | **field is a per-load snapshot, not live-updating** |
| ✓ `[app]` | Click-particle → evidence | |
| ✓ `[app]` | Status line | |
| ✓ `[both]` | `/live?view=list` fallback | |

**Gaps:** Supabase Realtime (the "live" claim) · SonicDrift audio · DB-backed session gate · fps fallback.

## Phase 7 — Methodology / pages / snapshots  ·  ~40%

| | Task | Note |
|---|---|---|
| ✓ `[app]` | `/methodology` (verbatim active prompt + body) | |
| ◐ `[app]` | `/scoring-log` | renders recent 60; **not paginated/filterable** |
| ✓ `[app]` | `/scoring-prompts` (version history, both fields) | |
| ✗ `[launch]` | `/snapshots` (DOIs) | |
| ✗ `[app]` | `/lineage` MDX (`content/lineage.mdx`) | still a stub; intellectual-lineage page |
| ✗ `[app]` | `/notes` + `/notes/[slug]` + `/notes/rss.xml` | still a stub; the curator's scholarly voice |
| ✗ `[launch]` | `/admin/notes` editor | needed to author notes |
| ✓ `[app]` | `/about` (substantive) | done; **personal-vantage paragraph flagged for the author to write** |
| ✓ `[both]` | `/takedown` form | |
| ✓ `[app]` | `/search` full-text | |
| ◐ `[app]` | Homepage entry components | Hero/Epigraph/EmpiricalAnchor/FindingLine/EnterTunnel ✓; **FeaturedRail (6–8 featured) ✗** |
| ✗ `[app]` | `/api/findings/headline` (rolling 30-day, unstable_cache) | homepage finding line is a static placeholder |
| ✗ `[app]` | Reading-mode toggle (provider + toggle + 'R') | |
| ✓ `[both]` | sitemap.ts + robots.ts | done in P8 |
| ✗ `[app]` | OG image routes (`/og`, per-artifact, per-note) | matters for shared links |
| ✗ `[launch]` | `lib/zenodo/` client | |
| ✗ `[launch]` | `/api/cron/quarterly-snapshot` + vercel.json entry | |
| ✗ `[launch]` | `/admin/snapshots` | |
| ✗ `[launch]` | `/admin/operational-mode` (live↔reduced) | |
| ✗ `[launch]` | `scripts/freeze-to-static.ts` | |

**Gaps (app):** notes + lineage (scholarly voice) · OG images (sharing) · reading-mode toggle · FeaturedRail + findings headline · scoring-log pagination/filter.
**Gaps (launch):** snapshots/Zenodo/quarterly-snapshot · admin snapshots/operational-mode/notes · freeze-to-static.

## Phase 8 — Resilience / a11y / performance / mobile  ·  ~25%

| | Task | Note |
|---|---|---|
| ◐ `[both]` | Error boundaries at every route | public error/loading/not-found + global-error ✓; **admin group has none** |
| ✗ `[app]` | Service worker (`@serwist/next`) | installed, unwired |
| ✗ `[app]` | **WCAG 2.2 AA audit (axe + Pa11y) + remediation** | a stated success criterion; not done |
| ✗ `[app]` | **Lighthouse desktop+mobile + perf budget** | not measured |
| ✗ `[launch]` | daily-digest cron + vercel.json | curator-AI agreement rates |
| ◐ `[both]` | CSP headers verified | middleware exists; **not verified/hardened against the spec** |
| ◐ `[both]` | Documentation | code comments + methodology_notes; no full docs pass |
| ✗ `[app]` | Mobile device test matrix | iPhone/Pixel/iPad |
| ✗ `[app]` | Lighthouse mobile ≥80 / a11y ≥95 | not measured |

**Gaps:** the bulk of the phase — a11y audit, performance audit, service worker, mobile QA.

## Phase 9 — Public launch  ·  ~5%

| | Task | Note |
|---|---|---|
| ✗ `[app]` | Final design polish | |
| ✗ `[launch]` | OG generation tested per-artifact | tied to OG routes |
| ✗ `[launch]` | Final env-var audit | |
| ✗ `[launch]` | Pen-test admin routes | |
| ✗ `[launch]` | DR drill (Supabase PITR restore) | |
| ✗ `[both]` | Final smoke test (every route/viewport) | |
| ◐ `[app]` | Seed corpus ≥150 | **corpus volume far exceeds 150 (thousands scored), but the Section-14 curated anchors with human-confirmed draft scores aren't loaded** |
| ✗ `[launch]` | First Zenodo snapshot | |

## Cross-cutting — Admin portal (§9)  ·  ~5%

Auth guard + magic-link login are real; **every admin tool is a stub.** Most admin is `[launch]`,
but one piece is `[app]`-relevant: the **score-confirmation queue** — the methodology says scores
are *proposals until a curator confirms them*, yet with no admin queue, **nothing is ever
human-confirmed**, so the whole public corpus is permanently "AI-proposed, unreviewed." A minimal
confirm/revise tool would make the methodology's human-in-the-loop real instead of aspirational.

---

## Bottom line

Delivered ≈ **40–45%** of the Phase 4–9 deliverable surface — deliberately the highest-leverage,
most committee-visible slice — at high depth-of-code but short breadth-of-features per phase.

**Application-critical gaps (worth building for the artifact), roughly in priority order:**
1. ~~Phase 5 tunnel~~ — **core v1 built** (d5b85d3); Stage B (station interactivity, grids, textures) deferred.
2. **Phase 8 a11y + performance pass** — stated success criteria; cheap-ish, high credibility.
3. **A minimal admin score-confirmation queue** — makes "proposals → human-confirmed" real.
4. **Phase 7 scholarly voice** — `/notes` + `/lineage`, and `/about`'s personal paragraph (author).
5. **Reading-mode toggle + OG images + FeaturedRail/findings headline** — polish that the committee touches/shares.

**Launch-only (safe to skip for the application):** Zenodo snapshots + quarterly cron + admin
snapshots, freeze-to-static, daily-digest, operational-mode, DR drill, pen-test, domain registration.
