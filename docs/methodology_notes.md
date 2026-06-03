# Methodology Notes — Origin Unknown

These notes supplement, and do not replace, the canonical methodology. The scored
construct, the six axes, the authorship taxonomy (`authorship_class`, `ai_mediation`,
`origin_ambiguity`), and the project's working bibliography are defined in the **active
scoring prompt** (`scoring_prompts` v1.1, seeded by
`supabase/migrations/0011_seed_scoring_prompt_v1_1.sql`). That prompt is the source of
truth for the instrument and is not edited here. This file records literature
positioning and methodological decisions that sit alongside it.

**On the existing bibliography.** The active prompt already cites Cull's five-component
taxonomy, Nye, Zaharna's relational paradigm (with Arsenault and Fisher, 2013), and
Manor (2019) in its public-diplomacy tradition; Chun, Noble, Benjamin, Crawford,
Gillespie, Bucher, van Dijck/Poell/de Waal, and Zuboff in its critical
algorithm/platform-studies tradition; and Steyerl, Paglen/Crawford, and Hui in its
art-and-image-circulation tradition. That critical tradition currently cites
*surveillance capitalism* (Zuboff, 2019) and *the platform society* (van Dijck et al.,
2018) but does **not** cite Couldry & Mejias; see "Positioning against recent
literature" and "Proposed instrument changes" below.

## Positioning against recent literature (2024)

**Nicholas J. Cull, *Reputational Security: Refocusing Public Diplomacy for a Dangerous
World* (Polity, 2024).** Cull — the field's leading historian — argues that "soft
power" has outlived its usefulness as the organizing concept of public diplomacy and
should be retired in favor of *reputational security*: the claim that a state's
reputation is a security asset to be defended, not an optional prestige extra. The
reframing operates at the level of statecraft and institutional status; it raises the
stakes of the activity and relocates it within security policy. It does **not** dispute
the underlying *mechanism* by which cultural content crosses borders and earns or loses
credibility — attraction, reciprocity, credibility, and the conditions under which an
artifact is taken up on the far side of a boundary. That mechanism is exactly what this
instrument measures, at the artifact level, through the six axes. Our position,
therefore, is to **retain the attraction/credibility mechanism as the scored
construct**, because our question is not about the institutional status of reputation
but about the *democratization* of that mechanism once the technical floor of cultural
production drops to zero. Reputational security depends on the mechanism; it does not
replace it. Our empirical findings are accordingly **inputs to a reputational-security
analysis, not rivals to it** — they supply the granular, artifact-level measurement
that Cull's conceptual and historical argument does not attempt. The relationship is
also one of **convergence, not only difference**: a central reason Cull abandons soft
power is its *state-centrism* — the concept was built around a single state actor's
reputation and fits poorly in a world of collective, non-state, and ambiguous actors.
This project pushes against the *same* state-centrism from the opposite end, by
centering individual, community, and machine authorship and by treating
origin-ambiguity as data. On the critique of the classical state-centric model we are
**allied with Cull, not in conflict with him**. We position against his reframing as
our scored construct — we do not adopt it, relabel the axes in reputational-security
terms, or capitulate to it.

**Ulises A. Mejias and Nick Couldry, *Data Grab: The New Colonialism of Big Tech and
How to Fight Back* (WH Allen / University of Chicago Press, 2024).** *Data Grab* is the
authors' current, more activist statement of the "data colonialism" thesis first
advanced in *The Costs of Connection* (2019): that Big Tech's appropriation of human
life as extractable data constitutes a new colonial enclosure, and that the
infrastructures of connection are privately owned and governed for extraction. We cite
*Data Grab* as the 2024 statement of that argument and tie it to a specific design
choice: because the platform and recommendation infrastructure that decides *what
travels* is privately owned and opaque, **`origin_ambiguity` and the question of who
controls propagation are treated as first-class dimensions of the instrument, not
incidental metadata**. The condition the instrument is built to register — that one
often cannot recover where a circulating artifact came from, or who amplified it — is,
on this account, a product of that enclosure rather than a neutral fact of the medium.

**Corneliu Bjola and Ilan Manor, "Digital diplomacy in the age of technological
acceleration: three impact scenarios of generative artificial intelligence," *Place
Branding and Public Diplomacy* (2024).** This is the field's first sustained engagement
with the question this project asks, and the closest prior work: Bjola and Manor map
how generative AI may reshape digital diplomacy across three forward-looking impact
scenarios. The framework distinguishes **horizontal acceleration** (how many diplomatic
domains generative AI touches) from **vertical acceleration** (how deeply its effects
ripple within a domain), and names three scenarios along those axes: **Dedalus** —
impact confined to a few domains, mostly easing diplomats' daily routines (minimal
acceleration); **Pygmalion** — the intermediate case, where most foreign ministries
position themselves between the poles; and **Heracles** — generative-AI systems
interacting with one another and reducing human diplomats to messengers, which the
authors call "the end of diplomacy" (maximal acceleration). Their contribution is
scenario-level theory; ours is an
empirical measurement apparatus. We therefore position the instrument as
**complementary to, and testable against, their scenarios** — a means of generating
artifact-level evidence that could confirm, qualify, or falsify scenario claims —
rather than as derivative of them. (Manor's 2019 work on the digitalization of public
diplomacy is already cited in the active prompt; this 2024 paper, co-authored with
Bjola, is the newer and more directly relevant work.)

## Provenance

These three citations were added on **2026-06-02** and **web-verified on 2026-06-03**
against publisher/journal listings: Cull, *Reputational Security* (Polity Press, 11 Mar
2024); Mejias & Couldry, *Data Grab* (WH Allen, UK / University of Chicago Press, US,
2024); Bjola & Manor, *Place Branding and Public Diplomacy*, published online Feb 2024
(DOI 10.1057/s41254-023-00323-4). Titles, authors, venues, and the Bjola–Manor scenario
names (Dedalus / Pygmalion / Heracles) were confirmed from those listings; a final pass
against each source's full text remains advisable before formal citation.

## Proposed instrument changes — decided 2026-06-03

*Decisions (2026-06-03): items 1, 2, 4, and 5 were ACCEPTED as framing-only changes and shipped
as scoring prompt v1.2 (migration 0015, deactivating v1.1). They touch prose / citations /
wording — not the six axes' scales — so existing v1.1 scores remain comparable (and are tagged
per row via `scores.scoring_prompt_version`); nothing was re-scored. Item 3 (credibility) was
decided as **documented synthesis, not a new axis**: the six axes stand, and credibility is
treated as the compositional target that `origin` + `diplomatic_authenticity` +
`authorship_class` feed — foregrounded in analysis, not separately scored (avoids proliferating
proxies, per the field's own measurement caution). The original proposals are retained below
for the record.*

1. **Vocabulary hygiene in the prose framing (Cull).** The active prompt and the public
   site copy lean on "soft power" as a framing term. In light of Cull (2024), we may
   want to adjust the *prose* — not the construct — so the project does not read as
   working from a pre-2010 reading list: e.g., naming the attraction/credibility
   *mechanism* we actually measure while acknowledging reputational security as the
   field's governing policy frame. This is a wording change to framing text only; it
   would not alter the six axes, the scored construct, or any score already produced.
   Scope if approved: the public-facing copy and/or a future scoring-prompt version —
   both active surfaces I have not touched.

2. **Add Couldry & Mejias to the active prompt's critical tradition.** The active
   prompt's critical algorithm/platform-studies tradition cites Zuboff and van Dijck et
   al. but not Couldry & Mejias. If you want the data-colonialism lineage represented in
   the *scorer's* framing (not only in these notes), that is a one-line addition to the
   scoring-prompt bibliography — i.e., a new `scoring_prompts` version. It would not
   change the axes or invalidate existing scores, but because it edits an active prompt
   it is listed here for approval rather than applied.

3. **Name credibility explicitly (or document it as the compositional target).** The field's
   load-bearing concept — Cull's "credibility cannot be manufactured," the Al Jazeera
   credibility paradox (an instrument is valuable only insofar as it does not appear to serve
   its sponsor), and the AI debate's claim that ambiguous origin makes "the provenance
   credibility depends on" unrecoverable — is not a named axis. We measure its *inputs* (origin,
   diplomatic_authenticity, authorship_class, origin_ambiguity) but not the synthesis the field
   treats as the actual variable. Candidate: add a credibility dimension (artifact-level
   credibility *affordances* — legible origin, authority markers, apparent independence from an
   obvious sponsor), or document credibility as the compositional target the existing fields
   feed so analysis foregrounds it. Adds a field/affordance; does not alter the six axes.

4. **Scope the soft-power / sharp-power boundary.** The field's most active current debate
   (Walker & Ludwig, 2017) holds that not all cross-boundary influence is attraction — some
   "pierces" (manipulation, corrosion), and AI is the accelerant of computational propaganda. As
   built, the axes would score a boundary-crossing AI disinformation piece as diplomatically
   successful. Candidate: a manipulation/valence flag, or — preferred — an explicit scope
   statement that the instrument measures *travel and character*, while the soft/sharp
   legitimacy judgment is a separate layer the artifact alone underdetermines (also the
   principled answer to the actor-identity critique that soft/sharp maps onto us/them). A flag
   adds a field; the scope statement is prose only.

5. **Reach-as-proxy discipline; no weighted composite.** Arsenault's measurement dilemma and
   Bean & Comor warn that the big-data turn "measures what is easy rather than what matters";
   reach is the easy metric and AI video posts large reach numbers. No rubric change is
   proposed: keep the six axes independent — a weighted composite would be exactly the "proxy
   dressed as a measure" the field's rigorous wing distrusts (the Soft Power 30 critique).
   Record only the interpretive rule — the three *diplomatic* axes (cross_boundary,
   authenticity, reciprocity) are the construct; origin and reach are enabling conditions;
   aesthetic_signal is the most provisional axis (weakest field grounding — re-anchor it to
   origin-legibility / anti-"cultural odorlessness," or retire it if the six ever feel like one
   too many).

*(Items 3–5 added 2026-06-03 from a review of the instrument against an intellectual-history
dossier of the public- and cultural-diplomacy field. Candidates for decision only — nothing
applied; the six axes, the active prompt, the taxonomy, the classifier, and every score already
produced are unchanged.)*

## Source access & data-use constraints

Operational notes on source access and on *publishing* the corpus — distinct from the scored
construct above; nothing here changes the rubric, the six axes, the authorship taxonomy, the
classifier, or any score already produced.

- **Reddit** (`reddit` category). Reddit's Data API has a free tier for non-commercial /
  research use (≈100 queries/min per OAuth app), which this instrument qualifies for. Two
  constraints follow from Reddit's current terms: (1) since Reddit's 2025 "Responsible
  Builder" policy, registering the app requires Reddit's **approval** before the credentials
  function, and free-tier use must stay **non-commercial**; (2) Reddit restricts
  **redistribution** of content, so Reddit artifacts may be ingested and analyzed, but the
  **published and archived corpus** (`corpus_snapshots`, Zenodo DOI) must contain only
  *derived or aggregate* Reddit data — never raw post text. The export pipeline must enforce
  this when built.
- **General principle.** Corpus publication respects each source's redistribution terms. CC0
  museum objects (Met, Cleveland) are freely redistributable; state-media RSS, YouTube/Vimeo
  metadata, and Reddit text are retained for analysis but published only as derived features
  or short fair-use excerpts, per each provider's terms. This is a *publication-time*
  constraint, not an *ingestion-time* one — ingestion and scoring are unchanged.

*(Added 2026-06-03; Reddit's access/redistribution terms web-verified the same day against
Reddit's Data API wiki and the 2025 Responsible Builder policy. Re-verify current terms before
the public corpus release.)*

## Corpus constituency & early scoring findings

Operational + empirical notes from a constituency audit and the first stratified scoring runs.
Distinct from the construct above; nothing here changes the rubric, the six axes, the taxonomy,
the classifier, or any score. Early figures are **directional (n≈30 per cell), not powered.**

**Constituency audit.** The challenger (AI) class was initially image-heavy (≈76% Civitai
stills) and ~92% English/Western, while the incumbent baseline spanned a dozen mostly-non-Western
state-media origins — an asymmetry that would have confounded the cross-cultural question. Two
corrections: (1) cross-cultural AI-film creators were sought and seeded (Spanish, Hindi, Chinese
TW + mainland, Portuguese), establishing that non-English AI filmmaking is real and diffusing but
an order of magnitude smaller than the English scene (≤40K vs 266K subs), with **Arabic and
Korean AI-film still barely emergent** — a finding in itself; (2) a dedicated AI-video stream
(Civitai video base-models, Vimeo, the AI-film channels) was built so the medium the question
centers on is represented.

**Corpus-balance policy (rec #4).** Mastodon (≈8,700 grassroots-text posts) is treated as the
*listening* layer (Cull's first component), lazily gated on demand — the relevance gate already
triages most of it out of the scored set. Scoring/triage budget is steered to challenger AI-video
and cross-cultural content by design (stratified scoring targets class × medium, not raw volume),
so easy-to-firehose text does not crowd out hard-to-find diverse AI video.

**Early media-matched scoring** (six-axis means, n≈30/cell, video vs video):

| axis | AI-video (Western) | AI-video (non-English) | incumbent broadcaster | ambiguous |
|---|--:|--:|--:|--:|
| origin | 0.46 | 0.63 | 0.78 | 0.55 |
| reach | 0.31 | 0.20 | 0.40 | 0.25 |
| aesthetic_signal | 0.55 | 0.31 | 0.28 | 0.29 |
| diplomatic_cross_boundary | 0.19 | 0.21 | 0.45 | 0.24 |
| diplomatic_authenticity | 0.33 | 0.39 | 0.43 | 0.27 |
| diplomatic_reciprocity | 0.07 | 0.08 | 0.12 | 0.08 |

Reads (directional): (i) cross-boundary is the one axis where human institutional media clearly
leads everything — AI video is not yet doing the cross-border diplomatic work; (ii) Western AI's
edge is aesthetic novelty, but it is the most "odorless" (lowest origin/authenticity); (iii)
non-Western AI is more culturally *rooted* (origin + authenticity near human levels) but
lower-reach and less polished; (iv) reciprocity is near-zero across the board. **Working thesis:**
AI is democratizing culturally-authentic *production* globally faster than the cross-border
diplomatic *reach* institutions still hold; within AI, polish/reach skew Western while
authenticity skews non-Western. Caveats: small n; the incumbent here is international broadcasters
built for cross-border (a high bar); AI narrative film vs news is a genre mismatch.

**Ambiguous-video mining (rec #2).** A sample of the ~1,884 ambiguous-video pool classified
≈53% AI — on the order of ~1,000 more AI videos are recoverable from it (Vimeo films + AI video
on Mastodon/Bluesky). Full classification is incremental (cron + targeted batches), not a burst.

**On `aesthetic_signal` (revises Proposed-change #5).** Flagged in the dossier review as the
weakest-grounded axis, it is in fact the *most discriminating* one — where AI most diverges from
incumbent media, and where Western and non-Western AI diverge from each other. Recommendation:
**keep it, re-anchored as "stylistic distinctiveness / where AI diverges,"** rather than retire it.

*(Findings added 2026-06-03 from a corpus-constituency audit + the first stratified scoring runs;
directional only, n≈30/cell. Nothing here alters the construct or any score.)*
