import { describe, expect, it } from 'vitest'

import { areaCovers, matchesHomeAreas, normalizeArea, parseAreaList } from './serviceArea'

describe('parseAreaList', () => {
  it('splits on Japanese commas, commas, newlines and whitespace, and removes duplicates and empties', () => {
    expect(parseAreaList('テスト市、架空町, 仮想区\n テスト市 ')).toEqual([
      'テスト市',
      '架空町',
      '仮想区',
    ])
  })
})

describe('normalizeArea', () => {
  it('normalizes full-width alphanumerics and whitespace, and drops a trailing "全域" (whole area) or "エリア" (area)', () => {
    expect(normalizeArea(' 仮想県 全域 ')).toBe('仮想県')
    expect(normalizeArea('テスト市エリア')).toBe('テスト市')
    expect(normalizeArea('ＡＢＣ市')).toBe('ABC市')
  })
})

describe('areaCovers', () => {
  it('treats the same name, a name prefixed with the prefecture, and a prefecture-only value as covering', () => {
    expect(areaCovers('テスト市', 'テスト市')).toBe(true)
    expect(areaCovers('テスト市', '仮想県テスト市')).toBe(true)
    expect(areaCovers('仮想県', '仮想県テスト市')).toBe(true)
    expect(areaCovers('仮想県全域', '仮想県テスト市')).toBe(true)
  })
  it('covers anything with "全国" (nationwide). Does not cover a different city', () => {
    expect(areaCovers('全国', 'テスト市')).toBe(true)
    expect(areaCovers('架空市', 'テスト市')).toBe(false)
    expect(areaCovers('', 'テスト市')).toBe(false)
  })
})

describe('matchesHomeAreas', () => {
  it('is true when any service area covers any planned building site', () => {
    expect(matchesHomeAreas(['架空市', 'テスト市'], ['テスト市'])).toBe(true)
    expect(matchesHomeAreas(['架空市'], ['テスト市', '仮想区'])).toBe(false)
    expect(matchesHomeAreas([], ['テスト市'])).toBe(false)
    expect(matchesHomeAreas(['テスト市'], [])).toBe(false)
  })
})
