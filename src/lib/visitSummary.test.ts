import { describe, expect, it } from 'vitest'

import { visitSummary } from './visitSummary'

const base = { placeName: null, vendorName: null, propertyName: null, good: null }

describe('visitSummary', () => {
  it('titles with the place and names the vendor under it', () => {
    expect(
      visitSummary({ ...base, placeName: 'テスト展示場', vendorName: 'テスト工務店' }),
    ).toMatchObject({ title: 'テスト展示場', subject: 'テスト工務店' })
  })

  it('falls back to the vendor, then the property, and does not repeat it as subject', () => {
    expect(visitSummary({ ...base, vendorName: 'テスト工務店' })).toMatchObject({
      title: 'テスト工務店',
      subject: null,
    })
    expect(visitSummary({ ...base, propertyName: 'テスト101' }).title).toBe('テスト101')
  })

  it('says the place is not set when nothing is linked', () => {
    expect(visitSummary(base).title).toBe('場所未設定')
  })

  it('names the property as subject when the place belongs to a condominium', () => {
    expect(
      visitSummary({ ...base, placeName: 'テストモデルルーム', propertyName: 'テスト101' }).subject,
    ).toBe('テスト101')
  })

  it('takes the first non-empty line of 良かった点 (good points) as the excerpt', () => {
    expect(visitSummary({ ...base, good: '\n  木の香り  \n駐車場' }).excerpt).toBe('木の香り')
    expect(visitSummary({ ...base, good: '   ' }).excerpt).toBeNull()
    expect(visitSummary(base).excerpt).toBeNull()
  })
})
