import { describe, expect, it } from 'vitest'

import {
  MAX_MONTHS,
  TOP_N,
  analyzeRecords,
  countTop,
  frequentWords,
  monthlyCounts,
  openNextActions,
  termHits,
  vendorContacts,
  type AnalysisInput,
  type AnalysisVideo,
  type AnalysisVisit,
} from './analysis'

const visit = (o: Partial<AnalysisVisit> = {}): AnalysisVisit => ({
  id: 'v1',
  visitedOn: '2026-09-13',
  attendees: 'both',
  vendorId: null,
  vendorName: null,
  placeName: null,
  propertyName: null,
  good: null,
  concerns: null,
  qa: null,
  nextActions: null,
  photoCount: 0,
  ...o,
})

const video = (o: Partial<AnalysisVideo> = {}): AnalysisVideo => ({
  id: 'w1',
  watchedOn: '2026-09-01',
  watchedBy: 'both',
  title: '動画',
  channel: null,
  tags: [],
  takeaways: null,
  vendorId: null,
  ...o,
})

const input = (o: Partial<AnalysisInput> = {}): AnalysisInput => ({
  visits: [],
  videos: [],
  vendors: [],
  events: [],
  comments: [],
  terms: [],
  today: '2026-09-23',
  ...o,
})

describe('countTop', () => {
  it('sorts by count descending, ties by name, top entries only', () => {
    expect(countTop(['い', 'あ', 'い', 'う', 'あ', 'い'])).toEqual([
      { name: 'い', count: 3 },
      { name: 'あ', count: 2 },
      { name: 'う', count: 1 },
    ])
    expect(countTop(['a', 'b', 'c'], 2)).toHaveLength(2)
  })
})

describe('monthlyCounts', () => {
  it('returns empty when there are no records', () => {
    expect(monthlyCounts([], [video({ watchedOn: null })])).toEqual([])
  })

  it('fills from the first to the last month, missing months with 0 (across years)', () => {
    const rows = monthlyCounts(
      [visit({ visitedOn: '2025-11-02' }), visit({ visitedOn: '2026-02-10' })],
      [video({ watchedOn: '2026-02-01' }), video({ watchedOn: '2026-02-20' })],
    )
    expect(rows.map((r) => r.month)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
    expect(rows[3]).toEqual({ month: '2026-02', visits: 1, videos: 2 })
    expect(rows[1]).toEqual({ month: '2025-12', visits: 0, videos: 0 })
  })

  it('keeps the newest MAX_MONTHS entries when the period is too long', () => {
    const rows = monthlyCounts(
      [visit({ visitedOn: '2020-01-01' }), visit({ visitedOn: '2026-09-01' })],
      [],
    )
    expect(rows).toHaveLength(MAX_MONTHS)
    expect(rows[rows.length - 1]!.month).toBe('2026-09')
  })
})

describe('vendorContacts', () => {
  it('counts visits, videos and past events, most contacts first; upcoming events separately', () => {
    const rows = vendorContacts(
      input({
        vendors: [
          { id: 'a', name: 'A 工務店', status: 'interested' },
          { id: 'b', name: 'B 建設', status: 'shortlisted' },
          { id: 'c', name: 'C ホーム', status: 'visited' },
        ],
        visits: [visit({ vendorId: 'b', visitedOn: '2026-09-13' })],
        videos: [
          video({ vendorId: 'b', watchedOn: '2026-09-20' }),
          video({ vendorId: 'b', watchedOn: null }),
          video({ vendorId: 'c', watchedOn: '2026-08-01' }),
        ],
        events: [
          { id: 'e1', startsAt: '2026-09-30T10:00:00+09:00', vendorId: 'b' },
          { id: 'e2', startsAt: '2026-09-02', vendorId: 'c' },
        ],
      }),
    )
    expect(rows.map((r) => r.name)).toEqual(['B 建設', 'C ホーム', 'A 工務店'])
    expect(rows[0]).toMatchObject({
      visits: 1,
      videos: 2,
      pastEvents: 0,
      upcomingEvents: 1,
      lastContact: '2026-09-20',
    })
    expect(rows[1]).toMatchObject({ pastEvents: 1, lastContact: '2026-09-02' })
    expect(rows[2]!.lastContact).toBeNull()
  })

  it('puts the one with the newer last contact first when contacts tie', () => {
    const rows = vendorContacts(
      input({
        vendors: [
          { id: 'a', name: 'A', status: 'interested' },
          { id: 'b', name: 'B', status: 'interested' },
        ],
        visits: [
          visit({ vendorId: 'a', visitedOn: '2026-01-01' }),
          visit({ vendorId: 'b', visitedOn: '2026-05-01' }),
        ],
      }),
    )
    expect(rows.map((r) => r.id)).toEqual(['b', 'a'])
    // When neither has any contact, the original order is kept
    const none = vendorContacts(
      input({
        vendors: [
          { id: 'x', name: 'X', status: 'interested' },
          { id: 'y', name: 'Y', status: 'interested' },
        ],
      }),
    )
    expect(none.map((r) => r.id)).toEqual(['x', 'y'])
  })
})

describe('termHits', () => {
  const terms = [
    { id: 'ua', term: 'UA値', aliases: ['UA', 'U'] },
    { id: 'c', term: 'C値', aliases: ['気密'] },
    { id: 'none', term: '耐震等級' },
  ]
  it('matches by term name and aliases (2+ characters), counting once per record', () => {
    const hits = termHits(
      ['ＵＡ値は0.46。UA値が大事', '気密測定をした', 'ua を比べる', 'Uの字'],
      terms,
    )
    expect(hits).toEqual([
      { id: 'ua', term: 'UA値', count: 2 },
      { id: 'c', term: 'C値', count: 1 },
    ])
  })

  it('returns up to the top TOP_N', () => {
    const many = Array.from({ length: TOP_N + 3 }, (_, i) => ({ id: `t${i}`, term: `用語${i}` }))
    expect(termHits([many.map((t) => t.term).join(' ')], many)).toHaveLength(TOP_N)
  })
})

describe('frequentWords', () => {
  it('counts words of 2+ characters with kanji, katakana or alphanumerics once per record', () => {
    const words = frequentWords([
      '断熱がよい。断熱の話。',
      '断熱と気密。キッチンが広い',
      'とても よかった 3 感じ',
    ])
    expect(words[0]).toEqual({ name: '断熱', count: 2 })
    const names = words.map((w) => w.name)
    expect(names).toContain('キッチン')
    expect(names).not.toContain('とても')
    expect(names).not.toContain('感じ')
    expect(names).not.toContain('3')
  })

  it('does not count words made only of digits', () => {
    expect(frequentWords(['2026 年'])).toEqual([])
  })
})

describe('openNextActions', () => {
  it('splits by line, strips markers, excludes done lines; newest visit first', () => {
    const actions = openNextActions([
      visit({
        id: 'old',
        visitedOn: '2026-08-01',
        placeName: '展示場',
        nextActions: '・見積を頼む',
      }),
      visit({
        id: 'new',
        visitedOn: '2026-09-13',
        vendorName: 'A 工務店',
        nextActions: '1. 資金計画を出す\n済 間取りを送る\n\n✓ 電話\n- \n□ 土地の資料',
      }),
      visit({ id: 'none', nextActions: null }),
    ])
    expect(actions.map((a) => [a.visitId, a.text, a.where])).toEqual([
      ['new', '資金計画を出す', 'A 工務店'],
      ['new', '土地の資料', 'A 工務店'],
      ['old', '見積を頼む', '展示場'],
    ])
  })
})

describe('analyzeRecords', () => {
  it('aggregates everything together (unfinished records, who, tags, channels)', () => {
    const a = analyzeRecords(
      input({
        visits: [
          visit({ id: 'v1', attendees: 'both', good: '断熱がよい', photoCount: 3 }),
          visit({ id: 'v2', visitedOn: '2026-08-01', attendees: 'wife', propertyName: '物件 X' }),
          visit({
            id: 'v3',
            visitedOn: '2026-07-01',
            attendees: 'husband',
            concerns: '価格が高い',
          }),
        ],
        videos: [
          video({ id: 'w1', tags: ['断熱', '資金'], channel: 'ch1', takeaways: 'UA値を見る' }),
          video({ id: 'w2', watchedBy: 'husband', tags: ['断熱'], channel: ' ', watchedOn: null }),
        ],
        comments: [{ targetType: 'visit', targetId: 'v1', body: 'UA値を聞く' }],
        terms: [{ id: 'ua', term: 'UA値' }],
        vendors: [{ id: 'a', name: 'A', status: 'interested' }],
      }),
    )
    expect(a.summary).toEqual({
      visits: 3,
      photos: 3,
      videos: 2,
      vendors: 1,
      comments: 1,
      firstDate: '2026-07-01',
      lastDate: '2026-09-13',
    })
    expect(a.who.visits).toEqual({ both: 1, husband: 1, wife: 1 })
    expect(a.who.videos).toEqual({ both: 1, husband: 1, wife: 0 })
    expect(a.tags[0]).toEqual({ name: '断熱', count: 2 })
    expect(a.channels).toEqual([{ name: 'ch1', count: 1 }])
    expect(a.terms).toEqual([{ id: 'ua', term: 'UA値', count: 2 }])
    expect(a.goodWords[0]!.name).toBe('断熱')
    expect(a.concernWords.map((w) => w.name)).toContain('価格')
    expect(a.gaps.visitsWithoutNotes).toEqual([{ id: 'v2', date: '2026-08-01', label: '物件 X' }])
    expect(a.gaps.videosWithoutTakeaways).toEqual([{ id: 'w2', date: null, label: '動画' }])
    expect(a.gaps.visitsWithoutPhotos.map((g) => g.id)).toEqual(['v2', 'v3'])
    expect(a.gaps.visitsWithoutPhotos[1]!.label).toBe('（場所なし）')
  })

  it('returns an empty aggregate when there is nothing', () => {
    const a = analyzeRecords(input())
    expect(a.summary.firstDate).toBeNull()
    expect(a.summary.lastDate).toBeNull()
    expect(a.monthly).toEqual([])
    expect(a.nextActions).toEqual([])
  })
})
