import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { vendors } from '../db/schema'
import { upsertVendor } from './repository/candidates'
import { actor, db, reset } from './repository/test-helpers'
import {
  deleteRepresentativePhotoObjects,
  fetchFaviconForVendor,
  importRepresentativePhotoFromUrlCore,
  refreshAllVendorFavicons,
} from './vendorImagesFetcher'

beforeEach(reset)

async function makeVendor(name: string, overrides: Record<string, unknown> = {}) {
  return upsertVendor(db, { name, kind: 'koumuten', serviceAreas: [], ...overrides }, actor)
}

/** put(key, bytes, opts) / delete(keys) だけを記録するフェイク R2。実際のベンダーサイトは一切叩かない。 */
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

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const ICO_BYTES = new Uint8Array([0x00, 0x00, 0x01, 0x00, 1, 0])
const HTML_WITH_ICON = '<html><head><link rel="icon" href="/icon.png"></head></html>'

describe('fetchFaviconForVendor', () => {
  it('HTML の <link rel="icon"> を辿って画像を R2 に置き、favicon_key を更新する', async () => {
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
    expect(result).toEqual({ ok: true, key: `vendors/${vendorId}/favicon.png` })
    expect(objects.get(`vendors/${vendorId}/favicon.png`)?.contentType).toBe('image/png')

    const [row] = await db.select().from(vendors).where(eq(vendors.id, vendorId))
    expect(row.faviconKey).toBe(`vendors/${vendorId}/favicon.png`)
  })

  it('candidate が画像として sniff できなければ次を試し、全滅なら失敗を返す', async () => {
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

  it('許可されない URL（SSRF 対策）は fetch を呼ばずに失敗を返す', async () => {
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

  it('トップページの取得自体に失敗しても favicon.ico の保険を試す', async () => {
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
    expect(result).toEqual({ ok: true, key: `vendors/${vendorId}/favicon.ico` })
    expect(objects.get(`vendors/${vendorId}/favicon.ico`)?.contentType).toBe('image/x-icon')
  })

  it('拡張子が変わったら前の favicon オブジェクトを消す', async () => {
    const vendorId = await makeVendor('拡張子変更業者')
    const { bucket, deletedKeys } = fakeBucket()
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
    )
    expect(first).toEqual({ ok: true, key: `vendors/${vendorId}/favicon.png` })

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
    )
    expect(second).toEqual({ ok: true, key: `vendors/${vendorId}/favicon.ico` })
    expect(deletedKeys).toContain(`vendors/${vendorId}/favicon.png`)
  })

  it('予期しない例外が飛んでも投げ直さず失敗を返す', async () => {
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

  it('許可されないホストへのリダイレクト（HTML 取得中）はそのホストへ fetch されず、favicon.ico の保険へフォールバックする', async () => {
    const vendorId = await makeVendor('リダイレクトSSRF業者')
    const { bucket } = fakeBucket()
    let blockedHostFetched = false
    const fetchImpl = (async (url: string | URL) => {
      if (String(url) === 'https://vendor.example.com/') {
        // 内部 IP リテラルへ誘導しようとするリダイレクト
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
    // HTML 取得は失敗扱い（html=''）になるが、favicon.ico の保険は
    // pickFaviconCandidates('', websiteUrl) からも常に得られるので取得自体は成功する
    expect(result).toEqual({ ok: true, key: `vendors/${vendorId}/favicon.ico` })
  })

  it('許可されたホストへのリダイレクト（HTML 取得中）は追従して候補を拾える', async () => {
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
      // 相対 href（/icon.png）はリダイレクト後の finalUrl 基準で解決される
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
    expect(result).toEqual({ ok: true, key: `vendors/${vendorId}/favicon.png` })
  })
})

describe('refreshAllVendorFavicons', () => {
  it('force=false なら favicon_key が無い業者だけを対象にする', async () => {
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

    const results = await refreshAllVendorFavicons(db, { force: false }, fetchImpl, bucket)
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      vendorId: withoutFavicon,
      vendorName: '未取得業者',
      ok: true,
      key: `vendors/${withoutFavicon}/favicon.png`,
    })
    expect(withFavicon).toBeTruthy()
  })

  it('force=true なら favicon_key が既にある業者も対象にする（取り直す）', async () => {
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

    const results = await refreshAllVendorFavicons(db, { force: true }, fetchImpl, bucket)
    expect(results).toEqual([
      { vendorId, vendorName: '取り直し業者', ok: true, key: `vendors/${vendorId}/favicon.png` },
    ])
  })

  it('website_url が無い業者は対象外、1 社の失敗は他の業者を止めない', async () => {
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

    const results = await refreshAllVendorFavicons(db, { force: false }, fetchImpl, bucket)
    const byId = new Map(results.map((r) => [r.vendorId, r]))
    expect(byId.size).toBe(2)
    expect(byId.get(failing)?.ok).toBe(false)
    expect(byId.get(ok)).toEqual({
      vendorId: ok,
      vendorName: '成功業者',
      ok: true,
      key: `vendors/${ok}/favicon.png`,
    })
  })
})

describe('importRepresentativePhotoFromUrlCore', () => {
  it('JPEG/PNG/WebP を display/thumb 両方の R2 キーへ同じバイト列で置き、representative_photo_key を更新する', async () => {
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
    expect(result).toEqual({ ok: true, key: `vendors/${vendorId}/representative-display.jpg` })
    expect(objects.get(`vendors/${vendorId}/representative-display.jpg`)?.contentType).toBe(
      'image/png',
    )
    expect(objects.get(`vendors/${vendorId}/representative-thumb.jpg`)?.contentType).toBe(
      'image/png',
    )
    expect(objects.get(`vendors/${vendorId}/representative-thumb.jpg`)?.body).toEqual(PNG_BYTES)

    const [row] = await db.select().from(vendors).where(eq(vendors.id, vendorId))
    expect(row.representativePhotoKey).toBe(`vendors/${vendorId}/representative-display.jpg`)
  })

  it('許可されない URL（SSRF 対策）は fetch を呼ばずに失敗を返す', async () => {
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

  it('画像として sniff できなければ失敗を返す', async () => {
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

  it('5MB を超えるレスポンス（content-length）は取得を打ち切って失敗を返す', async () => {
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

  it('fetch 自体が例外を投げても失敗を返す（投げ直さない）', async () => {
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
  it('representative_photo_key を null にし、R2 の display/thumb 両方を消す', async () => {
    const vendorId = await makeVendor('削除対象業者', {
      representativePhotoKey: `vendors/dummy/representative-display.jpg`,
    })
    const { bucket, deletedKeys } = fakeBucket()

    await deleteRepresentativePhotoObjects(db, vendorId, bucket)

    const [row] = await db.select().from(vendors).where(eq(vendors.id, vendorId))
    expect(row.representativePhotoKey).toBeNull()
    expect(deletedKeys).toEqual(
      expect.arrayContaining([
        `vendors/${vendorId}/representative-display.jpg`,
        `vendors/${vendorId}/representative-thumb.jpg`,
      ]),
    )
  })
})
