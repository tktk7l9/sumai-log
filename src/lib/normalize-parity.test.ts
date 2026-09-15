import { describe, expect, it } from 'vitest'

import { normalizeAddress } from './geocode'
import { normalizeSocialUrls } from './social'
import {
  normalizeAddress as normalizeAddressMjs,
  normalizeSocialUrls as normalizeSocialUrlsMjs,
} from '../../scripts/lib/normalize.mjs'

/**
 * normalizeAddress（住所）・normalizeSocialUrls（SNS URL）は
 * src/lib/（geocode.ts・social.ts）と scripts/lib/normalize.mjs の 2 箇所に同じ
 * ロジックを重複させている（seed 側は plain .mjs で TS を import できないため。
 * AGENTS.md「重複ロジックの同期」節を参照）。ここで同じケースを両実装に流し、
 * 出力が一致することを固定する。片方だけ直して忘れる回帰を検出するのが目的。
 */
describe('normalizeAddress: src/lib/geocode.ts と scripts/lib/normalize.mjs の一致', () => {
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

  it('null/undefined も一致する（.mjs 側は防御的に素通しする）', () => {
    expect(normalizeAddressMjs(null)).toBe(null)
    expect(normalizeAddressMjs(undefined)).toBe(undefined)
  })
})

describe('normalizeSocialUrls: src/lib/social.ts と scripts/lib/normalize.mjs の一致', () => {
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

  it('未指定（undefined/null）も一致する', () => {
    expect(normalizeSocialUrlsMjs(undefined)).toEqual(normalizeSocialUrls([]))
    expect(normalizeSocialUrlsMjs(null)).toEqual(normalizeSocialUrls([]))
  })
})
