import { describe, expect, it } from 'vitest'

import { areaCovers, matchesHomeAreas, normalizeArea, parseAreaList } from './serviceArea'

describe('parseAreaList', () => {
  it('読点・カンマ・改行・空白で分け、重複と空を除く', () => {
    expect(parseAreaList('テスト市、架空町, 仮想区\n テスト市 ')).toEqual([
      'テスト市',
      '架空町',
      '仮想区',
    ])
  })
})

describe('normalizeArea', () => {
  it('全角英数と空白を正規化し、末尾の「全域」「エリア」を落とす', () => {
    expect(normalizeArea(' 仮想県 全域 ')).toBe('仮想県')
    expect(normalizeArea('テスト市エリア')).toBe('テスト市')
    expect(normalizeArea('ＡＢＣ市')).toBe('ABC市')
  })
})

describe('areaCovers', () => {
  it('同じ名前・県名が前置された名前・県だけの指定を「含む」とみなす', () => {
    expect(areaCovers('テスト市', 'テスト市')).toBe(true)
    expect(areaCovers('テスト市', '仮想県テスト市')).toBe(true)
    expect(areaCovers('仮想県', '仮想県テスト市')).toBe(true)
    expect(areaCovers('仮想県全域', '仮想県テスト市')).toBe(true)
  })
  it('全国は何でも含む。別の市は含まない', () => {
    expect(areaCovers('全国', 'テスト市')).toBe(true)
    expect(areaCovers('架空市', 'テスト市')).toBe(false)
    expect(areaCovers('', 'テスト市')).toBe(false)
  })
})

describe('matchesHomeAreas', () => {
  it('施工エリアのどれかが建築予定地のどれかを含めば true', () => {
    expect(matchesHomeAreas(['架空市', 'テスト市'], ['テスト市'])).toBe(true)
    expect(matchesHomeAreas(['架空市'], ['テスト市', '仮想区'])).toBe(false)
    expect(matchesHomeAreas([], ['テスト市'])).toBe(false)
    expect(matchesHomeAreas(['テスト市'], [])).toBe(false)
  })
})
