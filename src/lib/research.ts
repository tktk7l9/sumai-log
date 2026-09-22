/**
 * 業者の「調査メモ」と「建築計画」の型・純粋関数。
 *
 * 調査メモ（`vendors.research`、JSON）は業者ごとに 1 つ。比較表（/candidates/compare）に
 * 並べる項目は `facts`（決まったキーの短い事実）に、読み物は `sections`（見出し＋本文）に
 * 分ける。出典は `sources`。実データ（業者名・調査内容）は D1 にだけ置く（AGENTS.md）。
 *
 * 建築計画（設定 `buildPlan`、JSON）は「何階建てを何坪、土地以外の予算いくらで」の 3 点だけ。
 * 土地の所在や資金の内訳など一次情報はアプリの外に置く（design.md §1）ので持たない。
 */

import { UUID_SHAPE } from './ids'

/** 比較表に並べる事実のキー。並びは比較表の行順 */
export const RESEARCH_FACT_KEYS = [
  'founded',
  'scale',
  'insulation',
  'airtight',
  'warranty',
  'standardSpec',
  'design',
  'hiraya',
  'areaNote',
  'priceNote',
] as const
export type ResearchFactKey = (typeof RESEARCH_FACT_KEYS)[number]

export const RESEARCH_FACT_LABEL: Record<ResearchFactKey, string> = {
  founded: '創業・拠点',
  scale: '規模',
  insulation: '断熱',
  airtight: '気密',
  warranty: '保証・アフター',
  standardSpec: '標準仕様',
  design: '設計・デザイン',
  hiraya: '平屋',
  areaNote: '施工エリアと建築予定地',
  priceNote: '価格の考え方',
}

export type ResearchSection = { title: string; body: string }
export type ResearchSource = { label: string; url: string }

export type VendorResearch = {
  version: 1
  /** 調べた日 'YYYY-MM-DD' */
  researchedOn: string
  /** 一言で（比較表の見出し下にも出す） */
  summary: string
  facts: Partial<Record<ResearchFactKey, string>>
  sections: ResearchSection[]
  sources: ResearchSource[]
}

/** 建築計画。budgetManYen は土地以外の総額（万円）。未定なら null */
export type BuildPlan = {
  floors: 1 | 2
  tsuboMin: number
  tsuboMax: number
  budgetManYen: number | null
}

export const FLOORS_LABEL: Record<BuildPlan['floors'], string> = { 1: '平屋', 2: '2 階建て' }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * 設定 `buildPlan` の JSON 文字列を読む。壊れていれば null（設定画面が「未設定」を出す）。
 * 数値の妥当性（坪数の下限≦上限など）は保存側の zod が見るので、ここでは形だけ確かめる。
 */
export function parseBuildPlan(raw: string | null | undefined): BuildPlan | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null
  const { floors, tsuboMin, tsuboMax, budgetManYen } = parsed
  if (floors !== 1 && floors !== 2) return null
  if (typeof tsuboMin !== 'number' || typeof tsuboMax !== 'number') return null
  if (budgetManYen !== null && typeof budgetManYen !== 'number') return null
  return { floors, tsuboMin, tsuboMax, budgetManYen }
}

/** 本体工事費が総額に占める一般的な割合（本体 7 割・付帯 2 割・諸費用 1 割） */
export const BODY_COST_SHARE = 0.7

/** 万円の目安（本体＝坪単価×坪数、総額＝本体÷0.7） */
export type CostEstimate = {
  bodyMin: number
  bodyMax: number
  totalMin: number
  totalMax: number
}

/**
 * 坪単価（万円/坪）と計画の坪数から、本体と総額の目安（万円）を出す。坪単価が片方しか
 * 無ければその値を両端に使う。両方無ければ null（比較表は「—」を出す）。
 * 坪単価の中身（本体のみか付帯込みか）は会社ごとに違うので、あくまで比較のための換算。
 */
export function estimateCost(
  vendor: { pricePerTsuboMin: number | null; pricePerTsuboMax: number | null },
  plan: Pick<BuildPlan, 'tsuboMin' | 'tsuboMax'>,
): CostEstimate | null {
  const min = vendor.pricePerTsuboMin ?? vendor.pricePerTsuboMax
  const max = vendor.pricePerTsuboMax ?? vendor.pricePerTsuboMin
  if (min === null || max === null) return null
  const bodyMin = Math.round(min * plan.tsuboMin)
  const bodyMax = Math.round(max * plan.tsuboMax)
  return {
    bodyMin,
    bodyMax,
    totalMin: Math.round(bodyMin / BODY_COST_SHARE),
    totalMax: Math.round(bodyMax / BODY_COST_SHARE),
  }
}

export type BudgetVerdict = 'within' | 'tight' | 'over'
export const BUDGET_VERDICT_LABEL: Record<BudgetVerdict, string> = {
  within: '予算内',
  tight: '上振れ注意',
  over: '予算超過',
}

/** 総額の目安レンジを予算と比べる。予算未設定・目安なしなら null */
export function judgeBudget(
  estimate: CostEstimate | null,
  budgetManYen: number | null,
): BudgetVerdict | null {
  if (!estimate || budgetManYen === null) return null
  if (estimate.totalMax <= budgetManYen) return 'within'
  if (estimate.totalMin > budgetManYen) return 'over'
  return 'tight'
}

/** 万円を '4,200万円' に。1 億以上でも万円のままにする（家の値段はこの単位で読む） */
export function formatManYen(value: number): string {
  return `${value.toLocaleString('ja-JP')}万円`
}

/** '3,000〜4,200万円'。同じ値なら 1 つだけ */
export function formatManYenRange(min: number, max: number): string {
  if (min === max) return formatManYen(min)
  return `${min.toLocaleString('ja-JP')}〜${formatManYen(max)}`
}

/** 計画の坪数を '30〜35坪' に */
export function formatTsuboRange(plan: Pick<BuildPlan, 'tsuboMin' | 'tsuboMax'>): string {
  if (plan.tsuboMin === plan.tsuboMax) return `${plan.tsuboMin}坪`
  return `${plan.tsuboMin}〜${plan.tsuboMax}坪`
}

/** 調査メモの facts のうち、値のあるキーだけを行順（RESEARCH_FACT_KEYS）で返す */
export function presentFacts(
  research: Pick<VendorResearch, 'facts'> | null,
): { key: ResearchFactKey; label: string; value: string }[] {
  if (!research) return []
  const out: { key: ResearchFactKey; label: string; value: string }[] = []
  for (const key of RESEARCH_FACT_KEYS) {
    const value = research.facts[key]
    if (value) out.push({ key, label: RESEARCH_FACT_LABEL[key], value })
  }
  return out
}

/** 空の調査メモ（フォームの初期値）。日付は呼び出し側が「今日」を渡す */
export function emptyResearch(researchedOn: string): VendorResearch {
  return { version: 1, researchedOn, summary: '', facts: {}, sections: [], sources: [] }
}

/**
 * 比較表で個別に隠した業者の id（URL の `h`、カンマ区切り）を読む。壊れた値・UUID で
 * ない値・重複は黙って捨てる（古いブックマークや手打ちで落ちないように）。
 */
export function parseHiddenIds(raw: string | null | undefined): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  for (const part of raw.split(',')) {
    const id = part.trim()
    if (id && UUID_SHAPE.test(id)) seen.add(id)
  }
  return [...seen]
}

/** `parseHiddenIds` の逆。空なら undefined（URL からパラメータごと消す） */
export function serializeHiddenIds(ids: readonly string[]): string | undefined {
  return ids.length > 0 ? ids.join(',') : undefined
}
