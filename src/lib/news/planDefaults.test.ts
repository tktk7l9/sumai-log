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
  it('vendor name + headline, start date, vendor, and the URL as the note', () => {
    expect(planEventDefaults(base)).toEqual({
      title: 'テスト工務店 完成見学会のご案内',
      date: '2026-09-27',
      vendorId: 'v1',
      note: 'https://example.com/news/1',
    })
  })
  it('leaves the note empty for news that came from mail', () => {
    expect(planEventDefaults({ ...base, url: 'mail:<a@b>' })?.note).toBeNull()
  })
  it('null when there are no event dates', () => {
    expect(planEventDefaults({ ...base, eventStart: null })).toBeNull()
  })
  it('cuts the title at the limit', () => {
    const long = planEventDefaults({ ...base, title: 'あ'.repeat(300) })
    expect(long?.title.length).toBe(PLAN_TITLE_MAX)
  })
})
