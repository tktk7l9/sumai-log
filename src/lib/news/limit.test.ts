import { describe, expect, it } from 'vitest'

import { MAX_CANDIDATES_PER_FETCH, newestCandidates } from './limit'
import type { NewsCandidate } from './rss'

function item(publishedOn: string, n: number): NewsCandidate {
  return { url: `https://vendor.example/${n}`, title: `t${n}`, summary: null, publishedOn }
}

describe('newestCandidates', () => {
  it('returns up to max candidates unchanged, in page order', () => {
    const list = [item('2026-01-01', 1), item('2026-03-01', 2)]
    expect(newestCandidates(list, 2)).toBe(list)
  })
  it('keeps the newest max by date, wherever they are on the page (oldest-first lists too)', () => {
    const list = [item('2026-01-01', 1), item('2026-02-01', 2), item('2026-03-01', 3)]
    expect(newestCandidates(list, 2).map((c) => c.url)).toEqual([
      'https://vendor.example/3',
      'https://vendor.example/2',
    ])
  })
  it('keeps page order among equal dates', () => {
    const list = [
      item('2026-01-01', 1),
      item('2026-05-01', 2),
      item('2026-05-01', 3),
      item('2026-05-01', 4),
    ]
    expect(newestCandidates(list, 2).map((c) => c.url)).toEqual([
      'https://vendor.example/2',
      'https://vendor.example/3',
    ])
  })
  it('caps at MAX_CANDIDATES_PER_FETCH by default', () => {
    const list = Array.from({ length: MAX_CANDIDATES_PER_FETCH + 50 }, (_, i) =>
      item(`2026-01-${String((i % 28) + 1).padStart(2, '0')}`, i),
    )
    expect(newestCandidates(list)).toHaveLength(MAX_CANDIDATES_PER_FETCH)
  })
})
