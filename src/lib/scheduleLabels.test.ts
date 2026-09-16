import { describe, expect, it } from 'vitest'

import { SCHEDULE_LABELS_JA } from './scheduleLabels'

describe('SCHEDULE_LABELS_JA', () => {
  it('日本語ラベルを持つ', () => {
    expect(SCHEDULE_LABELS_JA.day).toBe('日')
    expect(SCHEDULE_LABELS_JA.month).toBe('月')
    expect(SCHEDULE_LABELS_JA.noEvents).toBe('予定はありません')
  })

  it('moreLabel は件数を埋め込む', () => {
    expect(SCHEDULE_LABELS_JA.moreLabel?.(3)).toBe('他 3 件')
  })
})
