# Origin Unknown

**A Methodological Instrument for Measuring AI-Mediated Cultural Diplomacy**

*Grady Miller — USC Media Arts and Practice PhD applicant*

---

This is a working scholarly instrument, not a demo. It ingests AI-mediated cultural content from seven source categories, scores each artifact against a six-axis framework of cultural diplomacy effect, and makes every scoring decision and its reasoning publicly visible.

The instrument is the methodological contribution. The substantive findings about AI and cultural diplomacy emerge after the instrument has been operated and the corpus has accumulated.

**Live instrument:** https://originunknown.org

**Methodology:** https://originunknown.org/methodology

**Scoring log:** https://originunknown.org/scoring-log

---

## The six axes

- **Origin** — cultural and computational provenance
- **Reach** — cross-boundary travel and audience geography
- **Aesthetic signal** — distinctiveness of stylistic fingerprint
- **Diplomatic cross-boundary** — Cull and Zaharna's relational frame
- **Diplomatic authenticity** — Steyerl's poor-image framework
- **Diplomatic reciprocity** — the bilateral exchange question that *The Family of Man* assumed

---

## Stack

Next.js 15, TypeScript, Tailwind 4, Drizzle + Supabase (PostgreSQL), React Three Fiber, Framer Motion, Anthropic Claude (scoring), OpenAI (embeddings), Vercel.

Full dependency list in `package.json` with pinned versions.

---

## Setup

See `docs/PROVISIONING.md` for the full credential setup walkthrough.

```bash
npm install --legacy-peer-deps
cp .env.example .env.local
# fill in .env.local with your credentials
npm run db:push
npm run dev
```

---

## Takedown

Content in this corpus can be removed. Use the form at /takedown or email grady@nrgmr.com directly.

---

## License

Code: Apache 2.0 (see LICENSE)
Corpus and methodology: CC BY-NC 4.0 (see LICENSE-content.md)
