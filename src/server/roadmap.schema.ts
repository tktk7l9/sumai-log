import { z } from 'zod'

import { ROADMAP_STAGE_IDS } from '../lib/roadmap'

/**
 * zod for "現在地を変更" (Move the current stage) of the roadmap. Separated from roadmap.ts
 * for the same reason as research.schema.ts (the createServerFn wrapper cannot be imported
 * from a plain workers test).
 */
export const roadmapInput = z.object({ stage: z.enum(ROADMAP_STAGE_IDS) })
export type RoadmapInput = z.infer<typeof roadmapInput>
