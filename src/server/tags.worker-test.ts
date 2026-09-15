import { describe, expect, it } from 'vitest'

import { tagsInput } from './tags'

/**
 * saveTags は createServerFn でラップされているため、TanStack Start の
 * サーバーランタイム（AsyncLocalStorage の Start context）が無い素の
 * vitest workers テストから直接呼ぶと「No Start context found」で落ちる
 * （validator に届く前の話）。実質的な検証は validator である tagsInput
 * 自体を見れば足りるので、ここでは tagsInput.safeParse を直接確認する。
 */
describe('tagsInput', () => {
  it('names が空配列だと拒否する（seedDefaultTags の再発火を防ぐ）', () => {
    const result = tagsInput.safeParse({ names: [] })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('タグは 1 つ以上必要です')
    }
  })

  it('names が 1 件以上なら通る', () => {
    expect(tagsInput.safeParse({ names: ['断熱'] }).success).toBe(true)
  })
})
