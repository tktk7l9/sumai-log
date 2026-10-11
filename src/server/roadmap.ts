import { createServerFn } from '@tanstack/react-start'

import { getDb } from '../db/client'
import { readRoadmap, writeRoadmap } from './repository'
import { roadmapInput } from './roadmap.schema'

// The schema comes from roadmap.schema.ts (the reason for the split is there)
export { roadmapInput }
export type { RoadmapInput } from './roadmap.schema'

export const getRoadmap = createServerFn().handler(async () => ({
  roadmap: await readRoadmap(getDb()),
}))

export const saveRoadmap = createServerFn({ method: 'POST' })
  .validator(roadmapInput)
  .handler(async ({ data }) => {
    const roadmap = { version: 1 as const, stage: data.stage }
    await writeRoadmap(getDb(), roadmap)
    return { ok: true as const, roadmap }
  })
