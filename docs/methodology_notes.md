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

## Proposed instrument changes, pending approval

*Nothing in this section has been applied. These are candidates for your decision; the
active scoring prompt, the six axes, the authorship taxonomy, the relevance classifier,
the database, and every score already produced are unchanged.*

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

No other instrument changes are proposed.
