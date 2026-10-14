import { runInNewContext } from 'node:vm'

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { ZOD_JITLESS_SCRIPT } from './zodJitless'

describe('ZOD_JITLESS_SCRIPT', () => {
  it('switches zod to jitless on a page where zod has not loaded yet', () => {
    const page: Record<string, unknown> = {}
    runInNewContext(ZOD_JITLESS_SCRIPT, page)
    expect(JSON.stringify(page.__zod_globalConfig)).toBe('{"jitless":true}')
  })

  it('keeps settings that are already there', () => {
    const page: Record<string, unknown> = { __zod_globalConfig: { customError: 'x' } }
    runInNewContext(ZOD_JITLESS_SCRIPT, page)
    expect(JSON.stringify(page.__zod_globalConfig)).toBe('{"customError":"x","jitless":true}')
  })

  it('works because zod keeps its settings in that global (fails if a zod update moves them)', () => {
    expect(z.config()).toBe((globalThis as { __zod_globalConfig?: unknown }).__zod_globalConfig)
  })

  it('cannot close the <script> element it is written into', () => {
    expect(ZOD_JITLESS_SCRIPT).not.toContain('<')
  })
})
