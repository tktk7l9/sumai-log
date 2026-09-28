/**
 * Types and pure functions for a vendor's research memo and the build plan.
 *
 * There is one research memo (`vendors.research`, JSON) per vendor. Items lined up in the
 * comparison table (/candidates/compare) go into `facts` (short facts under fixed keys),
 * and reading material goes into `sections` (heading + body). References go into `sources`.
 * Real data (vendor names, research content) lives only in D1 (AGENTS.md).
 *
 * The build plan (setting `buildPlan`, JSON) has only 3 points: how many floors, how many
 * tsubo, and how much budget excluding the land. Primary information such as the location
 * of the land or the breakdown of funds is kept outside the app (design.md §1), so it is
 * not held here.
 */

import { UUID_SHAPE } from './ids'

/** Keys of the facts lined up in the comparison table. The order is the table's row order */
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
  /** Date of the research, 'YYYY-MM-DD' */
  researchedOn: string
  /** In one phrase (also shown under the heading in the comparison table) */
  summary: string
  facts: Partial<Record<ResearchFactKey, string>>
  sections: ResearchSection[]
  sources: ResearchSource[]
}

/** The build plan. budgetManYen is the total excluding the land (in units of 10,000 yen).
 * null when undecided */
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
 * Reads the JSON string of the setting `buildPlan`. Returns null when it is broken (the
 * settings screen shows "未設定" (Not set)). The validity of the numbers (min tsubo <= max
 * tsubo and so on) is checked by zod on the saving side, so only the shape is checked here.
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

/** The typical share of the main building work in the total cost (main building 70%,
 * ancillary work 20%, miscellaneous expenses 10%) */
export const BODY_COST_SHARE = 0.7

/** Estimate in units of 10,000 yen (body = price per tsubo x tsubo, total = body / 0.7) */
export type CostEstimate = {
  bodyMin: number
  bodyMax: number
  totalMin: number
  totalMax: number
}

/**
 * Computes the estimate (in units of 10,000 yen) of the body and the total from the price
 * per tsubo (10,000 yen per tsubo) and the tsubo of the plan. When only one price per tsubo
 * is given, that value is used for both ends. When neither is given, returns null (the
 * comparison table shows "—"). What the price per tsubo covers (main building only, or
 * including ancillary work) differs per company, so this is only a conversion for comparison.
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

/** Compares the estimated total range with the budget. null when the budget is not set or
 * there is no estimate */
export function judgeBudget(
  estimate: CostEstimate | null,
  budgetManYen: number | null,
): BudgetVerdict | null {
  if (!estimate || budgetManYen === null) return null
  if (estimate.totalMax <= budgetManYen) return 'within'
  if (estimate.totalMin > budgetManYen) return 'over'
  return 'tight'
}

/** Formats units of 10,000 yen as '4,200万円'. Stays in this unit even at 100 million yen or
 * more (house prices are read in this unit) */
export function formatManYen(value: number): string {
  return `${value.toLocaleString('ja-JP')}万円`
}

/** '3,000〜4,200万円'. Only one value when both are the same */
export function formatManYenRange(min: number, max: number): string {
  if (min === max) return formatManYen(min)
  return `${min.toLocaleString('ja-JP')}〜${formatManYen(max)}`
}

/** Formats the tsubo of the plan as '30〜35坪' */
export function formatTsuboRange(plan: Pick<BuildPlan, 'tsuboMin' | 'tsuboMax'>): string {
  if (plan.tsuboMin === plan.tsuboMax) return `${plan.tsuboMin}坪`
  return `${plan.tsuboMin}〜${plan.tsuboMax}坪`
}

/** Returns only the keys with a value from the research memo's facts, in row order
 * (RESEARCH_FACT_KEYS) */
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

/** An empty research memo (initial value of the form). The caller passes today as the date */
export function emptyResearch(researchedOn: string): VendorResearch {
  return { version: 1, researchedOn, summary: '', facts: {}, sections: [], sources: [] }
}

/**
 * Reads the ids of vendors hidden individually in the comparison table (`h` in the URL,
 * comma-separated). Broken values, non-UUID values and duplicates are dropped silently
 * (so that an old bookmark or a hand-typed URL does not crash).
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

/** The inverse of `parseHiddenIds`. undefined when empty (removes the whole parameter from
 * the URL) */
export function serializeHiddenIds(ids: readonly string[]): string | undefined {
  return ids.length > 0 ? ids.join(',') : undefined
}
