import { beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_ROADMAP } from '../../lib/roadmap'
import { readRoadmap, writeRoadmap } from './roadmap'
import { writeSetting } from './settings'
import { db, reset } from './test-helpers'

beforeEach(reset)

describe('roadmap', () => {
  it('starts at the default stage and round-trips the saved one', async () => {
    expect(await readRoadmap(db)).toEqual(DEFAULT_ROADMAP)
    await writeRoadmap(db, { version: 1, stage: 'contract' })
    expect(await readRoadmap(db)).toEqual({ version: 1, stage: 'contract' })
    await writeRoadmap(db, { version: 1, stage: 'vendor' })
    expect(await readRoadmap(db)).toEqual({ version: 1, stage: 'vendor' })
  })

  it('falls back to the default when the saved value is broken', async () => {
    await writeSetting(db, 'roadmap', '{"stage":"moon"}')
    expect(await readRoadmap(db)).toEqual(DEFAULT_ROADMAP)
  })
})
