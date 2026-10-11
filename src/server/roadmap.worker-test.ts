import { describe, expect, it } from 'vitest'

import { roadmapInput } from './roadmap.schema'

/** saveRoadmap is wrapped in createServerFn, so only the validator is checked here */
describe('roadmapInput', () => {
  it('accepts a known stage and rejects anything else', () => {
    expect(roadmapInput.safeParse({ stage: 'contract' }).success).toBe(true)
    expect(roadmapInput.safeParse({ stage: 'moon' }).success).toBe(false)
    expect(roadmapInput.safeParse({}).success).toBe(false)
  })
})
