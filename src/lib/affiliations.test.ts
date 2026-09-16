import { describe, expect, it } from 'vitest'

import { findAffiliation, resolveAffiliations } from './affiliations'

// AFFILIATIONS は id 2 件だけの固定データ（実在の団体名・URL は仕様上コードに残す約束）。
// 「未知の id」の検証だけ架空の値を使う。

describe('findAffiliation', () => {
  it('id から団体を引ける', () => {
    expect(findAffiliation('iedukuri100')?.shortName).toBe('家百')
    expect(findAffiliation('miratsugu')?.shortName).toBe('みらつぐ')
  })

  it('未知の id は null', () => {
    expect(findAffiliation('unknown-org')).toBeNull()
  })
})

describe('resolveAffiliations', () => {
  it('id の配列を団体へ解決する（渡した順を保つ）', () => {
    expect(resolveAffiliations(['miratsugu', 'iedukuri100']).map((a) => a.id)).toEqual([
      'miratsugu',
      'iedukuri100',
    ])
  })

  it('未知の id は黙って落とす', () => {
    expect(resolveAffiliations(['iedukuri100', 'unknown-org']).map((a) => a.id)).toEqual([
      'iedukuri100',
    ])
  })

  it('重複は除く（初出の位置を保つ）', () => {
    expect(
      resolveAffiliations(['iedukuri100', 'iedukuri100', 'miratsugu']).map((a) => a.id),
    ).toEqual(['iedukuri100', 'miratsugu'])
  })

  it('空配列は空配列を返す', () => {
    expect(resolveAffiliations([])).toEqual([])
  })
})
