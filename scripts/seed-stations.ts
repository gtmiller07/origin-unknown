/**
 * Seed the four canonical era stations (Phase 5) at the platform inflection points, each with the
 * spec's example interactive_variables and comparative_grids. Idempotent: clears the seeded titles
 * first, then re-inserts. The compute-stations cron (Stage B) may later adjust positions by density.
 *
 *   node --env-file=.env.local --import tsx scripts/seed-stations.ts
 */
import { useScriptDatabaseUrl } from './db-env';

interface Variable {
  id: string;
  label: string;
  type: 'toggle' | 'slider';
  default: boolean | number;
  unit?: string;
  min?: number;
  max?: number;
  description: string;
  filter_predicate: string;
}
interface Grid {
  id: string;
  label: string;
  description: string;
  group_by: string;
  sort_by: string;
  max_per_group: number;
  layout: 'grid' | 'strip';
}
interface SeedStation {
  position: number;
  title: string;
  description: string;
  technicalMarker: string;
  startDate: string;
  interactiveVariables: Variable[];
  comparativeGrids: Grid[];
}

const STATIONS: SeedStation[] = [
  {
    position: 0.28,
    title: 'YouTube launches',
    description: 'Broadband video goes mass; vernacular production begins to fill the walls.',
    technicalMarker: 'Broadband + the upload button (2005)',
    startDate: '2005-01-01',
    interactiveVariables: [
      {
        id: 'algo_feed_ranking',
        label: 'Algorithmic feed ranking',
        type: 'toggle',
        default: true,
        description:
          'When off, displays only artifacts that traveled before algorithmic ranking shaped distribution. The wall thins considerably.',
        filter_predicate: 'year <= 2010',
      },
      {
        id: 'mobile_first_capture',
        label: 'Mobile-first capture',
        type: 'slider',
        default: 30,
        unit: '%',
        min: 0,
        max: 100,
        description: 'Adjusts the proportion of mobile-captured artifacts visible at this era.',
        filter_predicate: 'mobile_share <= value',
      },
    ],
    comparativeGrids: [
      {
        id: 'vernacular_by_region',
        label: 'Vernacular forms by region',
        description:
          'How the early-YouTube vernacular took different forms in different language communities.',
        group_by: 'languageCodes[0]',
        sort_by: 'published_at',
        max_per_group: 16,
        layout: 'grid',
      },
    ],
  },
  {
    position: 0.5,
    title: 'Smartphone ubiquity',
    description: 'A camera in every pocket; self-representation becomes the default mode.',
    technicalMarker: 'Front-facing cameras, mobile data (2012)',
    startDate: '2012-01-01',
    interactiveVariables: [],
    comparativeGrids: [
      {
        id: 'smartphone_self_representation',
        label: 'Self-representation across cities',
        description:
          'Smartphone-shot self-representation, grouped by origin — the Selfiecity lens.',
        group_by: 'origin_country_codes[0]',
        sort_by: 'published_at',
        max_per_group: 16,
        layout: 'grid',
      },
    ],
  },
  {
    position: 0.72,
    title: 'The For You Page',
    description: 'Short-form, algorithmically-sorted feeds; wall density becomes extreme.',
    technicalMarker: 'TikTok recommendation engine (2018)',
    startDate: '2018-01-01',
    interactiveVariables: [
      {
        id: 'cross_language_reach_required',
        label: 'Cross-language reach required',
        type: 'toggle',
        default: false,
        description:
          'When on, displays only artifacts with documented reach in 3+ language regions.',
        filter_predicate: 'reach >= 0.5',
      },
      {
        id: 'state_actor_origin',
        label: 'State-actor origin',
        type: 'toggle',
        default: true,
        description: 'When off, removes state-media-originated artifacts from the wall.',
        filter_predicate: "authorship != 'state_affiliated'",
      },
    ],
    comparativeGrids: [],
  },
  {
    position: 0.87,
    title: 'Generative inflection',
    description: 'The technical floor reaches zero; the walls become uncountable.',
    technicalMarker: 'Diffusion + transformer video (2022)',
    startDate: '2022-01-01',
    interactiveVariables: [
      {
        id: 'ai_generated_only',
        label: 'AI-generated only',
        type: 'toggle',
        default: false,
        description: 'When on, displays only AI-generated artifacts from this era.',
        filter_predicate: "ai_mediation == 'ai_generated'",
      },
      {
        id: 'c2pa_attested',
        label: 'C2PA-attested only',
        type: 'toggle',
        default: false,
        description: 'When on, displays only artifacts with C2PA provenance assertions.',
        filter_predicate: 'has_c2pa == true',
      },
    ],
    comparativeGrids: [
      {
        id: 'cinematic_style_by_model',
        label: 'Cinematic style by model',
        description:
          'Grouped by the generator (Kling, Runway, Sora, Midjourney…), revealing each model’s fingerprint.',
        group_by: 'ai_generation_metadata.model',
        sort_by: 'scores.aesthetic_signal',
        max_per_group: 16,
        layout: 'grid',
      },
    ],
  },
];

async function main() {
  useScriptDatabaseUrl();
  const { db } = await import('../lib/db/client');
  const { eraStations } = await import('../lib/db/schema');
  const { inArray } = await import('drizzle-orm');

  const titles = STATIONS.map((s) => s.title);
  await db.delete(eraStations).where(inArray(eraStations.title, titles));

  for (const s of STATIONS) {
    await db.insert(eraStations).values({
      position: s.position.toFixed(2),
      title: s.title,
      description: s.description,
      technicalMarker: s.technicalMarker,
      startDate: s.startDate,
      interactiveVariables: s.interactiveVariables,
      comparativeGrids: s.comparativeGrids,
      isVisible: true,
    });
  }

  console.log(`Seeded ${STATIONS.length} era stations.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
