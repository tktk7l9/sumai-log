import { createServerFn } from '@tanstack/react-start'

import { GLOSSARY } from '../content/glossary'
import { ROADMAP_GUIDE } from '../content/roadmap'
import { getDb } from '../db/client'
import { roadmapTermLinks } from '../lib/roadmap'
import { readRoadmap, writeRoadmap } from './repository'
import { roadmapInput } from './roadmap.schema'

// The schema comes from roadmap.schema.ts (the reason for the split is there)
export { roadmapInput }
export type { RoadmapInput } from './roadmap.schema'

/**
 * The current stage, and for every stage the glossary terms its guide links to as
 * `{ id, term }`. The names are resolved here so that the home page does not import the
 * glossary (it used to, only for these names, which put every term into every page).
 */
export const getRoadmap = createServerFn().handler(async () => ({
  roadmap: await readRoadmap(getDb()),
  relatedTerms: roadmapTermLinks(ROADMAP_GUIDE, GLOSSARY),
}))

export const saveRoadmap = createServerFn({ method: 'POST' })
  .validator(roadmapInput)
  .handler(async ({ data }) => {
    const roadmap = { version: 1 as const, stage: data.stage }
    await writeRoadmap(getDb(), roadmap)
    return { ok: true as const, roadmap }
  })
