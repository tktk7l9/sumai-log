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

/**
 * `content-length` ヘッダを付けずに合計 `totalBytes` を小分けのチャンクで流す Response を作る。
 * readCapped（vendorImagesFetcher.ts）は content-length が無いとき、チャンクを読みながら
 * 合計を数えて上限超過時点で打ち切る。相手が Content-Length を出さない／詐称する場合の
 * 防御はこの経路でしか検証できない（content-length ヘッダ経由の上限テストとは別物）。
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

  it('候補が 6 件を超える HTML でも外向き fetch は HTML 1 回 + 候補最大 6 回 = 最大 7 回に収まる', async () => {
    const vendorId = await makeVendor('候補大量業者')
    const { bucket } = fakeBucket()
    // rel=icon を 10 個宣言（全部 sizes 無し = 同順位。favicon.ico の保険を含めても
    // pickFaviconCandidates は上位 5 件 + 保険の最大 6 件までしか返さない）
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
      // 候補・保険とも全部「画像として使えない」ことにして、最後まで（=上限まで）試させる
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
    // HTML 1 回 + 候補 6 回（宣言 5 + favicon.ico の保険）= 最大 7 回
    expect(fetchCount).toBeLessThanOrEqual(7)
    expect(requestedCandidateUrls.length).toBeLessThanOrEqual(6)
    // 10 個宣言したうち、後半（icon-5〜icon-9）は上限に切られて一度も fetch されない
    expect(requestedCandidateUrls).not.toContain('https://vendor.example.com/icon-9.png')
  })

  it('HTML 取得が content-length 無しで 1MB を超えるストリームなら打ち切り、favicon.ico の保険にフォールバックする', async () => {
    const vendorId = await makeVendor('HTML上限ストリーム業者')
    const { bucket, objects } = fakeBucket()
    let declaredCandidateFetched = false
    const fetchImpl = (async (url: string | URL) => {
      const u = String(url)
      if (u === 'https://vendor.example.com/') {
        // HTML_MAX_BYTES（1_000_000）を超える量を content-length 無しで流す。
        // 中身がどんな HTML であっても、打ち切られれば html='' 扱いになり、
        // 宣言された候補（後述の icon.png）は一度も fetch されないはず
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
    expect(result).toEqual({ ok: true, key: `vendors/${vendorId}/favicon.ico` })
    expect(objects.get(`vendors/${vendorId}/favicon.ico`)?.contentType).toBe('image/x-icon')
    expect(declaredCandidateFetched).toBe(false)
  })

  it('favicon 候補が content-length 無しで 512KB を超えるストリームなら破棄し、次の候補（保険）を試す', async () => {
    const vendorId = await makeVendor('favicon上限ストリーム業者')
    const { bucket } = fakeBucket()
    const fetchImpl = (async (url: string | URL) => {
      const u = String(url)
      if (u === 'https://vendor.example.com/') return new Response(HTML_WITH_ICON, { status: 200 })
      if (u === 'https://vendor.example.com/icon.png') {
        // ICON_MAX_BYTES（512_000）を超える量を content-length 無しで流す
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
    expect(result).toEqual({ ok: true, key: `vendors/${vendorId}/favicon.ico` })
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

  it('業者が存在しない id には fetch も R2 put も行わず失敗を返す（孤児オブジェクト対策）', async () => {
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

  it('content-length 無しで 5MB を超えるストリームは打ち切って失敗を返す（詐称・無申告への防御）', async () => {
    const vendorId = await makeVendor('巨大画像ストリーム業者')
    const { bucket } = fakeBucket()
    const fetchImpl = (async (url: string | URL) => {
      if (String(url) === 'https://vendor.example.com/huge-stream.jpg') {
        // MAX_IMPORTED_PHOTO_BYTES（5MB）を超える量を content-length 無しで流す
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

    const result = await deleteRepresentativePhotoObjects(db, vendorId, bucket)

    expect(result).toEqual({ ok: true })
    const [row] = await db.select().from(vendors).where(eq(vendors.id, vendorId))
    expect(row.representativePhotoKey).toBeNull()
    expect(deletedKeys).toEqual(
      expect.arrayContaining([
        `vendors/${vendorId}/representative-display.jpg`,
        `vendors/${vendorId}/representative-thumb.jpg`,
      ]),
    )
  })

  it('業者が存在しない id には何もしない（R2 delete を呼ばずに失敗を返す）', async () => {
    const { bucket, del } = fakeBucket()
    const nonExistentId = '99999999-9999-9999-9999-999999999999'

    const result = await deleteRepresentativePhotoObjects(db, nonExistentId, bucket)

    expect(result).toEqual({ ok: false, error: '業者が見つかりません' })
    expect(del).not.toHaveBeenCalled()
  })
})
