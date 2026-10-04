import { describe, expect, it } from 'vitest'

import { sqlValue, workUpsertSql } from './sql'
import { EMPTY_FIELDS, type ParsedWork } from './types'

const work: ParsedWork = {
  ...EMPTY_FIELDS,
  title: "O'Test\nの家",
  sourceUrl: 'https://example.com/works/p1/',
  site: 'siteC',
  vendorId: null,
  sortOrder: 3,
  points: ['UA値0.31', "it's"],
  uaValue: 0.31,
  floorAreaTsubo: 30.25,
  youtubeVideoId: 'abcdefghijk',
}

describe('sqlValue', () => {
  it('quotes strings, doubles single quotes and folds line breaks', () => {
    expect(sqlValue("a'b\r\nc")).toBe("'a''b c'")
  })

  it('writes numbers and null bare', () => {
    expect(sqlValue(0.31)).toBe('0.31')
    expect(sqlValue(null)).toBe('NULL')
  })
})

describe('workUpsertSql', () => {
  const sql = workUpsertSql(work, '00000000-0000-4000-8000-000000000009')

  it('is a single line ending with a semicolon', () => {
    expect(sql).not.toMatch(/[\r\n]/)
    expect(sql.endsWith(';')).toBe(true)
  })

  it('inserts the values with the points as JSON', () => {
    expect(sql).toContain("'O''Test の家'")
    expect(sql).toContain(`'["UA値0.31","it''s"]'`)
    expect(sql).toContain('ON CONFLICT(source_url) DO UPDATE SET')
  })

  it('never updates id, created_at, the watched columns or video_source', () => {
    const update = sql.slice(sql.indexOf('DO UPDATE SET') + 'DO UPDATE SET'.length)
    const updated = update.match(/(?:^| )(\w+) = /g)?.map((m) => m.trim().split(' ')[0])
    for (const column of ['id', 'created_at', 'watched_at', 'watched_by', 'video_source']) {
      expect(updated).not.toContain(column)
    }
    expect(updated).toContain('title')
  })

  it('keeps a manual video, and a title-matched one while the site has none, on conflict', () => {
    expect(sql).toContain(
      "youtube_video_id = CASE WHEN works.video_source = 'manual' OR (works.video_source = 'title' AND excluded.youtube_video_id IS NULL) THEN works.youtube_video_id ELSE excluded.youtube_video_id END",
    )
  })
})
