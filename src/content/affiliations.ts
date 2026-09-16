/**
 * 業者が加盟している団体のデータ。ここは **データだけ**（関数を置かない。解決は `src/lib/affiliations.ts`）。
 *
 * 用語集の対応する用語（`src/content/glossary.ts`）と `glossaryId` で結びつく。
 */

export type Affiliation = {
  id: 'iedukuri100' | 'miratsugu' | 'kouzou-cram'
  /** 正式名 */
  name: string
  /** 通称 */
  shortName: string
  /** 公式サイト */
  url: string
  /** 用語集の id（/glossary/$termId） */
  glossaryId: string
  /** 内容を確認した日 */
  checkedOn: string
}

export const AFFILIATIONS: readonly Affiliation[] = [
  {
    id: 'iedukuri100',
    name: '家づくり百貨',
    shortName: '家百',
    url: 'https://iedukuri100.com/',
    glossaryId: 'iedukuri100',
    checkedOn: '2026-09-16',
  },
  {
    id: 'miratsugu',
    name: '未来へつなぐ工務店の会',
    shortName: 'みらつぐ',
    url: 'https://miratsugu.com/',
    glossaryId: 'miratsugu',
    checkedOn: '2026-09-16',
  },
  {
    id: 'kouzou-cram',
    name: '構造塾 家づくり応援・業者マップ',
    shortName: '構造塾マップ',
    url: 'https://kouzou-cram.com/',
    glossaryId: 'kouzou-cram',
    checkedOn: '2026-09-16',
  },
] as const

export type AffiliationId = Affiliation['id']

export const AFFILIATION_IDS = AFFILIATIONS.map((a) => a.id) as [AffiliationId, ...AffiliationId[]]
