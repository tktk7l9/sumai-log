import { describe, expect, it } from 'vitest'

import { SCHEDULE_LABELS_JA } from './scheduleLabels'

describe('SCHEDULE_LABELS_JA', () => {
  it('has Japanese labels', () => {
    expect(SCHEDULE_LABELS_JA.day).toBe('日')
    expect(SCHEDULE_LABELS_JA.month).toBe('月')
    expect(SCHEDULE_LABELS_JA.noEvents).toBe('予定はありません')
  })

  it('embeds the count in moreLabel', () => {
    expect(SCHEDULE_LABELS_JA.moreLabel?.(3)).toBe('他 3 件')
  })
})
