import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { vendorNews, vendors } from '../db/schema'
import { fetchAllVendorNews, fetchVendorNews, type NewsSourceVendor } from './newsFetcher'
import { upsertVendor } from './repository/candidates'
import { actor, db, reset } from './repository/test-helpers'

beforeEach(reset)

async function makeVendor(name: string, overrides: Record<string, unknown> = {}) {
  return upsertVendor(db, { name, kind: 'koumuten', serviceAreas: [], ...overrides }, actor)
}

const RSS_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <item>
    <title>【完成見学会】テストの家</title>
    <link>https://news.example.com/topics/1</link>
    <pubDate>Sat, 12 Sep 2026 09:00:00 +0900</pubDate>
    <description>9月12日(土)開催です。</description>
  </item>
  <item>
    <title>資材価格のお知らせ</title>
    <link>https://news.example.com/topics/2</link>
    <pubDate>Sun, 13 Sep 2026 09:00:00 +0900</pubDate>
  </item>
</channel></rss>`

// parseHtmlList strips the list date (September 10, 2026) from the title and uses it as
// publishedOn, so unless the title itself also contains a date, no date is left for
// extractEvent to pick up (html-list needs a publishedOn date in every li, so this shape
// can also occur in real operation).
const HTML_LIST = `
<ul>
  <li>2026年9月10日 <a href="./news/1.php">構造見学会 9月10日(土)開催</a></li>
</ul>`

/** Replacement for fetchImpl. Never hits a real vendor site. */
function fakeFetch(build: (url: string) => Response): typeof fetch {
  return (async (url: string | URL) => build(String(url))) as typeof fetch
}

describe('fetchVendorNews', () => {
  it('RSS: adds candidates on success, and rows judged to be events get event_*', async () => {
    const vendorId = await makeVendor('テスト工務店', {
      newsUrl: 'https://news.example.com/feed/',
      newsSource: 'rss',
    })
    const vendor: NewsSourceVendor = {
      id: vendorId,
      name: 'テスト工務店',
      newsUrl: 'https://news.example.com/feed/',
      newsSource: 'rss',
    }

    const result = await fetchVendorNews(
      db,
      vendor,
      fakeFetch(() => new Response(RSS_FEED, { status: 200 })),
    )
    expect(result).toEqual({ added: 2, error: null })

    const rows = await db.select().from(vendorNews).where(eq(vendorNews.vendorId, vendorId))
    expect(rows).toHaveLength(2)
    const event = rows.find((r) => r.url === 'https://news.example.com/topics/1')
    expect(event?.eventKind).toBe('完成見学会')
    expect(event?.eventStart).toBe('2026-09-12')
    expect(event?.eventEnd).toBe('2026-09-12')
    const nonEvent = rows.find((r) => r.url === 'https://news.example.com/topics/2')
    expect(nonEvent?.eventKind).toBeNull()

    const [after] = await db.select().from(vendors).where(eq(vendors.id, vendorId))
    expect(after.newsFetchedAt).not.toBeNull()
    expect(after.newsFetchError).toBeNull()
  })

  it('the 2nd run adds 0 new items (insertNewsIfNew skips duplicate urls)', async () => {
    const vendorId = await makeVendor('テスト工務店', {
      newsUrl: 'https://news.example.com/feed/',
      newsSource: 'rss',
    })
    const vendor: NewsSourceVendor = {
      id: vendorId,
      name: 'テスト工務店',
      newsUrl: 'https://news.example.com/feed/',
      newsSource: 'rss',
    }
    const fetchImpl = fakeFetch(() => new Response(RSS_FEED, { status: 200 }))

    const first = await fetchVendorNews(db, vendor, fetchImpl)
    expect(first).toEqual({ added: 2, error: null })

    const second = await fetchVendorNews(db, vendor, fetchImpl)
    expect(second).toEqual({ added: 0, error: null })

    const rows = await db.select().from(vendorNews).where(eq(vendorNews.vendorId, vendorId))
    expect(rows).toHaveLength(2)
  })

  it('HTML: adds candidates on success', async () => {
    const vendorId = await makeVendor('テスト建設', {
      newsUrl: 'https://www.example-koumuten.co.jp/',
      newsSource: 'html-list',
    })
    const vendor: NewsSourceVendor = {
      id: vendorId,
      name: 'テスト建設',
      newsUrl: 'https://www.example-koumuten.co.jp/',
      newsSource: 'html-list',
    }

    const result = await fetchVendorNews(
      db,
      vendor,
      fakeFetch(() => new Response(HTML_LIST, { status: 200 })),
    )
    expect(result).toEqual({ added: 1, error: null })

    const rows = await db.select().from(vendorNews).where(eq(vendorNews.vendorId, vendorId))
    expect(rows).toHaveLength(1)
    expect(rows[0].eventKind).toBe('構造見学会')
  })

  it('a non-200 records an error and adds 0 items (HTTP <status>)', async () => {
    const vendorId = await makeVendor('テスト工務店', {
      newsUrl: 'https://news.example.com/feed/',
      newsSource: 'rss',
    })
    const vendor: NewsSourceVendor = {
      id: vendorId,
      name: 'テスト工務店',
      newsUrl: 'https://news.example.com/feed/',
      newsSource: 'rss',
    }

    const result = await fetchVendorNews(
      db,
      vendor,
      fakeFetch(() => new Response('', { status: 503 })),
    )
    expect(result).toEqual({ added: 0, error: 'HTTP 503' })

    const [after] = await db.select().from(vendors).where(eq(vendors.id, vendorId))
    expect(after.newsFetchError).toBe('HTTP 503')
    expect(after.newsFetchedAt).not.toBeNull()
  })

  it('a timeout or network error (fetch throws) records an error', async () => {
    const vendorId = await makeVendor('テスト工務店', {
      newsUrl: 'https://news.example.com/feed/',
      newsSource: 'rss',
    })
    const vendor: NewsSourceVendor = {
      id: vendorId,
      name: 'テスト工務店',
      newsUrl: 'https://news.example.com/feed/',
      newsSource: 'rss',
    }
    // Instead of waiting 10 seconds for AbortSignal.timeout(10_000) to actually fire,
    // directly simulate the case where fetchImpl itself throws the exception caused by
    // a timeout (DOMException 'TimeoutError').
    const timeoutFetch = (async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    }) as typeof fetch

    const result = await fetchVendorNews(db, vendor, timeoutFetch)
    expect(result.added).toBe(0)
    expect(result.error).toContain('timeout')
  })

  it('over 1MB records an error (aborts without reading the whole body)', async () => {
    const vendorId = await makeVendor('テスト工務店', {
      newsUrl: 'https://news.example.com/feed/',
      newsSource: 'rss',
    })
    const vendor: NewsSourceVendor = {
      id: vendorId,
      name: 'テスト工務店',
      newsUrl: 'https://news.example.com/feed/',
      newsSource: 'rss',
    }
    const hugeBody = 'a'.repeat(1_000_001)

    const result = await fetchVendorNews(
      db,
      vendor,
      fakeFetch(() => new Response(hugeBody, { status: 200 })),
    )
    expect(result.added).toBe(0)
    expect(result.error).toMatch(/1MB/)
  })

  it('returns the added count without losing it even if markNewsFetched throws after insertNewsIfNew succeeded', async () => {
    const vendorId = await makeVendor('記録失敗業者', {
      newsUrl: 'https://news.example.com/feed/',
      newsSource: 'rss',
    })
    const vendor: NewsSourceVendor = {
      id: vendorId,
      name: '記録失敗業者',
      newsUrl: 'https://news.example.com/feed/',
      newsSource: 'rss',
    }

    // markNewsFetched calls db.update(vendors)... After insertNewsIfNew (db.insert)
    // succeeds, make only the first markNewsFetched call fail (the 2nd call = the
    // fallback record goes back to the original implementation, and its result is
    // expected to be swallowed by .catch, so it does not affect the check of added).
    const originalUpdate = db.update.bind(db)
    let updateCalls = 0
    db.update = ((...args: Parameters<typeof db.update>) => {
      updateCalls += 1
      if (updateCalls === 1) throw new Error('simulated markNewsFetched failure')
      return originalUpdate(...args)
    }) as typeof db.update

    try {
      const result = await fetchVendorNews(
        db,
        vendor,
        fakeFetch(() => new Response(RSS_FEED, { status: 200 })),
      )
      // insertNewsIfNew itself succeeded, so added does not turn into 0
      expect(result.added).toBe(2)
      expect(result.error).not.toBeNull()
    } finally {
      db.update = originalUpdate
    }

    const rows = await db.select().from(vendorNews).where(eq(vendorNews.vendorId, vendorId))
    expect(rows).toHaveLength(2)
  })

  it('records an error when news_url / news_source is not set (defensively)', async () => {
    const vendorId = await makeVendor('URL未設定')
    const vendor: NewsSourceVendor = {
      id: vendorId,
      name: 'URL未設定',
      newsUrl: null,
      newsSource: null,
    }

    const result = await fetchVendorNews(
      db,
      vendor,
      fakeFetch(() => new Response('', { status: 200 })),
    )
    expect(result.added).toBe(0)
    expect(result.error).not.toBeNull()
  })

  it('a disallowed URL (SSRF guard) becomes an error without calling fetch at all', async () => {
    // optionalHttpsUrl on the form side rejects it with the same check, but to cover
    // existing data that did not go through the form, create a vendor whose newsUrl is
    // an IP literal directly in db.
    const vendorId = await makeVendor('内部URL業者', {
      newsUrl: 'https://192.168.1.1/feed/',
      newsSource: 'rss',
    })
    const vendor: NewsSourceVendor = {
      id: vendorId,
      name: '内部URL業者',
      newsUrl: 'https://192.168.1.1/feed/',
      newsSource: 'rss',
    }

    let called = false
    const result = await fetchVendorNews(db, vendor, (async () => {
      called = true
      return new Response(RSS_FEED, { status: 200 })
    }) as typeof fetch)
    expect(called).toBe(false)
    expect(result).toEqual({ added: 0, error: 'URL が許可されていません' })

    const [after] = await db.select().from(vendors).where(eq(vendors.id, vendorId))
    expect(after.newsFetchError).toBe('URL が許可されていません')
  })

  it('passes an AbortSignal (for the timeout) and a User-Agent header to fetchImpl', async () => {
    const vendorId = await makeVendor('テスト工務店', {
      newsUrl: 'https://news.example.com/feed/',
      newsSource: 'rss',
    })
    const vendor: NewsSourceVendor = {
      id: vendorId,
      name: 'テスト工務店',
      newsUrl: 'https://news.example.com/feed/',
      newsSource: 'rss',
    }

    let seenInit: RequestInit | undefined
    const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
      seenInit = init
      return new Response(RSS_FEED, { status: 200 })
    }) as typeof fetch

    await fetchVendorNews(db, vendor, fetchImpl)

    expect(seenInit?.signal).toBeInstanceOf(AbortSignal)
    expect((seenInit?.headers as Record<string, string> | undefined)?.['User-Agent']).toBe(
      'sumai-log/1.0',
    )
  })

  it('a redirect to an allowed host is followed just once and fetched', async () => {
    const vendorId = await makeVendor('リダイレクト業者', {
      newsUrl: 'https://news.example.com/feed/',
      newsSource: 'rss',
    })
    const vendor: NewsSourceVendor = {
      id: vendorId,
      name: 'リダイレクト業者',
      newsUrl: 'https://news.example.com/feed/',
      newsSource: 'rss',
    }

    let calls = 0
    const fetchImpl = (async (url: string | URL) => {
      calls += 1
      if (String(url) === 'https://news.example.com/feed/') {
        return new Response(null, {
          status: 301,
          headers: { Location: 'https://news.example.com/feed-renamed/' },
        })
      }
      return new Response(RSS_FEED, { status: 200 })
    }) as typeof fetch

    const result = await fetchVendorNews(db, vendor, fetchImpl)
    expect(result).toEqual({ added: 2, error: null })
    expect(calls).toBe(2) // the first 301, and 1 call to the redirect target
  })

  it('a redirect to a disallowed host becomes an error without that host being fetched', async () => {
    const vendorId = await makeVendor('リダイレクト業者2', {
      newsUrl: 'https://news.example.com/feed/',
      newsSource: 'rss',
    })
    const vendor: NewsSourceVendor = {
      id: vendorId,
      name: 'リダイレクト業者2',
      newsUrl: 'https://news.example.com/feed/',
      newsSource: 'rss',
    }

    let blockedHostFetched = false
    const fetchImpl = (async (url: string | URL) => {
      if (String(url) === 'https://news.example.com/feed/') {
        // A redirect that tries to lead to an internal IP literal
        return new Response(null, {
          status: 302,
          headers: { Location: 'https://192.168.1.1/feed/' },
        })
      }
      blockedHostFetched = true
      return new Response(RSS_FEED, { status: 200 })
    }) as typeof fetch

    const result = await fetchVendorNews(db, vendor, fetchImpl)
    expect(blockedHostFetched).toBe(false)
    expect(result).toEqual({ added: 0, error: 'リダイレクト先が許可されていません' })
  })

  it('also rejects a redirect to its own host (sumai-log.app)', async () => {
    const vendorId = await makeVendor('自己リダイレクト業者', {
      newsUrl: 'https://news.example.com/feed/',
      newsSource: 'rss',
    })
    const vendor: NewsSourceVendor = {
      id: vendorId,
      name: '自己リダイレクト業者',
      newsUrl: 'https://news.example.com/feed/',
      newsSource: 'rss',
    }

    let selfHostFetched = false
    const fetchImpl = (async (url: string | URL) => {
      if (String(url) === 'https://news.example.com/feed/') {
        return new Response(null, {
          status: 302,
          headers: { Location: 'https://sumai-log.app/api/photos/x' },
        })
      }
      selfHostFetched = true
      return new Response(RSS_FEED, { status: 200 })
    }) as typeof fetch

    const result = await fetchVendorNews(db, vendor, fetchImpl)
    expect(selfHostFetched).toBe(false)
    expect(result).toEqual({ added: 0, error: 'リダイレクト先が許可されていません' })
  })

  it('4 redirects in a row become an error (because that exceeds 3)', async () => {
    const vendorId = await makeVendor('多段リダイレクト業者', {
      newsUrl: 'https://news.example.com/hop0',
      newsSource: 'rss',
    })
    const vendor: NewsSourceVendor = {
      id: vendorId,
      name: '多段リダイレクト業者',
      newsUrl: 'https://news.example.com/hop0',
      newsSource: 'rss',
    }

    const fetchImpl = (async (url: string | URL) => {
      const match = /\/hop(\d)$/.exec(String(url))
      const hop = match ? Number(match[1]) : 0
      if (hop < 4) {
        return new Response(null, {
          status: 302,
          headers: { Location: `https://news.example.com/hop${hop + 1}` },
        })
      }
      return new Response(RSS_FEED, { status: 200 })
    }) as typeof fetch

    const result = await fetchVendorNews(db, vendor, fetchImpl)
    expect(result).toEqual({ added: 0, error: 'リダイレクト先が許可されていません' })
  })

  it('3 redirects (the boundary) are followed and succeed', async () => {
    const vendorId = await makeVendor('3段リダイレクト業者', {
      newsUrl: 'https://news.example.com/hop0',
      newsSource: 'rss',
    })
    const vendor: NewsSourceVendor = {
      id: vendorId,
      name: '3段リダイレクト業者',
      newsUrl: 'https://news.example.com/hop0',
      newsSource: 'rss',
    }

    const fetchImpl = (async (url: string | URL) => {
      const match = /\/hop(\d)$/.exec(String(url))
      const hop = match ? Number(match[1]) : 0
      if (hop < 3) {
        return new Response(null, {
          status: 302,
          headers: { Location: `https://news.example.com/hop${hop + 1}` },
        })
      }
      return new Response(RSS_FEED, { status: 200 })
    }) as typeof fetch

    const result = await fetchVendorNews(db, vendor, fetchImpl)
    expect(result).toEqual({ added: 2, error: null })
  })

  it('resolves even a relative-path Location against the current URL before the allow check (not against the first URL)', async () => {
    const vendorId = await makeVendor('相対リダイレクト業者', {
      newsUrl: 'https://news.example.com/feed/',
      newsSource: 'rss',
    })
    const vendor: NewsSourceVendor = {
      id: vendorId,
      name: '相対リダイレクト業者',
      newsUrl: 'https://news.example.com/feed/',
      newsSource: 'rss',
    }

    const fetchImpl = (async (url: string | URL) => {
      if (String(url) === 'https://news.example.com/feed/') {
        // Hop 1: to an absolute URL
        return new Response(null, {
          status: 302,
          headers: { Location: 'https://news.example.com/sub/feed/' },
        })
      }
      if (String(url) === 'https://news.example.com/sub/feed/') {
        // Hop 2: a relative path. Resolved against the current URL (.../sub/feed/) it
        // becomes .../sub/feed2/ (resolved against the first URL, .../feed/, it would be
        // .../feed2/, so this test can tell them apart)
        return new Response(null, { status: 302, headers: { Location: '../feed2/' } })
      }
      if (String(url) === 'https://news.example.com/sub/feed2/') {
        return new Response(RSS_FEED, { status: 200 })
      }
      throw new Error(`unexpected url: ${String(url)}`)
    }) as typeof fetch

    const result = await fetchVendorNews(db, vendor, fetchImpl)
    expect(result).toEqual({ added: 2, error: null })
  })
})

describe('fetchAllVendorNews', () => {
  it('keeps fetching the other vendors even if 1 vendor fails', async () => {
    const failingId = await makeVendor('失敗業者', {
      newsUrl: 'https://fail.example.com/feed/',
      newsSource: 'rss',
    })
    const okId = await makeVendor('成功業者', {
      newsUrl: 'https://ok.example.com/feed/',
      newsSource: 'rss',
    })

    const fetchImpl = fakeFetch((url) =>
      url.startsWith('https://fail.example.com')
        ? new Response('', { status: 500 })
        : new Response(RSS_FEED, { status: 200 }),
    )

    const results = await fetchAllVendorNews(db, fetchImpl)
    const byVendor = new Map(results.map((r) => [r.vendorId, r]))
    expect(byVendor.get(failingId)).toEqual({
      vendorId: failingId,
      vendorName: '失敗業者',
      added: 0,
      error: 'HTTP 500',
    })
    expect(byVendor.get(okId)).toEqual({
      vendorId: okId,
      vendorName: '成功業者',
      added: 2,
      error: null,
    })
  })

  it('vendors without newsUrl are excluded (listNewsSources already filters them)', async () => {
    await makeVendor('お知らせ無し')
    const results = await fetchAllVendorNews(
      db,
      fakeFetch(() => new Response(RSS_FEED, { status: 200 })),
    )
    expect(results).toEqual([])
  })

  it('even if insertNewsIfNew throws, records the error with markNewsFetched and keeps fetching the next vendor', async () => {
    const failingId = await makeVendor('挿入失敗業者', {
      newsUrl: 'https://fail-insert.example.com/feed/',
      newsSource: 'rss',
    })
    const okId = await makeVendor('成功業者2', {
      newsUrl: 'https://ok2.example.com/feed/',
      newsSource: 'rss',
    })

    // Instead of stubbing insertNewsIfNew itself, use the real foreign key constraint of
    // D1 to reproduce a race that can happen in reality, "the vendor row disappears in
    // the middle of a fetch": if the vendor row itself is deleted right before fetchImpl
    // returns the response, the INSERT of the following insertNewsIfNew throws on a
    // FOREIGN KEY constraint violation (a "broken row").
    // url is UNIQUE across all of vendorNews (not per vendor), so prepare a feed whose
    // urls differ from RSS_FEED, which the other vendor (the successful vendor 2) uses. If
    // the url is already used and the row is skipped by ON CONFLICT DO NOTHING, that row is
    // never INSERTed in the first place, so it cannot reach the FOREIGN KEY violation.
    const RSS_FEED_FOR_FAILING_VENDOR = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <item>
    <title>削除された業者のお知らせ</title>
    <link>https://fail-insert.example.com/topics/1</link>
    <pubDate>Sat, 12 Sep 2026 09:00:00 +0900</pubDate>
  </item>
</channel></rss>`

    const wrappedFetch = (async (url: string | URL) => {
      if (String(url).startsWith('https://fail-insert.example.com')) {
        await db.delete(vendors).where(eq(vendors.id, failingId))
        return new Response(RSS_FEED_FOR_FAILING_VENDOR, { status: 200 })
      }
      return new Response(RSS_FEED, { status: 200 })
    }) as typeof fetch

    const results = await fetchAllVendorNews(db, wrappedFetch)
    const byVendor = new Map(results.map((r) => [r.vendorId, r]))

    const failing = byVendor.get(failingId)
    expect(failing?.vendorName).toBe('挿入失敗業者')
    expect(failing?.added).toBe(0)
    expect(failing?.error).not.toBeNull()
    // Truncated to ERROR_MESSAGE_MAX (200 characters)
    expect(failing?.error?.length).toBeLessThanOrEqual(200)

    // Even after the failed vendor, the next vendor is fetched normally (the loop does not stop)
    expect(byVendor.get(okId)).toEqual({
      vendorId: okId,
      vendorName: '成功業者2',
      added: 2,
      error: null,
    })
  })
})
