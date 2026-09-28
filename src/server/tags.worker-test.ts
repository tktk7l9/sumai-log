import { describe, expect, it } from 'vitest'

import { tagsInput } from './tags'

/**
 * saveTags is wrapped in createServerFn, so calling it directly from a plain
 * vitest workers test, which has no TanStack Start server runtime (the Start
 * context in AsyncLocalStorage), fails with "No Start context found"
 * (before it even reaches the validator). Checking the validator, tagsInput
 * itself, is enough for real validation, so here we check tagsInput.safeParse directly.
 */
describe('tagsInput', () => {
  it('rejects an empty names array (prevents seedDefaultTags from firing again)', () => {
    const result = tagsInput.safeParse({ names: [] })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('タグは 1 つ以上必要です')
    }
  })

  it('accepts names with 1 or more entries', () => {
    expect(tagsInput.safeParse({ names: ['断熱'] }).success).toBe(true)
  })
})
