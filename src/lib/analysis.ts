/**
 * Aggregation for the analysis of records (/analysis). Pure functions that take visits,
 * video memos, vendors, events and comments, and count the totals, the periods, the
 * contacts per vendor, frequent glossary terms and words, unfinished next actions, and
 * unfinished records.
 * Nothing is sent outside (it only counts inside the app).
 */

import { parseActions } from './nextActions'

export type Who = 'both' | 'husband' | 'wife'

export type AnalysisVisit = {
  id: string
  visitedOn: string
  attendees: Who
  vendorId: string | null
  vendorName: string | null
  placeName: string | null
  propertyName: string | null
  good: string | null
  concerns: string | null
  qa: string | null
  nextActions: string | null
  photoCount: number
}

export type AnalysisVideo = {
  id: string
  watchedOn: string | null
  watchedBy: Who
  title: string
  channel: string | null
  tags: string[]
  takeaways: string | null
  vendorId: string | null
}

export type AnalysisVendor = { id: string; name: string; status: string }
export type AnalysisEvent = { id: string; startsAt: string; vendorId: string | null }
export type AnalysisComment = { targetType: string; targetId: string; body: string }
export type AnalysisTerm = { id: string; term: string; aliases?: string[] }

export type AnalysisInput = {
  visits: AnalysisVisit[]
  videos: AnalysisVideo[]
  vendors: AnalysisVendor[]
  events: AnalysisEvent[]
  comments: AnalysisComment[]
  terms: readonly AnalysisTerm[]
  /** Today (YYYY-MM-DD). Separates "upcoming" and "done" events */
  today: string
}

export type Count = { name: string; count: number }
export type MonthRow = { month: string; visits: number; videos: number }
export type VendorRow = {
  id: string
  name: string
  status: string
  visits: number
  videos: number
  pastEvents: number
  upcomingEvents: number
  /** The newest date among visits, videos and past events */
  lastContact: string | null
}
export type TermHit = { id: string; term: string; count: number }
export type NextAction = {
  visitId: string
  visitedOn: string
  where: string
  text: string
}
export type Gap = { id: string; date: string | null; label: string }

export type Analysis = {
  summary: {
    visits: number
    photos: number
    videos: number
    vendors: number
    comments: number
    firstDate: string | null
    lastDate: string | null
  }
  monthly: MonthRow[]
  vendors: VendorRow[]
  terms: TermHit[]
  goodWords: Count[]
  concernWords: Count[]
  tags: Count[]
  channels: Count[]
  who: { visits: Record<Who, number>; videos: Record<Who, number> }
  nextActions: NextAction[]
  gaps: { visitsWithoutNotes: Gap[]; videosWithoutTakeaways: Gap[]; visitsWithoutPhotos: Gap[] }
}

/** The list of months has at most this many entries (cut from the oldest) */
export const MAX_MONTHS = 24
/** Number of frequent words, terms, tags etc. to show */
export const TOP_N = 10

function filled(v: string | null | undefined): v is string {
  return typeof v === 'string' && v.trim() !== ''
}

/** Sorts by count descending (ties by name) and returns only the top entries */
export function countTop(names: Iterable<string>, limit: number = TOP_N): Count[] {
  const m = new Map<string, number>()
  for (const n of names) m.set(n, (m.get(n) ?? 0) + 1)
  return [...m]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ja'))
    .slice(0, limit)
}

/** From YYYY-MM to the next month */
function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

/** Lists from the month of the first record to the month of the last record, filling
 * months without records with 0 (at most MAX_MONTHS) */
export function monthlyCounts(visits: AnalysisVisit[], videos: AnalysisVideo[]): MonthRow[] {
  const v = visits.map((x) => x.visitedOn.slice(0, 7))
  const w = videos.flatMap((x) => (x.watchedOn ? [x.watchedOn.slice(0, 7)] : []))
  const all = [...v, ...w].sort()
  if (all.length === 0) return []
  const rows: MonthRow[] = []
  for (let m = all[0]!; m <= all[all.length - 1]!; m = nextMonth(m)) {
    rows.push({
      month: m,
      visits: v.filter((x) => x === m).length,
      videos: w.filter((x) => x === m).length,
    })
  }
  return rows.slice(-MAX_MONTHS)
}

/** Contacts per vendor. Most contacts first; ties by the newer last contact */
export function vendorContacts(input: AnalysisInput): VendorRow[] {
  return input.vendors
    .map((vendor) => {
      const visits = input.visits.filter((x) => x.vendorId === vendor.id)
      const videos = input.videos.filter((x) => x.vendorId === vendor.id)
      const events = input.events.filter((x) => x.vendorId === vendor.id)
      const past = events.filter((e) => e.startsAt.slice(0, 10) < input.today)
      const dates = [
        ...visits.map((x) => x.visitedOn),
        ...videos.flatMap((x) => (x.watchedOn ? [x.watchedOn] : [])),
        ...past.map((e) => e.startsAt.slice(0, 10)),
      ].sort()
      return {
        id: vendor.id,
        name: vendor.name,
        status: vendor.status,
        visits: visits.length,
        videos: videos.length,
        pastEvents: past.length,
        upcomingEvents: events.length - past.length,
        lastContact: dates.length > 0 ? dates[dates.length - 1]! : null,
      }
    })
    .sort(
      (a, b) =>
        b.visits + b.videos + b.pastEvents - (a.visits + a.videos + a.pastEvents) ||
        (b.lastContact ?? '').localeCompare(a.lastContact ?? ''),
    )
}

/** Unifies the notation for matching (full-width alphanumerics -> half-width, letters
 * lowercased) */
function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase()
}

/**
 * How many times glossary terms (term name, aliases) appear in the records. However many
 * times one appears inside 1 record, it counts as 1 (so that a record written at length
 * does not count more). Aliases of 1 character cause many false matches, so they are not
 * used
 */
export function termHits(texts: string[], terms: readonly AnalysisTerm[]): TermHit[] {
  const docs = texts.map(normalize)
  return terms
    .map((t) => {
      const names = [t.term, ...(t.aliases ?? [])].map(normalize).filter((n) => n.length >= 2)
      const count = docs.filter((d) => names.some((n) => d.includes(n))).length
      return { id: t.id, term: t.term, count }
    })
    .filter((h) => h.count > 0)
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term, 'ja'))
    .slice(0, TOP_N)
}

/** Words that are not counted (they appear in every record but do not express the content) */
const STOP_WORDS = new Set([
  '感じ',
  '部分',
  '場合',
  '必要',
  '自分',
  '確認',
  '今回',
  '全体',
  '以上',
  '以下',
  '一番',
  '気持',
])

/**
 * Picks frequent words from text. Splits with Intl.Segmenter (Japanese word segmentation)
 * and counts only words of 2 or more characters that contain kanji, katakana or
 * alphanumerics (words of hiragana only are mostly particles and set phrases, so they are
 * excluded).
 * Inside 1 record the same word counts once
 */
export function frequentWords(texts: string[], limit: number = TOP_N): Count[] {
  const segmenter = new Intl.Segmenter('ja', { granularity: 'word' })
  const words: string[] = []
  for (const text of texts) {
    const seen = new Set<string>()
    for (const s of segmenter.segment(text.normalize('NFKC'))) {
      const w = s.segment.trim()
      if (!s.isWordLike || [...w].length < 2) continue
      if (!/[\p{Script=Han}\p{Script=Katakana}A-Za-z0-9]/u.test(w)) continue
      if (/^[0-9]+$/.test(w) || STOP_WORDS.has(w)) continue
      seen.add(w)
    }
    words.push(...seen)
  }
  return countTop(words, limit)
}

/** How the place of a visit is called (vendor > property > place) */
function visitWhere(v: AnalysisVisit): string {
  return v.vendorName ?? v.propertyName ?? v.placeName ?? '（場所なし）'
}

/**
 * Splits "次にやること" (Next actions) of a visit record into single lines. Leading
 * "・", "-", "□", "1." etc. are stripped, and lines that start with "済" (done), "✓" or
 * "[x]" are finished and not counted. Listed from the newest visit
 */
export function openNextActions(visits: AnalysisVisit[]): NextAction[] {
  return [...visits]
    .sort((a, b) => b.visitedOn.localeCompare(a.visitedOn))
    .flatMap((v) =>
      parseActions(v.nextActions)
        .filter((a) => !a.done)
        .map((a) => ({
          visitId: v.id,
          visitedOn: v.visitedOn,
          where: visitWhere(v),
          text: a.text,
        })),
    )
}

/** Analyzes the records together */
export function analyzeRecords(input: AnalysisInput): Analysis {
  const { visits, videos, comments } = input
  const dates = [
    ...visits.map((v) => v.visitedOn),
    ...videos.flatMap((v) => (v.watchedOn ? [v.watchedOn] : [])),
  ].sort()
  const zero = (): Record<Who, number> => ({ both: 0, husband: 0, wife: 0 })
  const who = { visits: zero(), videos: zero() }
  for (const v of visits) who.visits[v.attendees] += 1
  for (const v of videos) who.videos[v.watchedBy] += 1

  const goodTexts = visits.map((v) => v.good).filter(filled)
  const concernTexts = visits.map((v) => v.concerns).filter(filled)
  const allTexts = [
    ...visits.map((v) => [v.good, v.concerns, v.qa, v.nextActions].filter(filled).join('\n')),
    ...videos.map((v) => [v.title, v.takeaways, ...v.tags].filter(filled).join('\n')),
    ...comments.map((c) => c.body),
  ].filter((t) => t !== '')

  return {
    summary: {
      visits: visits.length,
      photos: visits.reduce((a, v) => a + v.photoCount, 0),
      videos: videos.length,
      vendors: input.vendors.length,
      comments: comments.length,
      firstDate: dates[0] ?? null,
      lastDate: dates[dates.length - 1] ?? null,
    },
    monthly: monthlyCounts(visits, videos),
    vendors: vendorContacts(input),
    terms: termHits(allTexts, input.terms),
    goodWords: frequentWords(goodTexts),
    concernWords: frequentWords(concernTexts),
    tags: countTop(videos.flatMap((v) => v.tags)),
    channels: countTop(videos.flatMap((v) => (filled(v.channel) ? [v.channel] : []))),
    who,
    nextActions: openNextActions(visits),
    gaps: {
      visitsWithoutNotes: visits
        .filter((v) => ![v.good, v.concerns, v.qa, v.nextActions].some(filled))
        .map((v) => ({ id: v.id, date: v.visitedOn, label: visitWhere(v) })),
      videosWithoutTakeaways: videos
        .filter((v) => !filled(v.takeaways))
        .map((v) => ({ id: v.id, date: v.watchedOn, label: v.title })),
      visitsWithoutPhotos: visits
        .filter((v) => v.photoCount === 0)
        .map((v) => ({ id: v.id, date: v.visitedOn, label: visitWhere(v) })),
    },
  }
}
