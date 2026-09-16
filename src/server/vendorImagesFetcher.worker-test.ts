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

// 鍵に stamp（base36 の Date.now()）が挟まるようになった（immutable キャッシュ対策）ので、
// 完全一致ではなく形だけを見る。asymmetric matcher として toEqual に直接埋め込める。
function faviconKeyMatching(vendorId: string, ext: string) {
  return expect.stringMatching(new RegExp(`^vendors/${vendorId}/favicon-[0-9a-z]+\\.${ext}$`))
}
function representativeDisplayKeyMatching(vendorId: string) {
  return expect.stringMatching(
    new RegExp(`^vendors/${vendorId}/representative-[0-9a-z]+-display\\.jpg$`),
  )
}

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
    expect(result).toEqual({ ok: true, key: faviconKeyMatching(vendorId, 'png') })
    if (!result.ok) throw new Error('unreachable')
    expect(objects.get(result.key)?.contentType).toBe('image/png')

    const [row] = await db.select().from(vendors).where(eq(vendors.id, vendorId))
    expect(row.faviconKey).toBe(result.key)
    // 自動取得は favicon_source を 'auto' にする（手動アップロードと区別するため）
    expect(row.faviconSource).toBe('auto')
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
    expect(result).toEqual({ ok: true, key: faviconKeyMatching(vendorId, 'ico') })
    if (!result.ok) throw new Error('unreachable')
    expect(objects.get(result.key)?.contentType).toBe('image/x-icon')
  })

  it('拡張子が変わっても・同じ拡張子でも、差し替えたら前の favicon オブジェクトを消す（鍵は毎回 stamp が違う）', async () => {
    const vendorId = await makeVendor('拡張子変更業者')
    const { bucket, deletedKeys } = fakeBucket()
    // 2 回とも同じミリ秒内に呼ぶと実時計では偶然同じ stamp になりうるので、
    // カウンタを注入して stamp が必ず違う値になるようにする（fetchFaviconForVendor の now 引数）
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
    expect(result).toEqual({ ok: true, key: faviconKeyMatching(vendorId, 'ico') })
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
    expect(result).toEqual({ ok: true, key: faviconKeyMatching(vendorId, 'png') })
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
    expect(result).toEqual({ ok: true, key: faviconKeyMatching(vendorId, 'ico') })
    if (!result.ok) throw new Error('unreachable')
    expect(objects.get(result.key)?.contentType).toBe('image/x-icon')
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
    expect(result).toEqual({ ok: true, key: faviconKeyMatching(vendorId, 'ico') })
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

    const { results } = await refreshAllVendorFavicons(db, { force: true }, fetchImpl, bucket)
    expect(results).toEqual([
      { vendorId, vendorName: '取り直し業者', ok: true, key: faviconKeyMatching(vendorId, 'png') },
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

  it('1 回の呼び出しでは最大 10 社までしか処理せず、残りは remaining で返す', async () => {
    // 未取得の業者を 12 社作る（force=false）
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
    // 処理した 10 社はすべて元の 12 社のうちのどれか
    for (const r of results) expect(vendorIds).toContain(r.vendorId)
  })

  it('force=true では favicon_key の stamp が古い（未取得含む）業者から優先する（oldest-first）', async () => {
    // 先に 3 社をまとめて「取得済み」にし、stamp（取得時刻）に差を付ける
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
    // 未取得・最も古い取得済みの順で先に処理される
    expect(order).toEqual([
      'https://never.example.com/',
      'https://older.example.com/',
      'https://newer.example.com/',
    ])
    expect(neverFetched).toBeTruthy()
    expect(older).toBeTruthy()
    expect(newer).toBeTruthy()
  })

  it('force=false は favicon_source=manual の業者を対象にしない（手動アップロードは自動更新で上書きしない）', async () => {
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
      // manual.example.com への fetch はここまで来ないはず（来たら候補にされている）
      return new Response('', { status: 404 })
    })

    const { results } = await refreshAllVendorFavicons(db, { force: false }, fetchImpl, bucket)
    const ids = results.map((r) => r.vendorId)
    expect(ids).toContain(autoVendor)
    expect(ids).not.toContain(manualVendor)

    // 手動アップロードした favicon_key/favicon_source はそのまま残る
    const [row] = await db.select().from(vendors).where(eq(vendors.id, manualVendor))
    expect(row.faviconKey).toBe('vendors/manual/favicon-abc.png')
    expect(row.faviconSource).toBe('manual')
  })

  it('force=true は favicon_source=manual の業者も対象にする（「取り直す」は上書きを許す）', async () => {
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
    // force で再取得できたので favicon_source は 'auto' に戻る
    expect(row.faviconSource).toBe('auto')
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
    expect(result).toEqual({ ok: true, key: representativeDisplayKeyMatching(vendorId) })
    if (!result.ok) throw new Error('unreachable')
    const thumbKey = representativeThumbKeyFromDisplayKey(result.key)
    expect(objects.get(result.key)?.contentType).toBe('image/png')
    expect(objects.get(thumbKey)?.contentType).toBe('image/png')
    expect(objects.get(thumbKey)?.body).toEqual(PNG_BYTES)

    const [row] = await db.select().from(vendors).where(eq(vendors.id, vendorId))
    expect(row.representativePhotoKey).toBe(result.key)
  })

  it('差し替えると前の display/thumb オブジェクトを消す（鍵は毎回 stamp が違うので孤児になりうる）', async () => {
    const vendorId = await makeVendor('写真差し替え業者')
    const { bucket, deletedKeys } = fakeBucket()
    // 2 回とも同じミリ秒内に呼ぶと実時計では偶然同じ stamp になりうるので、
    // カウンタを注入して stamp が必ず違う値になるようにする
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
  it('representative_photo_key を null にし、DB に保存されている実際の display/thumb キーを消す（新形式）', async () => {
    // vendorId だけからは stamp 込みの現在のキーを再現できないので、DB に保存された
    // 実際の値（stamp 入り）を読んでから消すことを検証する（vendorId ベースの決め打ちではない）
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

  it('旧形式（stamp 無し）のキーが保存されていても、その実際のキーを消す', async () => {
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

  it('representative_photo_key が無い業者には R2 delete を呼ばない（消すものが無い）', async () => {
    const vendorId = await makeVendor('写真なし業者')
    const { bucket, del } = fakeBucket()

    const result = await deleteRepresentativePhotoObjects(db, vendorId, bucket)

    expect(result).toEqual({ ok: true })
    expect(del).not.toHaveBeenCalled()
  })

  it('業者が存在しない id には何もしない（R2 delete を呼ばずに失敗を返す）', async () => {
    const { bucket, del } = fakeBucket()
    const nonExistentId = '99999999-9999-9999-9999-999999999999'

    const result = await deleteRepresentativePhotoObjects(db, nonExistentId, bucket)

    expect(result).toEqual({ ok: false, error: '業者が見つかりません' })
    expect(del).not.toHaveBeenCalled()
  })
})

describe('uploadVendorFaviconCore', () => {
  it('PNG をアップロードして favicon_key を更新し、favicon_source を manual にする', async () => {
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

  it('ICO もアップロードできる', async () => {
    const vendorId = await makeVendor('ICOアップロード業者')
    const { bucket, objects } = fakeBucket()

    const result = await uploadVendorFaviconCore(db, vendorId, ICO_BYTES, bucket)
    expect(result).toEqual({ ok: true, key: faviconKeyMatching(vendorId, 'ico') })
    if (!result.ok) throw new Error('unreachable')
    expect(objects.get(result.key)?.contentType).toBe('image/x-icon')
  })

  it('512KB を超えるバイト列は R2 put を呼ばずに失敗を返す', async () => {
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

  it('画像として sniff できない（SVG/テキスト）は R2 put を呼ばずに失敗を返す', async () => {
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

  it('業者が存在しない id には R2 put を行わず失敗を返す（孤児オブジェクト対策）', async () => {
    const { bucket, put } = fakeBucket()
    const nonExistentId = '99999999-9999-9999-9999-999999999999'

    const result = await uploadVendorFaviconCore(db, nonExistentId, PNG_BYTES, bucket)
    expect(result).toEqual({ ok: false, error: '業者が見つかりません' })
    expect(put).not.toHaveBeenCalled()
  })

  it('差し替えると前の favicon オブジェクトを消す（鍵は毎回 stamp が違う）', async () => {
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

  it('予期しない例外が飛んでも投げ直さず失敗を返す', async () => {
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
  it('favicon_key/favicon_source を両方 NULL にし、R2 のファビコンオブジェクトを消す', async () => {
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

  it('favicon_key が無い業者には R2 delete を呼ばない（消すものが無い）', async () => {
    const vendorId = await makeVendor('favicon無し業者')
    const { bucket, del } = fakeBucket()

    const result = await deleteVendorFaviconObjects(db, vendorId, bucket)

    expect(result).toEqual({ ok: true })
    expect(del).not.toHaveBeenCalled()
  })

  it('業者が存在しない id には何もしない（R2 delete を呼ばずに失敗を返す）', async () => {
    const { bucket, del } = fakeBucket()
    const nonExistentId = '99999999-9999-9999-9999-999999999999'

    const result = await deleteVendorFaviconObjects(db, nonExistentId, bucket)

    expect(result).toEqual({ ok: false, error: '業者が見つかりません' })
    expect(del).not.toHaveBeenCalled()
  })
})
