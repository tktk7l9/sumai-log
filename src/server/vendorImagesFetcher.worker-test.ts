import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { vendors } from '../db/schema'
import { representativeThumbKeyFromDisplayKey } from '../lib/photos'
import { upsertVendor } from './repository/candidates'
import { actor, db, reset } from './repository/test-helpers'
import {
  deleteRepresentativePhotoObjects,
  deleteVendorFaviconObjects,
  fetchFaviconForVendor,
  importRepresentativePhotoFromUrlCore,
  refreshAllVendorFavicons,
  uploadVendorFaviconCore,
} from './vendorImagesFetcher'

beforeEach(reset)

async function makeVendor(name: string, overrides: Record<string, unknown> = {}) {
  return upsertVendor(db, { name, kind: 'koumuten', serviceAreas: [], ...overrides }, actor)
}

/** Fake R2 that only records put(key, bytes, opts) / delete(keys). Never hits a real vendor site. */
function fakeBucket() {
  const objects = new Map<string, { body: Uint8Array; contentType?: string }>()
  const put = vi.fn(
    async (key: string, value: Uint8Array, opts?: { httpMetadata?: { contentType?: string } }) => {
      objects.set(key, { body: value, contentType: opts?.httpMetadata?.contentType })
    },
  )
  const deletedKeys: string[] = []
  const del = vi.fn(async (keys: string | string[]) => {
    const list = Array.isArray(keys) ? keys : [keys]
    deletedKeys.push(...list)
    for (const k of list) objects.delete(k)
  })
  const bucket = { put, delete: del } as unknown as R2Bucket
  return { bucket, objects, deletedKeys, put, del }
}

function fakeFetch(build: (url: string) => Response | null): typeof fetch {
  return (async (url: string | URL) => {
    const res = build(String(url))
    if (!res) throw new Error(`unexpected url: ${String(url)}`)
    return res
  }) as typeof fetch
}

/**
 * Builds a Response that streams a total of `totalBytes` in small chunks without a
 * `content-length` header. When there is no content-length, readCapped
 * (vendorImagesFetcher.ts) counts the total while reading chunks and cuts off at the point
 * the limit is exceeded. The defense for when the other side sends no Content-Length or
 * lies about it can be verified only through this path (it is a different thing from the
 * limit test via the content-length header).
 */
function streamedResponse(totalBytes: number, chunkSize = 64 * 1024): Response {
  let sent = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= totalBytes) {
        controller.close()
        return
      }
      const size = Math.min(chunkSize, totalBytes - sent)
      controller.enqueue(new Uint8Array(size))
      sent += size
    },
  })
  return new Response(stream, { status: 200 })
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const ICO_BYTES = new Uint8Array([0x00, 0x00, 0x01, 0x00, 1, 0])
const HTML_WITH_ICON = '<html><head><link rel="icon" href="/icon.png"></head></html>'

// The key now includes a stamp (Date.now() in base36) (to deal with the immutable cache),
// so look only at the shape, not an exact match. It can be embedded directly in toEqual as
// an asymmetric matcher.
function faviconKeyMatching(vendorId: string, ext: string) {
  return expect.stringMatching(new RegExp(`^vendors/${vendorId}/favicon-[0-9a-z]+\\.${ext}$`))
}
function representativeDisplayKeyMatching(vendorId: string) {
  return expect.stringMatching(
    new RegExp(`^vendors/${vendorId}/representative-[0-9a-z]+-display\\.jpg$`),
  )
}

describe('fetchFaviconForVendor', () => {
  it('follows <link rel="icon"> in the HTML, puts the image in R2, and updates favicon_key', async () => {
    const vendorId = await makeVendor('テスト工務店')
    const { bucket, objects } = fakeBucket()
    const fetchImpl = fakeFetch((url) => {
      if (url === 'https://vendor.example.com/')
        return new Response(HTML_WITH_ICON, { status: 200 })
      if (url === 'https://vendor.example.com/icon.png') {
        return new Response(PNG_BYTES, { status: 200 })
      }
      return null
    })

    const result = await fetchFaviconForVendor(
      db,
      vendorId,
      'https://vendor.example.com/',
      fetchImpl,
      bucket,
    )
    expect(result).toEqual({ ok: true, key: faviconKeyMatching(vendorId, 'png') })
    if (!result.ok) throw new Error('unreachable')
    expect(objects.get(result.key)?.contentType).toBe('image/png')

    const [row] = await db.select().from(vendors).where(eq(vendors.id, vendorId))
    expect(row.faviconKey).toBe(result.key)
    // The automatic fetch sets favicon_source to 'auto' (to tell it apart from manual upload)
    expect(row.faviconSource).toBe('auto')
  })

  it('tries the next candidate when one cannot be sniffed as an image, and returns failure when all fail', async () => {
    const vendorId = await makeVendor('テスト工務店2')
    const { bucket } = fakeBucket()
    const fetchImpl = fakeFetch((url) => {
      if (url === 'https://vendor.example.com/')
        return new Response(HTML_WITH_ICON, { status: 200 })
      if (url === 'https://vendor.example.com/icon.png') {
        return new Response('<html>not an image</html>', { status: 200 })
      }
      if (url === 'https://vendor.example.com/favicon.ico') return new Response('', { status: 404 })
      return null
    })

    const result = await fetchFaviconForVendor(
      db,
      vendorId,
      'https://vendor.example.com/',
      fetchImpl,
      bucket,
    )
    expect(result).toEqual({ ok: false, error: 'アイコンが見つかりませんでした' })
  })

  it('returns failure without calling fetch for a disallowed URL (SSRF protection)', async () => {
    const vendorId = await makeVendor('内部URL業者')
    const { bucket } = fakeBucket()
    let called = false
    const fetchImpl = (async () => {
      called = true
      return new Response('', { status: 200 })
    }) as typeof fetch

    const result = await fetchFaviconForVendor(
      db,
      vendorId,
      'https://192.168.1.1/',
      fetchImpl,
      bucket,
    )
    expect(called).toBe(false)
    expect(result).toEqual({ ok: false, error: 'URL が許可されていません' })
  })

  it('tries the favicon.ico fallback even when fetching the top page itself fails', async () => {
    const vendorId = await makeVendor('HTML取得失敗業者')
    const { bucket, objects } = fakeBucket()
    const fetchImpl = fakeFetch((url) => {
      if (url === 'https://vendor.example.com/') return new Response('', { status: 500 })
      if (url === 'https://vendor.example.com/favicon.ico')
        return new Response(ICO_BYTES, { status: 200 })
      return null
    })

    const result = await fetchFaviconForVendor(
      db,
      vendorId,
      'https://vendor.example.com/',
      fetchImpl,
      bucket,
    )
    expect(result).toEqual({ ok: true, key: faviconKeyMatching(vendorId, 'ico') })
    if (!result.ok) throw new Error('unreachable')
    expect(objects.get(result.key)?.contentType).toBe('image/x-icon')
  })

  it('deletes the previous favicon object on replacement, whether the extension changes or stays the same (the key has a different stamp every time)', async () => {
    const vendorId = await makeVendor('拡張子変更業者')
    const { bucket, deletedKeys } = fakeBucket()
    // Calling both times within the same millisecond can give the same stamp by chance with
    // the real clock, so inject a counter to make the stamp always differ (the now argument
    // of fetchFaviconForVendor)
    let clock = 1_700_000_000_000
    const now = () => clock++
    const firstFetch = fakeFetch((url) => {
      if (url === 'https://vendor.example.com/')
        return new Response(HTML_WITH_ICON, { status: 200 })
      if (url === 'https://vendor.example.com/icon.png')
        return new Response(PNG_BYTES, { status: 200 })
      return null
    })
    const first = await fetchFaviconForVendor(
      db,
      vendorId,
      'https://vendor.example.com/',
      firstFetch,
      bucket,
      {},
      now,
    )
    expect(first).toEqual({ ok: true, key: faviconKeyMatching(vendorId, 'png') })
    if (!first.ok) throw new Error('unreachable')

    const HTML_WITH_ICO = '<html><head><link rel="shortcut icon" href="/legacy.ico"></head></html>'
    const secondFetch = fakeFetch((url) => {
      if (url === 'https://vendor.example.com/') return new Response(HTML_WITH_ICO, { status: 200 })
      if (url === 'https://vendor.example.com/legacy.ico')
        return new Response(ICO_BYTES, { status: 200 })
      return null
    })
    const second = await fetchFaviconForVendor(
      db,
      vendorId,
      'https://vendor.example.com/',
      secondFetch,
      bucket,
      {},
      now,
    )
    expect(second).toEqual({ ok: true, key: faviconKeyMatching(vendorId, 'ico') })
    if (!second.ok) throw new Error('unreachable')
    expect(second.key).not.toBe(first.key)
    expect(deletedKeys).toContain(first.key)
  })

  it('returns failure without rethrowing even when an unexpected exception is thrown', async () => {
    const vendorId = await makeVendor('例外業者')
    const throwingBucket = {
      put: vi.fn(async () => {
        throw new Error('R2 put failed')
      }),
    } as unknown as R2Bucket
    const fetchImpl = fakeFetch((url) => {
      if (url === 'https://vendor.example.com/')
        return new Response(HTML_WITH_ICON, { status: 200 })
      if (url === 'https://vendor.example.com/icon.png')
        return new Response(PNG_BYTES, { status: 200 })
      return null
    })

    const result = await fetchFaviconForVendor(
      db,
      vendorId,
      'https://vendor.example.com/',
      fetchImpl,
      throwingBucket,
    )
    expect(result).toEqual({ ok: false, error: 'R2 put failed' })
  })

  it('does not fetch a disallowed host on a redirect to it (while fetching the HTML) and falls back to the favicon.ico fallback', async () => {
    const vendorId = await makeVendor('リダイレクトSSRF業者')
    const { bucket } = fakeBucket()
    let blockedHostFetched = false
    const fetchImpl = (async (url: string | URL) => {
      if (String(url) === 'https://vendor.example.com/') {
        // A redirect that tries to lead to an internal IP literal
        return new Response(null, { status: 302, headers: { Location: 'https://192.168.1.1/' } })
      }
      if (String(url) === 'https://vendor.example.com/favicon.ico') {
        return new Response(ICO_BYTES, { status: 200 })
      }
      blockedHostFetched = true
      return new Response('', { status: 200 })
    }) as typeof fetch

    const result = await fetchFaviconForVendor(
      db,
      vendorId,
      'https://vendor.example.com/',
      fetchImpl,
      bucket,
    )
    expect(blockedHostFetched).toBe(false)
    // The HTML fetch is treated as failed (html=''), but the favicon.ico fallback is always
    // obtained from pickFaviconCandidates('', websiteUrl) too, so the fetch itself succeeds
    expect(result).toEqual({ ok: true, key: faviconKeyMatching(vendorId, 'ico') })
  })

  it('follows a redirect to an allowed host (while fetching the HTML) and picks up the candidates', async () => {
    const vendorId = await makeVendor('許可リダイレクト業者')
    const { bucket } = fakeBucket()
    const fetchImpl = fakeFetch((url) => {
      if (url === 'https://vendor.example.com/') {
        return new Response(null, {
          status: 301,
          headers: { Location: 'https://www.vendor.example.com/' },
        })
      }
      if (url === 'https://www.vendor.example.com/')
        return new Response(HTML_WITH_ICON, { status: 200 })
      // The relative href (/icon.png) is resolved against the finalUrl after the redirect
      if (url === 'https://www.vendor.example.com/icon.png')
        return new Response(PNG_BYTES, { status: 200 })
      return null
    })

    const result = await fetchFaviconForVendor(
      db,
      vendorId,
      'https://vendor.example.com/',
      fetchImpl,
      bucket,
    )
    expect(result).toEqual({ ok: true, key: faviconKeyMatching(vendorId, 'png') })
  })

  it('keeps outbound fetches within HTML 1 time + candidates at most 6 times = at most 7 times even for HTML with more than 6 candidates', async () => {
    const vendorId = await makeVendor('候補大量業者')
    const { bucket } = fakeBucket()
    // Declare 10 rel=icon (all without sizes = same rank. Even including the favicon.ico
    // fallback, pickFaviconCandidates returns only the top 5 + the fallback, at most 6)
    const htmlWithManyIcons = Array.from(
      { length: 10 },
      (_, i) => `<link rel="icon" href="/icon-${i}.png">`,
    ).join('')
    let fetchCount = 0
    let requestedCandidateUrls: string[] = []
    const fetchImpl = (async (url: string | URL) => {
      fetchCount += 1
      const u = String(url)
      if (u === 'https://vendor.example.com/') {
        return new Response(htmlWithManyIcons, { status: 200 })
      }
      requestedCandidateUrls.push(u)
      // Make every candidate and the fallback "unusable as an image" so that it tries to the
      // end (= up to the limit)
      return new Response('not an image', { status: 200 })
    }) as typeof fetch

    const result = await fetchFaviconForVendor(
      db,
      vendorId,
      'https://vendor.example.com/',
      fetchImpl,
      bucket,
    )
    expect(result).toEqual({ ok: false, error: 'アイコンが見つかりませんでした' })
    // HTML 1 time + candidates 6 times (5 declared + the favicon.ico fallback) = at most 7 times
    expect(fetchCount).toBeLessThanOrEqual(7)
    expect(requestedCandidateUrls.length).toBeLessThanOrEqual(6)
    // Of the 10 declared, the latter half (icon-5 to icon-9) is cut by the limit and never fetched
    expect(requestedCandidateUrls).not.toContain('https://vendor.example.com/icon-9.png')
  })

  it('cuts off the HTML fetch when it is a stream over 1MB without content-length, and falls back to the favicon.ico fallback', async () => {
    const vendorId = await makeVendor('HTML上限ストリーム業者')
    const { bucket, objects } = fakeBucket()
    let declaredCandidateFetched = false
    const fetchImpl = (async (url: string | URL) => {
      const u = String(url)
      if (u === 'https://vendor.example.com/') {
        // Stream more than HTML_MAX_BYTES (1_000_000) without content-length.
        // Whatever HTML the content is, once cut off it is treated as html='', and
        // the declared candidate (icon.png, below) should never be fetched
        return streamedResponse(1_000_001)
      }
      if (u === 'https://vendor.example.com/favicon.ico') {
        return new Response(ICO_BYTES, { status: 200 })
      }
      declaredCandidateFetched = true
      return new Response('', { status: 404 })
    }) as typeof fetch

    const result = await fetchFaviconForVendor(
      db,
      vendorId,
      'https://vendor.example.com/',
      fetchImpl,
      bucket,
    )
    expect(result).toEqual({ ok: true, key: faviconKeyMatching(vendorId, 'ico') })
    if (!result.ok) throw new Error('unreachable')
    expect(objects.get(result.key)?.contentType).toBe('image/x-icon')
    expect(declaredCandidateFetched).toBe(false)
  })

  it('discards a favicon candidate when it is a stream over 512KB without content-length, and tries the next candidate (the fallback)', async () => {
    const vendorId = await makeVendor('favicon上限ストリーム業者')
    const { bucket } = fakeBucket()
    const fetchImpl = (async (url: string | URL) => {
      const u = String(url)
      if (u === 'https://vendor.example.com/') return new Response(HTML_WITH_ICON, { status: 200 })
      if (u === 'https://vendor.example.com/icon.png') {
        // Stream more than ICON_MAX_BYTES (512_000) without content-length
        return streamedResponse(512_001)
      }
      if (u === 'https://vendor.example.com/favicon.ico') {
        return new Response(ICO_BYTES, { status: 200 })
      }
      return new Response('', { status: 404 })
    }) as typeof fetch

    const result = await fetchFaviconForVendor(
      db,
      vendorId,
      'https://vendor.example.com/',
      fetchImpl,
      bucket,
    )
    expect(result).toEqual({ ok: true, key: faviconKeyMatching(vendorId, 'ico') })
  })
})

describe('refreshAllVendorFavicons', () => {
  it('targets only vendors without a favicon_key when force=false', async () => {
    const withFavicon = await makeVendor('取得済み業者', {
      websiteUrl: 'https://has-favicon.example.com/',
      faviconKey: 'vendors/existing/favicon.png',
    })
    const withoutFavicon = await makeVendor('未取得業者', {
      websiteUrl: 'https://no-favicon.example.com/',
    })
    const { bucket } = fakeBucket()
    const fetchImpl = fakeFetch((url) => {
      if (url === 'https://no-favicon.example.com/')
        return new Response(HTML_WITH_ICON, { status: 200 })
      if (url === 'https://no-favicon.example.com/icon.png')
        return new Response(PNG_BYTES, { status: 200 })
      return null
    })

    const { results, processed, remaining } = await refreshAllVendorFavicons(
      db,
      { force: false },
      fetchImpl,
      bucket,
    )
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      vendorId: withoutFavicon,
      vendorName: '未取得業者',
      ok: true,
      key: faviconKeyMatching(withoutFavicon, 'png'),
    })
    expect(processed).toBe(1)
    expect(remaining).toBe(0)
    expect(withFavicon).toBeTruthy()
  })

  it('also targets vendors that already have a favicon_key when force=true (fetch again)', async () => {
    const vendorId = await makeVendor('取り直し業者', {
      websiteUrl: 'https://vendor.example.com/',
      faviconKey: 'vendors/old/favicon.png',
    })
    const { bucket } = fakeBucket()
    const fetchImpl = fakeFetch((url) => {
      if (url === 'https://vendor.example.com/')
        return new Response(HTML_WITH_ICON, { status: 200 })
      if (url === 'https://vendor.example.com/icon.png')
        return new Response(PNG_BYTES, { status: 200 })
      return null
    })

    const { results } = await refreshAllVendorFavicons(db, { force: true }, fetchImpl, bucket)
    expect(results).toEqual([
      { vendorId, vendorName: '取り直し業者', ok: true, key: faviconKeyMatching(vendorId, 'png') },
    ])
  })

  it('excludes vendors without a website_url, and a failure of 1 vendor does not stop the others', async () => {
    await makeVendor('サイト無し業者')
    const failing = await makeVendor('失敗業者', { websiteUrl: 'https://fail.example.com/' })
    const ok = await makeVendor('成功業者', { websiteUrl: 'https://ok.example.com/' })
    const { bucket } = fakeBucket()
    const fetchImpl = fakeFetch((url) => {
      if (url === 'https://fail.example.com/') return new Response('', { status: 500 })
      if (url === 'https://fail.example.com/favicon.ico') return new Response('', { status: 404 })
      if (url === 'https://ok.example.com/') return new Response(HTML_WITH_ICON, { status: 200 })
      if (url === 'https://ok.example.com/icon.png') return new Response(PNG_BYTES, { status: 200 })
      return null
    })

    const { results } = await refreshAllVendorFavicons(db, { force: false }, fetchImpl, bucket)
    const byId = new Map(results.map((r) => [r.vendorId, r]))
    expect(byId.size).toBe(2)
    expect(byId.get(failing)?.ok).toBe(false)
    expect(byId.get(ok)).toEqual({
      vendorId: ok,
      vendorName: '成功業者',
      ok: true,
      key: faviconKeyMatching(ok, 'png'),
    })
  })

  it('processes at most 10 vendors in one call and returns the rest as remaining', async () => {
    // Create 12 vendors that are not yet fetched (force=false)
    const vendorIds: string[] = []
    for (let i = 0; i < 12; i++) {
      vendorIds.push(
        await makeVendor(`大量業者${i}`, { websiteUrl: `https://vendor${i}.example.com/` }),
      )
    }
    const { bucket } = fakeBucket()
    const fetchImpl = fakeFetch((url) => {
      const m = /^https:\/\/vendor(\d+)\.example\.com\/$/.exec(url)
      if (m) return new Response(`<link rel="icon" href="/icon.png">`, { status: 200 })
      if (/^https:\/\/vendor\d+\.example\.com\/icon\.png$/.test(url)) {
        return new Response(PNG_BYTES, { status: 200 })
      }
      return new Response('', { status: 404 })
    })

    const { results, processed, remaining } = await refreshAllVendorFavicons(
      db,
      { force: false },
      fetchImpl,
      bucket,
    )
    expect(processed).toBe(10)
    expect(results).toHaveLength(10)
    expect(remaining).toBe(2)
    // Each of the 10 processed vendors is one of the original 12
    for (const r of results) expect(vendorIds).toContain(r.vendorId)
  })

  it('prioritizes vendors whose favicon_key stamp is old (including not yet fetched) when force=true (oldest-first)', async () => {
    // First make the 3 vendors "already fetched" together, with different stamps (fetch times)
    const older = await makeVendor('古い業者', {
      websiteUrl: 'https://older.example.com/',
      faviconKey: `vendors/dummy/favicon-${(Date.now() - 100_000).toString(36)}.png`,
    })
    const newer = await makeVendor('新しい業者', {
      websiteUrl: 'https://newer.example.com/',
      faviconKey: `vendors/dummy/favicon-${Date.now().toString(36)}.png`,
    })
    const neverFetched = await makeVendor('未取得業者', {
      websiteUrl: 'https://never.example.com/',
    })
    const { bucket } = fakeBucket()
    const order: string[] = []
    const fetchImpl = fakeFetch((url) => {
      const m = /^https:\/\/([a-z]+)\.example\.com\/$/.exec(url)
      if (m) {
        order.push(url)
        return new Response(`<link rel="icon" href="/icon.png">`, { status: 200 })
      }
      if (/\/icon\.png$/.test(url)) return new Response(PNG_BYTES, { status: 200 })
      return new Response('', { status: 404 })
    })

    const { results } = await refreshAllVendorFavicons(db, { force: true }, fetchImpl, bucket)
    expect(results).toHaveLength(3)
    // Processed first in the order: not yet fetched, then the oldest already fetched
    expect(order).toEqual([
      'https://never.example.com/',
      'https://older.example.com/',
      'https://newer.example.com/',
    ])
    expect(neverFetched).toBeTruthy()
    expect(older).toBeTruthy()
    expect(newer).toBeTruthy()
  })

  it('does not target vendors with favicon_source=manual when force=false (automatic updates do not overwrite a manual upload)', async () => {
    const manualVendor = await makeVendor('手動アイコン業者', {
      websiteUrl: 'https://manual.example.com/',
      faviconKey: 'vendors/manual/favicon-abc.png',
      faviconSource: 'manual',
    })
    const autoVendor = await makeVendor('自動取得対象業者', {
      websiteUrl: 'https://auto.example.com/',
    })
    const { bucket } = fakeBucket()
    const fetchImpl = fakeFetch((url) => {
      if (url === 'https://auto.example.com/') return new Response(HTML_WITH_ICON, { status: 200 })
      if (url === 'https://auto.example.com/icon.png')
        return new Response(PNG_BYTES, { status: 200 })
      // A fetch to manual.example.com should never get here (if it does, it was made a target)
      return new Response('', { status: 404 })
    })

    const { results } = await refreshAllVendorFavicons(db, { force: false }, fetchImpl, bucket)
    const ids = results.map((r) => r.vendorId)
    expect(ids).toContain(autoVendor)
    expect(ids).not.toContain(manualVendor)

    // The manually uploaded favicon_key/favicon_source stay as they are
    const [row] = await db.select().from(vendors).where(eq(vendors.id, manualVendor))
    expect(row.faviconKey).toBe('vendors/manual/favicon-abc.png')
    expect(row.faviconSource).toBe('manual')
  })

  it('also targets vendors with favicon_source=manual when force=true ("取り直す" (fetch again) allows overwriting)', async () => {
    const manualVendor = await makeVendor('取り直し対象手動業者', {
      websiteUrl: 'https://manual2.example.com/',
      faviconKey: 'vendors/manual/favicon-old.png',
      faviconSource: 'manual',
    })
    const { bucket } = fakeBucket()
    const fetchImpl = fakeFetch((url) => {
      if (url === 'https://manual2.example.com/')
        return new Response(HTML_WITH_ICON, { status: 200 })
      if (url === 'https://manual2.example.com/icon.png')
        return new Response(PNG_BYTES, { status: 200 })
      return null
    })

    const { results } = await refreshAllVendorFavicons(db, { force: true }, fetchImpl, bucket)
    expect(results.map((r) => r.vendorId)).toContain(manualVendor)
    const [row] = await db.select().from(vendors).where(eq(vendors.id, manualVendor))
    // It was fetched again with force, so favicon_source goes back to 'auto'
    expect(row.faviconSource).toBe('auto')
  })
})

describe('importRepresentativePhotoFromUrlCore', () => {
  it('puts JPEG/PNG/WebP under both the display and thumb R2 keys with the same bytes, and updates representative_photo_key', async () => {
    const vendorId = await makeVendor('写真取り込み業者')
    const { bucket, objects } = fakeBucket()
    const fetchImpl = fakeFetch((url) => {
      if (url === 'https://vendor.example.com/rep.png')
        return new Response(PNG_BYTES, { status: 200 })
      return null
    })

    const result = await importRepresentativePhotoFromUrlCore(
      db,
      vendorId,
      'https://vendor.example.com/rep.png',
      fetchImpl,
      bucket,
    )
    expect(result).toEqual({ ok: true, key: representativeDisplayKeyMatching(vendorId) })
    if (!result.ok) throw new Error('unreachable')
    const thumbKey = representativeThumbKeyFromDisplayKey(result.key)
    expect(objects.get(result.key)?.contentType).toBe('image/png')
    expect(objects.get(thumbKey)?.contentType).toBe('image/png')
    expect(objects.get(thumbKey)?.body).toEqual(PNG_BYTES)

    const [row] = await db.select().from(vendors).where(eq(vendors.id, vendorId))
    expect(row.representativePhotoKey).toBe(result.key)
  })

  it('deletes the previous display/thumb objects on replacement (the key has a different stamp every time, so they could become orphans)', async () => {
    const vendorId = await makeVendor('写真差し替え業者')
    const { bucket, deletedKeys } = fakeBucket()
    // Calling both times within the same millisecond can give the same stamp by chance with
    // the real clock, so inject a counter to make the stamp always differ
    let clock = 1_700_000_000_000
    const now = () => clock++
    const fetchImpl = fakeFetch((url) => {
      if (url === 'https://vendor.example.com/rep.png')
        return new Response(PNG_BYTES, { status: 200 })
      return null
    })

    const first = await importRepresentativePhotoFromUrlCore(
      db,
      vendorId,
      'https://vendor.example.com/rep.png',
      fetchImpl,
      bucket,
      now,
    )
    if (!first.ok) throw new Error('unreachable')

    const second = await importRepresentativePhotoFromUrlCore(
      db,
      vendorId,
      'https://vendor.example.com/rep.png',
      fetchImpl,
      bucket,
      now,
    )
    if (!second.ok) throw new Error('unreachable')

    expect(second.key).not.toBe(first.key)
    expect(deletedKeys).toEqual(
      expect.arrayContaining([first.key, representativeThumbKeyFromDisplayKey(first.key)]),
    )
  })

  it('returns failure without calling fetch for a disallowed URL (SSRF protection)', async () => {
    const vendorId = await makeVendor('内部URL業者2')
    const { bucket } = fakeBucket()
    let called = false
    const fetchImpl = (async () => {
      called = true
      return new Response(PNG_BYTES, { status: 200 })
    }) as typeof fetch

    const result = await importRepresentativePhotoFromUrlCore(
      db,
      vendorId,
      'https://192.168.1.1/rep.png',
      fetchImpl,
      bucket,
    )
    expect(called).toBe(false)
    expect(result).toEqual({ ok: false, error: 'URL が許可されていません' })
  })

  it('returns failure without fetch or R2 put for an id whose vendor does not exist (prevents orphan objects)', async () => {
    const { bucket, put } = fakeBucket()
    const nonExistentId = '99999999-9999-9999-9999-999999999999'
    let fetchCalled = false
    const fetchImpl = (async () => {
      fetchCalled = true
      return new Response(PNG_BYTES, { status: 200 })
    }) as typeof fetch

    const result = await importRepresentativePhotoFromUrlCore(
      db,
      nonExistentId,
      'https://vendor.example.com/rep.png',
      fetchImpl,
      bucket,
    )
    expect(result).toEqual({ ok: false, error: '業者が見つかりません' })
    expect(fetchCalled).toBe(false)
    expect(put).not.toHaveBeenCalled()
  })

  it('returns failure when it cannot be sniffed as an image', async () => {
    const vendorId = await makeVendor('非画像業者')
    const { bucket } = fakeBucket()
    const fetchImpl = fakeFetch((url) => {
      if (url === 'https://vendor.example.com/not-an-image.txt') {
        return new Response('plain text', { status: 200 })
      }
      return null
    })

    const result = await importRepresentativePhotoFromUrlCore(
      db,
      vendorId,
      'https://vendor.example.com/not-an-image.txt',
      fetchImpl,
      bucket,
    )
    expect(result).toEqual({ ok: false, error: '画像ファイルではありません（JPEG/PNG/WebP のみ）' })
  })

  it('cuts off the fetch and returns failure for a response over 5MB (content-length)', async () => {
    const vendorId = await makeVendor('巨大画像業者')
    const { bucket } = fakeBucket()
    const fetchImpl = fakeFetch((url) => {
      if (url === 'https://vendor.example.com/huge.png') {
        return new Response(PNG_BYTES, {
          status: 200,
          headers: { 'content-length': String(6 * 1024 * 1024) },
        })
      }
      return null
    })

    const result = await importRepresentativePhotoFromUrlCore(
      db,
      vendorId,
      'https://vendor.example.com/huge.png',
      fetchImpl,
      bucket,
    )
    expect(result).toEqual({
      ok: false,
      error: '画像を取得できませんでした（取得失敗、または上限 5MB 超過）',
    })
  })

  it('cuts off a stream over 5MB without content-length and returns failure (defense against a false or missing declaration)', async () => {
    const vendorId = await makeVendor('巨大画像ストリーム業者')
    const { bucket } = fakeBucket()
    const fetchImpl = (async (url: string | URL) => {
      if (String(url) === 'https://vendor.example.com/huge-stream.jpg') {
        // Stream more than MAX_IMPORTED_PHOTO_BYTES (5MB) without content-length
        return streamedResponse(5 * 1024 * 1024 + 1)
      }
      return new Response('', { status: 404 })
    }) as typeof fetch

    const result = await importRepresentativePhotoFromUrlCore(
      db,
      vendorId,
      'https://vendor.example.com/huge-stream.jpg',
      fetchImpl,
      bucket,
    )
    expect(result).toEqual({
      ok: false,
      error: '画像を取得できませんでした（取得失敗、または上限 5MB 超過）',
    })
  })

  it('returns failure even when fetch itself throws (does not rethrow)', async () => {
    const vendorId = await makeVendor('例外業者2')
    const { bucket } = fakeBucket()
    const fetchImpl = (async () => {
      throw new Error('network down')
    }) as typeof fetch

    const result = await importRepresentativePhotoFromUrlCore(
      db,
      vendorId,
      'https://vendor.example.com/rep.png',
      fetchImpl,
      bucket,
    )
    expect(result).toEqual({
      ok: false,
      error: '画像を取得できませんでした（取得失敗、または上限 5MB 超過）',
    })
  })
})

describe('deleteRepresentativePhotoObjects', () => {
  it('sets representative_photo_key to null and deletes the actual display/thumb keys stored in the DB (new format)', async () => {
    // The current key including the stamp cannot be reproduced from vendorId alone, so verify
    // that it reads the actual value stored in the DB (with the stamp) and then deletes (not
    // a hard-coded key based on vendorId)
    const vendorId = await makeVendor('削除対象業者')
    const storedKey = `vendors/${vendorId}/representative-1abc2d-display.jpg`
    await db
      .update(vendors)
      .set({ representativePhotoKey: storedKey })
      .where(eq(vendors.id, vendorId))
    const { bucket, deletedKeys } = fakeBucket()

    const result = await deleteRepresentativePhotoObjects(db, vendorId, bucket)

    expect(result).toEqual({ ok: true })
    const [row] = await db.select().from(vendors).where(eq(vendors.id, vendorId))
    expect(row.representativePhotoKey).toBeNull()
    expect(deletedKeys).toEqual(
      expect.arrayContaining([storedKey, `vendors/${vendorId}/representative-1abc2d-thumb.jpg`]),
    )
  })

  it('deletes the actual key even when a key in the old format (no stamp) is stored', async () => {
    const vendorId = await makeVendor('削除対象業者（旧形式）')
    const storedKey = `vendors/${vendorId}/representative-display.jpg`
    await db
      .update(vendors)
      .set({ representativePhotoKey: storedKey })
      .where(eq(vendors.id, vendorId))
    const { bucket, deletedKeys } = fakeBucket()

    const result = await deleteRepresentativePhotoObjects(db, vendorId, bucket)

    expect(result).toEqual({ ok: true })
    expect(deletedKeys).toEqual(
      expect.arrayContaining([storedKey, `vendors/${vendorId}/representative-thumb.jpg`]),
    )
  })

  it('does not call R2 delete for a vendor without a representative_photo_key (nothing to delete)', async () => {
    const vendorId = await makeVendor('写真なし業者')
    const { bucket, del } = fakeBucket()

    const result = await deleteRepresentativePhotoObjects(db, vendorId, bucket)

    expect(result).toEqual({ ok: true })
    expect(del).not.toHaveBeenCalled()
  })

  it('does nothing for an id whose vendor does not exist (returns failure without calling R2 delete)', async () => {
    const { bucket, del } = fakeBucket()
    const nonExistentId = '99999999-9999-9999-9999-999999999999'

    const result = await deleteRepresentativePhotoObjects(db, nonExistentId, bucket)

    expect(result).toEqual({ ok: false, error: '業者が見つかりません' })
    expect(del).not.toHaveBeenCalled()
  })
})

describe('uploadVendorFaviconCore', () => {
  it('uploads a PNG, updates favicon_key, and sets favicon_source to manual', async () => {
    const vendorId = await makeVendor('手動アップロード業者')
    const { bucket, objects } = fakeBucket()

    const result = await uploadVendorFaviconCore(db, vendorId, PNG_BYTES, bucket)
    expect(result).toEqual({ ok: true, key: faviconKeyMatching(vendorId, 'png') })
    if (!result.ok) throw new Error('unreachable')
    expect(objects.get(result.key)?.contentType).toBe('image/png')

    const [row] = await db.select().from(vendors).where(eq(vendors.id, vendorId))
    expect(row.faviconKey).toBe(result.key)
    expect(row.faviconSource).toBe('manual')
  })

  it('can also upload an ICO', async () => {
    const vendorId = await makeVendor('ICOアップロード業者')
    const { bucket, objects } = fakeBucket()

    const result = await uploadVendorFaviconCore(db, vendorId, ICO_BYTES, bucket)
    expect(result).toEqual({ ok: true, key: faviconKeyMatching(vendorId, 'ico') })
    if (!result.ok) throw new Error('unreachable')
    expect(objects.get(result.key)?.contentType).toBe('image/x-icon')
  })

  it('returns failure without calling R2 put for bytes over 512KB', async () => {
    const vendorId = await makeVendor('大きすぎアップロード業者')
    const { bucket, put } = fakeBucket()
    const big = new Uint8Array(512_001)
    big.set(PNG_BYTES)

    const result = await uploadVendorFaviconCore(db, vendorId, big, bucket)
    expect(result).toEqual({
      ok: false,
      error: '画像が大きすぎます（上限 512KB）',
    })
    expect(put).not.toHaveBeenCalled()
  })

  it('returns failure without calling R2 put for what cannot be sniffed as an image (SVG/text)', async () => {
    const vendorId = await makeVendor('SVGアップロード業者')
    const { bucket, put } = fakeBucket()
    const svgLike = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')

    const result = await uploadVendorFaviconCore(db, vendorId, svgLike, bucket)
    expect(result).toEqual({
      ok: false,
      error: '画像ファイルではありません（PNG/JPEG/WebP/ICO のみ）',
    })
    expect(put).not.toHaveBeenCalled()
  })

  it('returns failure without R2 put for an id whose vendor does not exist (prevents orphan objects)', async () => {
    const { bucket, put } = fakeBucket()
    const nonExistentId = '99999999-9999-9999-9999-999999999999'

    const result = await uploadVendorFaviconCore(db, nonExistentId, PNG_BYTES, bucket)
    expect(result).toEqual({ ok: false, error: '業者が見つかりません' })
    expect(put).not.toHaveBeenCalled()
  })

  it('deletes the previous favicon object on replacement (the key has a different stamp every time)', async () => {
    const vendorId = await makeVendor('favicon差し替え業者')
    const { bucket, deletedKeys } = fakeBucket()
    let clock = 1_700_000_000_000
    const now = () => clock++

    const first = await uploadVendorFaviconCore(db, vendorId, PNG_BYTES, bucket, now)
    if (!first.ok) throw new Error('unreachable')
    const second = await uploadVendorFaviconCore(db, vendorId, ICO_BYTES, bucket, now)
    if (!second.ok) throw new Error('unreachable')

    expect(second.key).not.toBe(first.key)
    expect(deletedKeys).toContain(first.key)
  })

  it('returns failure without rethrowing even when an unexpected exception is thrown', async () => {
    const vendorId = await makeVendor('アップロード例外業者')
    const throwingBucket = {
      put: vi.fn(async () => {
        throw new Error('R2 put failed')
      }),
    } as unknown as R2Bucket

    const result = await uploadVendorFaviconCore(db, vendorId, PNG_BYTES, throwingBucket)
    expect(result).toEqual({ ok: false, error: 'R2 put failed' })
  })
})

describe('deleteVendorFaviconObjects', () => {
  it('sets both favicon_key/favicon_source to NULL and deletes the favicon object in R2', async () => {
    const vendorId = await makeVendor('favicon削除業者')
    const storedKey = `vendors/${vendorId}/favicon-1abc2d.png`
    await db
      .update(vendors)
      .set({ faviconKey: storedKey, faviconSource: 'manual' })
      .where(eq(vendors.id, vendorId))
    const { bucket, deletedKeys } = fakeBucket()

    const result = await deleteVendorFaviconObjects(db, vendorId, bucket)

    expect(result).toEqual({ ok: true })
    const [row] = await db.select().from(vendors).where(eq(vendors.id, vendorId))
    expect(row.faviconKey).toBeNull()
    expect(row.faviconSource).toBeNull()
    expect(deletedKeys).toContain(storedKey)
  })

  it('does not call R2 delete for a vendor without a favicon_key (nothing to delete)', async () => {
    const vendorId = await makeVendor('favicon無し業者')
    const { bucket, del } = fakeBucket()

    const result = await deleteVendorFaviconObjects(db, vendorId, bucket)

    expect(result).toEqual({ ok: true })
    expect(del).not.toHaveBeenCalled()
  })

  it('does nothing for an id whose vendor does not exist (returns failure without calling R2 delete)', async () => {
    const { bucket, del } = fakeBucket()
    const nonExistentId = '99999999-9999-9999-9999-999999999999'

    const result = await deleteVendorFaviconObjects(db, nonExistentId, bucket)

    expect(result).toEqual({ ok: false, error: '業者が見つかりません' })
    expect(del).not.toHaveBeenCalled()
  })
})
