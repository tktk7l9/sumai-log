import { describe, expect, it } from 'vitest'

import { normalizeAddress } from './geocode'
import { normalizeSocialUrls } from './social'
import {
  normalizeAddress as normalizeAddressMjs,
  normalizeSocialUrls as normalizeSocialUrlsMjs,
} from '../../scripts/lib/normalize.mjs'

/**
 * normalizeAddress (addresses) and normalizeSocialUrls (social media URLs) duplicate the same
 * logic in 2 places, src/lib/ (geocode.ts, social.ts) and scripts/lib/normalize.mjs (the seed
 * side is plain .mjs and cannot import TS. See the section "重複ロジックの同期" (Keeping
 * duplicated logic in sync) of AGENTS.md). Here the same cases are fed to both
 * implementations to pin that the outputs match. The goal is to detect the regression of
 * fixing only one side and forgetting the other.
 */
describe('normalizeAddress: src/lib/geocode.ts and scripts/lib/normalize.mjs match', () => {
  const cases: [string, string][] = [
    ['全角数字', '架空市架空町１丁目２番３号'],
    ['全角スペース区切り', '架空市　架空町1丁目2番3号'],
    ['丁目のみ（番地無し）', '架空市架空町1丁目'],
    ['全角ハイフン', '架空市架空町1－2－3'],
    ['長音記号ダッシュ', '架空市架空町1ー2ー3'],
    ['前後の半角スペース', ' 仮想県 テスト市 1-2-3 '],
  ]

  it.each(cases)('%s: %s', (_label, input) => {
    expect(normalizeAddressMjs(input)).toBe(normalizeAddress(input))
  })

  it('null/undefined match too (the .mjs side passes them through defensively)', () => {
    expect(normalizeAddressMjs(null)).toBe(null)
    expect(normalizeAddressMjs(undefined)).toBe(undefined)
  })
})

describe('normalizeSocialUrls: src/lib/social.ts and scripts/lib/normalize.mjs match', () => {
  const cases: [string, string[]][] = [
    [
      'トラッキングパラメータ違いは別 URL として扱う',
      [
        'https://www.instagram.com/example/?utm_source=x',
        'https://www.instagram.com/example/?utm_source=y',
      ],
    ],
    [
      '末尾スラッシュの有無は別 URL として扱う',
      ['https://x.com/example', 'https://x.com/example/'],
    ],
    [
      'http と https は別 URL として扱う（正規化で寄せない）',
      ['http://example.com/a', 'https://example.com/a'],
    ],
    [
      'ホストの大文字小文字違いも別 URL として扱う',
      ['https://WWW.Instagram.com/Example', 'https://www.instagram.com/Example'],
    ],
    [
      'http(s) 以外・空文字は除外する',
      [
        'ftp://example.com',
        '//example.com/a',
        'mailto:test@example.com',
        'https://example.com/ok',
        '',
      ],
    ],
    [
      '前後の空白を trim してから完全一致で重複除去・10 件まで',
      [
        ' https://example.com/a ',
        'https://example.com/a',
        ...Array.from({ length: 10 }, (_, i) => `https://example.com/extra-${i}`),
      ],
    ],
  ]

  it.each(cases)('%s', (_label, input) => {
    expect(normalizeSocialUrlsMjs(input)).toEqual(normalizeSocialUrls(input))
  })

  it('unspecified (undefined/null) matches too', () => {
    expect(normalizeSocialUrlsMjs(undefined)).toEqual(normalizeSocialUrls([]))
    expect(normalizeSocialUrlsMjs(null)).toEqual(normalizeSocialUrls([]))
  })
})
