import { describe, expect, it } from 'vitest'

import { listVendorNewsInput, newsEventsBetweenInput, planVisitInput } from './news.schema'

/**
 * fetchNewsNow / planVisitFromNews は createServerFn でラップされているため、
 * TanStack Start のサーバーランタイム（AsyncLocalStorage の Start context）が無い
 * 素の vitest workers テストから直接呼ぶと「No Start context found」で落ちる
 * （validator に届く前の話）。実質的な検証は validator である news.schema.ts の
 * 各スキーマを見れば足りるので、ここでは safeParse を直接確認する
 * （src/server/events.worker-test.ts と同じパターン）。
 */
describe('listVendorNewsInput', () => {
  it('vendorId 無し・limit/offset 省略で既定値になる', () => {
    const result = listVendorNewsInput.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ limit: 50, offset: 0 })
    }
  })

  it('limit は 200（1 か月ぶんの安全上限）まで許す', () => {
    expect(listVendorNewsInput.safeParse({ limit: 200 }).success).toBe(true)
  })

  it('limit が 200 を超えたら拒否する', () => {
    expect(listVendorNewsInput.safeParse({ limit: 201 }).success).toBe(false)
  })

  it('offset が負なら拒否する', () => {
    expect(listVendorNewsInput.safeParse({ offset: -1 }).success).toBe(false)
  })

  it('from/to（公開日の期間）を渡せる。YYYY-MM-DD 形式で', () => {
    const result = listVendorNewsInput.safeParse({ from: '2026-09-01', to: '2026-09-30' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toMatchObject({ from: '2026-09-01', to: '2026-09-30' })
    }
  })

  it('from/to は省略できる（期間の絞り込み無し）', () => {
    const result = listVendorNewsInput.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.from).toBeUndefined()
      expect(result.data.to).toBeUndefined()
    }
  })

  it('from/to の形式が違えば拒否する', () => {
    expect(listVendorNewsInput.safeParse({ from: '2026/09/01' }).success).toBe(false)
    expect(listVendorNewsInput.safeParse({ to: '9-2026-01' }).success).toBe(false)
  })
})

describe('newsEventsBetweenInput', () => {
  it('YYYY-MM-DD の from/to をそのまま通す（月をまたいでもよい）', () => {
    const result = newsEventsBetweenInput.safeParse({ from: '2026-08-25', to: '2026-10-07' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ from: '2026-08-25', to: '2026-10-07' })
    }
  })

  it('形式が違えば拒否する', () => {
    expect(newsEventsBetweenInput.safeParse({ from: '2026/09/01', to: '2026-09-30' }).success).toBe(
      false,
    )
  })
})

describe('planVisitInput', () => {
  it('id の形式が UUID でなければ拒否する', () => {
    expect(planVisitInput.safeParse({ newsId: 'not-a-uuid' }).success).toBe(false)
  })

  it('UUID なら通る', () => {
    const result = planVisitInput.safeParse({ newsId: '11111111-1111-1111-1111-111111111111' })
    expect(result.success).toBe(true)
  })
})
