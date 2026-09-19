import { describe, expect, it } from 'vitest'

import { PLAN_TITLE_MAX, planEventDefaults } from './planDefaults'

const base = {
  title: '完成見学会のご案内',
  vendorName: 'テスト工務店',
  vendorId: 'v1',
  eventStart: '2026-09-27',
  url: 'https://example.com/news/1',
}

describe('planEventDefaults', () => {
  it('業者名+見出し・開始日・業者・URL をメモに', () => {
    expect(planEventDefaults(base)).toEqual({
      title: 'テスト工務店 完成見学会のご案内',
      date: '2026-09-27',
      vendorId: 'v1',
      note: 'https://example.com/news/1',
    })
  })
  it('メール由来はメモを空にする', () => {
    expect(planEventDefaults({ ...base, url: 'mail:<a@b>' })?.note).toBeNull()
  })
  it('日程が無ければ null', () => {
    expect(planEventDefaults({ ...base, eventStart: null })).toBeNull()
  })
  it('タイトルは上限で切る', () => {
    const long = planEventDefaults({ ...base, title: 'あ'.repeat(300) })
    expect(long?.title.length).toBe(PLAN_TITLE_MAX)
  })
})
