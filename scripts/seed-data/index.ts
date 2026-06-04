import { ANCHORS } from './anchors-spec';
import { ERA_1998_2005 } from './era-1998-2005';
import { ERA_2005_2012 } from './era-2005-2012';
import { ERA_2012_2018 } from './era-2012-2018';
import { ERA_2018_2024 } from './era-2018-2024';
import { ERA_2024_2026 } from './era-2024-2026';
import type { SeedArtifact } from './types';

/**
 * All curated seed artifacts. Append each era dataset here as it is authored
 * (era-1998-2005, era-2005-2012, …).
 */
export const ALL_SEED: SeedArtifact[] = [
  ...ANCHORS,
  ...ERA_1998_2005,
  ...ERA_2005_2012,
  ...ERA_2012_2018,
  ...ERA_2018_2024,
  ...ERA_2024_2026,
];
