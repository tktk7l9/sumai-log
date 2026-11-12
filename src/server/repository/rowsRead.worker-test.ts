import { env } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/d1'
import { beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../../db/schema'
import { listChannelVideoRows } from './channelVideos'
import { recentPhotos } from './feed'
import { listNews } from './news'
import { listPlacesWithLinks } from './places'
import { hasVisits } from './visits'
import { reset } from './test-helpers'

/**
 * How many rows D1 reads for the list queries that run on every open of a page.
 *
 * The free plan allows 5 million rows read a day, and the app went over it once through a
 * correlated subquery on a column without an index (2026-10-05: 330,000 rows for one open of
 * the videos tab). A query that scans a table for every row of another, or sorts a whole
 * table to return its newest 5, costs little while the tables are small and is found only
 * when the limit is hit. These tests read D1's own `meta.rows_read` on tables of a realistic
 * size, so a list that loses its index fails here instead.
 */

type Reading = { rowsRead: number }
let readings: Reading[] = []

/** D1 reports rows_read on `all()` / `run()`; Drizzle uses `raw()` for joins, which does not */
function recordStatement(real: D1PreparedStatement, text: string): D1PreparedStatement {
  return new Proxy(real, {
    get(target, prop) {
      if (prop === 'bind')
        return (...args: unknown[]) => recordStatement(target.bind(...args), text)
      if (prop === 'all' || prop === 'run')
        return async () => {
          const result = await target[prop]()
          readings.push({ rowsRead: result.meta.rows_read })
          return result
        }
      if (prop === 'raw')
        return async (options?: { columnNames?: boolean }) => {
          // The same statement once more through all(), only to learn what it read
          const measured = await target.all()
          readings.push({ rowsRead: measured.meta.rows_read })
          return options ? target.raw(options as { columnNames: true }) : target.raw()
        }
      const value = Reflect.get(target, prop)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

const recordingD1 = new Proxy(env.DB, {
  get(target, prop) {
    if (prop === 'prepare') return (query: string) => recordStatement(target.prepare(query), query)
    const value = Reflect.get(target, prop)
    return typeof value === 'function' ? value.bind(target) : value
  },
})
const db = drizzle(recordingD1, { schema })

async function rowsReadBy(run: () => Promise<unknown>): Promise<number> {
  readings = []
  await run()
  return readings.reduce((sum, r) => sum + r.rowsRead, 0)
}

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const quote = (s: string) => `'${s.replace(/'/g, "''")}'`
const two = (n: number) => String(n).padStart(2, '0')

const PLACES = 30
const VISITS = 30
const PHOTOS = 200
const NEWS = 400
/** One large channel (the list of one channel must not read the others) and a second one */
const CHANNEL_A = 'UCaaaaaaaaaaaaaaaaaaaaaa'
const CHANNEL_B = 'UCbbbbbbbbbbbbbbbbbbbbbb'
const VIDEOS_A = 600
const VIDEOS_B = 400

async function seed() {
  const statements: string[] = []
  for (let v = 1; v <= 5; v++)
    statements.push(
      `INSERT INTO vendors (id,name,created_by) VALUES (${quote(uid(v))},${quote(`業者${v}`)},'owner@example.com')`,
    )
  for (let p = 1; p <= PLACES; p++)
    statements.push(
      `INSERT INTO places (id,name,vendor_id,created_by) VALUES (${quote(uid(1000 + p))},${quote(`場所${two(p)}`)},${quote(uid((p % 5) + 1))},'owner@example.com')`,
    )
  for (let v = 1; v <= VISITS; v++)
    statements.push(
      `INSERT INTO visits (id,place_id,visited_on,created_by) VALUES (${quote(uid(2000 + v))},${quote(uid(1000 + v))},${quote(`2026-${two((v % 12) + 1)}-11`)},'owner@example.com')`,
    )
  for (let p = 1; p <= PHOTOS; p++)
    statements.push(
      `INSERT INTO photos (id,visit_id,display_key,thumb_key,width,height,sort_order,created_by,created_at) VALUES (${quote(uid(3000 + p))},${quote(uid(2000 + (p % VISITS) + 1))},'photos/a/b-display.jpg','photos/a/b-thumb.jpg',10,10,${p},'owner@example.com',${quote(`2026-10-${two((p % 27) + 1)} 0${p % 10}:00:00`)})`,
    )
  for (let i = 1; i <= NEWS; i++)
    statements.push(
      `INSERT INTO vendor_news (id,vendor_id,url,title,published_on) VALUES (${quote(uid(4000 + i))},${quote(uid((i % 5) + 1))},${quote(`https://news.example.com/n/${i}`)},${quote(`お知らせ${i}`)},${quote(`2026-${two((i % 12) + 1)}-${two((i % 27) + 1)}`)})`,
    )
  let n = 0
  for (const [channelId, channel, total] of [
    [CHANNEL_A, 'チャンネル甲', VIDEOS_A],
    [CHANNEL_B, 'チャンネル乙', VIDEOS_B],
  ] as const)
    for (let i = 0; i < total; i++) {
      n++
      statements.push(
        `INSERT INTO channel_videos (id,video_id,channel_id,channel,kind,title,sort_order) VALUES (${quote(uid(5000 + n))},${quote(`v${String(n).padStart(10, '0')}`)},${quote(channelId)},${quote(channel)},${quote(i % 5 === 0 ? 'short' : 'video')},${quote(`動画${n}`)},${i})`,
      )
    }
  for (let i = 0; i < statements.length; i += 100)
    await env.DB.batch(statements.slice(i, i + 100).map((s) => env.DB.prepare(s)))
}

describe('rows read by the list queries (tables of a realistic size)', () => {
  beforeAll(async () => {
    await reset()
    await seed()
  })

  it('the places list counts the visits of each place through an index, not by scanning every visit per place', async () => {
    // Without an index on visits.place_id: PLACES × VISITS = 900 for the subquery alone
    const read = await rowsReadBy(() => listPlacesWithLinks(db))
    expect(read).toBeLessThan(PLACES * 6)
  })

  it('asking whether a place has visits reads only that place', async () => {
    const read = await rowsReadBy(() => hasVisits(db, uid(1001)))
    expect(read).toBeLessThan(5)
  })

  it('the newest 5 news items are read from the index, not by sorting the whole table', async () => {
    const read = await rowsReadBy(() => listNews(db, { limit: 5, offset: 0 }))
    expect(read).toBeLessThan(30)
  })

  it('one month of news reads about that month', async () => {
    const read = await rowsReadBy(() =>
      listNews(db, { from: '2026-11-01', to: '2026-11-30', limit: 200, offset: 0 }),
    )
    // NEWS / 12 items fall in the month; each also reads its vendor
    expect(read).toBeLessThan((NEWS / 12) * 3)
  })

  it('the newest 10 photos of the home feed are read from the index', async () => {
    const read = await rowsReadBy(() => recentPhotos(db, 10))
    expect(read).toBeLessThan(60)
  })

  it('one page of one channel reads about one page', async () => {
    const rows = await listChannelVideoRows(db, { channelId: CHANNEL_A, kind: 'video', limit: 30 })
    expect(rows).toHaveLength(30)
    // Newest first inside the channel, as before
    expect(rows.map((r) => r.sortOrder)).toEqual(
      [...rows.map((r) => r.sortOrder)].sort((a, b) => a - b),
    )
    expect(rows.every((r) => r.channelId === CHANNEL_A && r.kind === 'video')).toBe(true)

    const read = await rowsReadBy(() =>
      listChannelVideoRows(db, { channelId: CHANNEL_A, kind: 'video', limit: 30 }),
    )
    // 30 videos plus the shorts skipped between them, the index and the table for each, and
    // the work and memo lookups of the page: 159 measured, against 1,202 before (the whole
    // channel was read and sorted)
    expect(read).toBeLessThan(250)
  })
})
