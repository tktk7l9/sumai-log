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

// 一覧の日付（2026年9月10日）は parseHtmlList がタイトルから取り除いて publishedOn に
// 回すため、タイトル自身にも日付を含めておかないと extractEvent が拾える日付が残らない
// （html-list はどの li にも publishedOn 用の日付が要るので、これは実運用でも起こりうる形）。
const HTML_LIST = `
<ul>
  <li>2026年9月10日 <a href="./news/1.php">構造見学会 9月10日(土)開催</a></li>
</ul>`

/** fetchImpl の差し替え。実際のベンダーサイトは一切叩かない。 */
function fakeFetch(build: (url: string) => Response): typeof fetch {
  return (async (url: string | URL) => build(String(url))) as typeof fetch
}

describe('fetchVendorNews', () => {
  it('RSS: 成功で候補を追加し、イベント判定した行には event_* が入る', async () => {
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

  it('2 回目は新着 0 件（url 重複は insertNewsIfNew がスキップ）', async () => {
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

  it('HTML: 成功で候補を追加する', async () => {
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

  it('非 200 はエラーを記録して 0 件（HTTP <status>）', async () => {
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

  it('タイムアウト・ネットワークエラー（fetch が例外を投げる）はエラーを記録する', async () => {
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
    // AbortSignal.timeout(10_000) が実際に発火するのを 10 秒待つ代わりに、
    // fetchImpl 自体がタイムアウト由来の例外（DOMException 'TimeoutError'）を
    // 投げるケースを直接シミュレートする。
    const timeoutFetch = (async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    }) as typeof fetch

    const result = await fetchVendorNews(db, vendor, timeoutFetch)
    expect(result.added).toBe(0)
    expect(result.error).toContain('timeout')
  })

  it('1MB 超はエラーを記録する（本文を読み切らずに打ち切る）', async () => {
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

  it('news_url / news_source が未設定ならエラーを記録する（防御的に）', async () => {
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

  it('許可されない URL（SSRF 対策）は fetch 自体を呼ばずにエラーにする', async () => {
    // フォーム側の optionalHttpsUrl も同じ判定で弾くが、フォームを経由しない
    // 既存データを想定して db に直接 IP リテラルの newsUrl を持つ業者を作る。
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

  it('fetchImpl には AbortSignal（タイムアウト用）と User-Agent ヘッダを渡す', async () => {
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
})

describe('fetchAllVendorNews', () => {
  it('1 社が失敗しても他の業者の取得は続ける', async () => {
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
    expect(byVendor.get(failingId)).toEqual({ vendorId: failingId, added: 0, error: 'HTTP 500' })
    expect(byVendor.get(okId)).toEqual({ vendorId: okId, added: 2, error: null })
  })

  it('newsUrl が無い業者は対象外（listNewsSources が既に絞っている）', async () => {
    await makeVendor('お知らせ無し')
    const results = await fetchAllVendorNews(
      db,
      fakeFetch(() => new Response(RSS_FEED, { status: 200 })),
    )
    expect(results).toEqual([])
  })

  it('insertNewsIfNew が例外を投げても markNewsFetched でエラーを記録し、次の業者の取得は続ける', async () => {
    const failingId = await makeVendor('挿入失敗業者', {
      newsUrl: 'https://fail-insert.example.com/feed/',
      newsSource: 'rss',
    })
    const okId = await makeVendor('成功業者2', {
      newsUrl: 'https://ok2.example.com/feed/',
      newsSource: 'rss',
    })

    // insertNewsIfNew 自体をスタブする代わりに、D1 の実際の外部キー制約を使って
    // 「取得の最中に業者行が消える」という現実にありうる競合を再現する:
    // fetchImpl がレスポンスを返す直前に業者行そのものを削除しておくと、続く
    // insertNewsIfNew の INSERT が FOREIGN KEY 制約違反で例外を投げる（「壊れた行」）。
    // url は vendorNews 全体で UNIQUE（業者ごとではない）なので、もう一方の業者
    // （成功業者2）が使う RSS_FEED とは別の url を持つフィードを用意する。既に
    // url が使われていて ON CONFLICT DO NOTHING でスキップされると、その行は
    // そもそも INSERT されないため FOREIGN KEY 違反まで辿り着けなくなる。
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
    expect(failing?.added).toBe(0)
    expect(failing?.error).not.toBeNull()
    // ERROR_MESSAGE_MAX（200字）に切り詰められている
    expect(failing?.error?.length).toBeLessThanOrEqual(200)

    // 失敗した業者の後でも次の業者は正常に取得できる（ループが止まらない）
    expect(byVendor.get(okId)).toEqual({ vendorId: okId, added: 2, error: null })
  })
})
