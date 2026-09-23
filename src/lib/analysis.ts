/**
 * 記録の分析（/analysis）の集計。見学・動画メモ・業者・予定・コメントを受け取り、件数・時期・
 * 業者ごとの接点・よく出る用語や言葉・未完了の次アクション・書きかけの記録を数える純粋関数。
 * 外部には何も送らない（アプリの中で数えるだけ）。
 */

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
  /** 今日（YYYY-MM-DD）。予定の「これから」と「済み」を分ける */
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
  /** 見学・動画・済んだ予定のうち最も新しい日付 */
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

/** 月の並びは最大この数まで（古い方から切る） */
export const MAX_MONTHS = 24
/** よく出る言葉・用語・タグなどの表示件数 */
export const TOP_N = 10

function filled(v: string | null | undefined): v is string {
  return typeof v === 'string' && v.trim() !== ''
}

/** 多い順（同数は名前順）に並べて上位だけ返す */
export function countTop(names: Iterable<string>, limit: number = TOP_N): Count[] {
  const m = new Map<string, number>()
  for (const n of names) m.set(n, (m.get(n) ?? 0) + 1)
  return [...m]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ja'))
    .slice(0, limit)
}

/** YYYY-MM から次の月へ */
function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

/** 最初の記録の月から最後の記録の月まで、記録の無い月も 0 で埋めて並べる（最大 MAX_MONTHS） */
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

/** 業者ごとの接点。接点の多い順、同数は最後の接点が新しい順 */
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

/** 照合用に表記をそろえる（全角英数→半角、英字は小文字） */
function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase()
}

/**
 * 用語集の用語（用語名・別名）が記録に出てくる回数。1 件の記録の中で何度出ても 1 と数える
 * （長く書いた記録ほど多く数えないように）。1 文字の別名は誤一致が多いので使わない
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

/** 数えない言葉（どの記録にも出るが中身を表さない） */
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
 * 文章からよく出る言葉を拾う。Intl.Segmenter（日本語の単語区切り）で分け、漢字・カタカナ・
 * 英数を含む 2 文字以上の語だけを数える（ひらがなだけの語は助詞や言い回しが多いので外す）。
 * 1 件の記録の中では同じ語を 1 回と数える
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

/** 見学の場所の呼び名（業者 > 物件 > 場所） */
function visitWhere(v: AnalysisVisit): string {
  return v.vendorName ?? v.propertyName ?? v.placeName ?? '（場所なし）'
}

/**
 * 見学記録の「次にやること」を 1 行ずつに分ける。行頭の「・」「-」「□」「1.」などは外し、
 * 「済」「✓」「[x]」で始まる行は終わったものとして数えない。新しい見学から順に並べる
 */
export function openNextActions(visits: AnalysisVisit[]): NextAction[] {
  const done = /^(済|完了|✓|✔|\[x\])/iu
  return [...visits]
    .sort((a, b) => b.visitedOn.localeCompare(a.visitedOn))
    .flatMap((v) =>
      (v.nextActions ?? '')
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line !== '' && !done.test(line))
        .map((line) => ({
          visitId: v.id,
          visitedOn: v.visitedOn,
          where: visitWhere(v),
          text: line.replace(/^([・\-*□☐]|\d+[.)．])\s*/u, ''),
        }))
        .filter((a) => a.text !== ''),
    )
}

/** 記録をまとめて分析する */
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
