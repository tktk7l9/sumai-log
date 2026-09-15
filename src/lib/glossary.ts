/**
 * 用語集の検索・分類・関連語。データ（`src/content/glossary.ts`）は持たず、
 * 渡された配列だけを見る純粋関数にしている。
 */

import { GLOSSARY_CATEGORIES, type GlossaryCategory, type GlossaryTerm } from '../content/glossary'

/**
 * 検索キーの正規化。
 * - NFKC: 全角英数・半角カナを標準形にそろえる（「ＵＡ」→「UA」「ｱﾙﾌｧ」→「アルファ」）
 * - 小文字化: 「UA」と「ua」を同じに扱う
 * - 空白除去: 「ア ル ファ」のような打ち間違いでも引けるようにする
 * - カタカナ→ひらがな: 読み（ひらがな）と用語名（カタカナ）を同一視する
 */
function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/gu, '')
    .replace(/[ァ-ヶ]/gu, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
}

/**
 * 検索対象は用語名・読み・別名・一言定義まで。本文を含めないのは、
 * 本文に一度出てきただけの語でヒットすると、関係の薄い用語が並んでしまうため。
 * 区切りの「|」は normalize で消えない文字なので、項目をまたいだ誤一致が起きない。
 */
function searchKey(term: GlossaryTerm): string {
  return normalize([term.term, term.reading ?? '', term.summary, ...(term.aliases ?? [])].join('|'))
}

export function searchGlossary(terms: readonly GlossaryTerm[], query: string): GlossaryTerm[] {
  const q = normalize(query)
  if (!q) return [...terms]
  return terms.filter((term) => searchKey(term).includes(q))
}

export type GlossaryGroup = { category: GlossaryCategory; terms: GlossaryTerm[] }

/**
 * 分類ごとにまとめる。分類の並びは `GLOSSARY_CATEGORIES`、分類の中は渡された順のまま。
 * 該当が 0 件の分類は落とす（検索結果で空の見出しだけが並ぶのを防ぐ）。
 */
export function groupByCategory(terms: readonly GlossaryTerm[]): GlossaryGroup[] {
  const groups: GlossaryGroup[] = []
  for (const category of GLOSSARY_CATEGORIES) {
    const matched = terms.filter((term) => term.category === category.id)
    if (matched.length > 0) groups.push({ category, terms: matched })
  }
  return groups
}

export function findTerm(terms: readonly GlossaryTerm[], id: string): GlossaryTerm | null {
  return terms.find((term) => term.id === id) ?? null
}

/** `related` の id を用語に解決する。データの直し忘れで落ちないよう、知らない id は黙って捨てる */
export function relatedTerms(terms: readonly GlossaryTerm[], term: GlossaryTerm): GlossaryTerm[] {
  return (term.related ?? []).flatMap((id) => {
    const found = findTerm(terms, id)
    return found ? [found] : []
  })
}

/** 候補カードのバッジ（UA値・C値・耐震等級・長期優良）から用語集へ飛ぶための対応表 */
export type GlossaryMetric = 'ua' | 'c' | 'seismic' | 'longTerm'

const METRIC_TERM_ID: Record<GlossaryMetric, string> = {
  ua: 'ua-value',
  c: 'c-value',
  seismic: 'seismic-grade',
  longTerm: 'long-term-housing',
}

export function termIdForMetric(metric: GlossaryMetric): string {
  return METRIC_TERM_ID[metric]
}
