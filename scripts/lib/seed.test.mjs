import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildStatements,
  normalizeAddress,
  normalizeSocialUrls,
  parseGsiResponse,
  slugToId,
  sqlString,
} from './seed.mjs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

test('slugToId は UUID 形式の文字列を返す', () => {
  assert.match(slugToId('vendor:acme-koumuten'), UUID_RE)
})

test('slugToId は同じ slug から常に同じ id を返す（冪等取り込みの前提）', () => {
  assert.equal(slugToId('vendor:acme-koumuten'), slugToId('vendor:acme-koumuten'))
})

test('slugToId は異なる slug から異なる id を返す', () => {
  assert.notEqual(slugToId('vendor:acme-koumuten'), slugToId('vendor:other-koumuten'))
})

test("sqlString は文字列中の ' を '' にエスケープする", () => {
  assert.equal(sqlString("O'Reilly's House"), "'O''Reilly''s House'")
})

test('sqlString は null/undefined を NULL にする', () => {
  assert.equal(sqlString(null), 'NULL')
  assert.equal(sqlString(undefined), 'NULL')
})

test('sqlString は真偽値を 0/1 にする', () => {
  assert.equal(sqlString(true), '1')
  assert.equal(sqlString(false), '0')
})

test('sqlString は数値をそのまま出す（クォートしない）', () => {
  assert.equal(sqlString(42), '42')
  assert.equal(sqlString(1.5), '1.5')
})

test('normalizeAddress は 全角数字/丁目番号 を 半角ハイフン区切りに正規化する', () => {
  assert.equal(normalizeAddress('架空市架空町1丁目2番3号'), '架空市架空町1-2-3')
  assert.equal(normalizeAddress('架空市架空町1丁目2番'), '架空市架空町1-2')
})

test('normalizeAddress は全角数字と空白を正規化する', () => {
  assert.equal(normalizeAddress('架空市 架空町１丁目２番３号'), '架空市架空町1-2-3')
})

test('normalizeAddress はダッシュ類を半角ハイフンに揃える', () => {
  assert.equal(normalizeAddress('架空市架空町1－2－3'), '架空市架空町1-2-3')
  assert.equal(normalizeAddress('架空市架空町1ー2ー3'), '架空市架空町1-2-3')
})

test('normalizeAddress は null/undefined/空文字をそのまま返す', () => {
  assert.equal(normalizeAddress(null), null)
  assert.equal(normalizeAddress(undefined), undefined)
  assert.equal(normalizeAddress(''), '')
})

// 以下 3 件は src/lib/geocode.ts の normalizeAddress.test.ts と同じケース。
// geocode_cache のキーがアプリ本体と一致し続けることを保証するため、挙動を丸ごと揃える。
test('normalizeAddress: 全角英数を半角に、空白を除き、丁目・番地の表記ゆれを揃える（src/lib/geocode.ts と同じ挙動）', () => {
  assert.equal(normalizeAddress(' 仮想県 テスト市 １－２－３ '), '仮想県テスト市1-2-3')
  assert.equal(normalizeAddress('仮想県テスト市1丁目2番3号'), '仮想県テスト市1-2-3')
  assert.equal(normalizeAddress('仮想県テスト市1丁目'), '仮想県テスト市1丁目')
})

test('normalizeAddress: 「号」「地」が省略された表記も丁目番地表記に揃える', () => {
  assert.equal(normalizeAddress('架空町1丁目2番3'), '架空町1-2-3')
  assert.equal(normalizeAddress('架空町1丁目2番地'), '架空町1-2')
})

// normalizeSocialUrls も src/lib/social.ts と同じ挙動にする（trim・空/非 http 除外・重複除去・最大 10 件）。
test('normalizeSocialUrls: 空白除去・空と非 http を除外・重複除去・10 件まで（src/lib/social.ts と同じ挙動）', () => {
  assert.deepEqual(
    normalizeSocialUrls([
      ' https://www.instagram.com/example/ ',
      '',
      'ftp://example.com',
      'https://www.instagram.com/example/',
      'https://x.com/example',
    ]),
    ['https://www.instagram.com/example/', 'https://x.com/example'],
  )
  assert.equal(
    normalizeSocialUrls(Array.from({ length: 12 }, (_, i) => `https://example.com/${i}`)).length,
    10,
  )
})

test('normalizeSocialUrls: 未指定（undefined/null）は空配列を返す', () => {
  assert.deepEqual(normalizeSocialUrls(undefined), [])
  assert.deepEqual(normalizeSocialUrls(null), [])
})

// parseGsiResponse も src/lib/geocode.ts と同じ判定（範囲チェック込み）にする。
test('parseGsiResponse: 先頭の Feature の座標（[lng, lat]）と title を返す', () => {
  const json = [
    {
      geometry: { type: 'Point', coordinates: [139.5, 35.5] },
      properties: { title: '仮想県テスト市' },
    },
    { geometry: { type: 'Point', coordinates: [140, 36] }, properties: { title: '別の候補' } },
  ]
  assert.deepEqual(parseGsiResponse(json), { lat: 35.5, lng: 139.5, title: '仮想県テスト市' })
})

test('parseGsiResponse: title が無ければ null にする', () => {
  assert.deepEqual(parseGsiResponse([{ geometry: { coordinates: [139.5, 35.5] } }]), {
    lat: 35.5,
    lng: 139.5,
    title: null,
  })
})

test('parseGsiResponse: 空配列・配列でない・座標が数値でない・範囲外は null', () => {
  assert.equal(parseGsiResponse([]), null)
  assert.equal(parseGsiResponse({}), null)
  assert.equal(parseGsiResponse(null), null)
  assert.equal(parseGsiResponse([{ geometry: { coordinates: ['a', 'b'] } }]), null)
  assert.equal(parseGsiResponse([{ geometry: { coordinates: [139.5] } }]), null)
  assert.equal(parseGsiResponse([{ geometry: { coordinates: [200, 35] } }]), null) // lng 範囲外
  assert.equal(parseGsiResponse([{ geometry: { coordinates: [139.5, 95] } }]), null) // lat 範囲外
})

function fictionalSeed(overrides = {}) {
  return {
    settings: { homeAreas: ['架空市'] },
    vendors: [
      {
        slug: 'vendor-a',
        name: '架空工務店A',
        kind: 'koumuten',
        hq: '架空県架空市',
        serviceAreas: ['架空市', '隣町'],
        uaValue: 0.46,
        cValuePublished: true,
        seismicGrade: 3,
        longTermCertified: true,
        structure: '木造軸組',
        features: '高気密高断熱',
        status: 'shortlisted',
        websiteUrl: 'https://vendor-a.example.com',
        sourceUrl: 'https://vendor-a.example.com/source',
        socialUrls: ['https://www.instagram.com/example/', 'https://x.com/example'],
        newsUrl: 'https://news.example.com/feed/',
        newsSource: 'rss',
      },
      {
        slug: 'vendor-b',
        name: '架空ハウス',
        kind: 'hm',
        serviceAreas: [],
        status: 'interested',
      },
    ],
    places: [
      {
        slug: 'place-a',
        name: '架空ショールーム',
        kind: 'showroom',
        address: '架空市架空町1丁目2番3号',
        vendor: 'vendor-a',
        note: 'メモ',
      },
    ],
    events: [
      {
        slug: 'event-a',
        title: '見学予定',
        kind: 'visit',
        startsAt: '2026-01-01T10:00:00+09:00',
        endsAt: '2026-01-01T11:00:00+09:00',
        allDay: false,
        place: 'place-a',
        vendor: 'vendor-a',
        note: null,
      },
    ],
    visits: [
      {
        slug: 'visit-a',
        event: 'event-a',
        place: 'place-a',
        vendor: 'vendor-a',
        visitedOn: '2026-01-01',
        attendees: 'both',
        photos: ['seed.local/photos/fake-1.HEIC', 'seed.local/photos/fake-2.HEIC'],
      },
    ],
    videos: [
      {
        url: 'https://www.youtube.com/watch?v=fakeVideoId1',
        videoId: 'fakeVideoId1',
        title: '架空の動画',
        channel: '架空チャンネル',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        watchedOn: '2026-01-02',
        watchedBy: 'both',
        tags: ['タグ1', 'タグ2'],
        vendor: 'vendor-a',
      },
    ],
    ...overrides,
  }
}

test('buildStatements: settings の INSERT ... ON CONFLICT(key) DO UPDATE 文が含まれる', () => {
  const { sql } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  const stmt = sql.find((s) => s.includes('INTO settings'))
  assert.ok(stmt, 'settings statement が見つからない')
  assert.match(stmt, /^INSERT INTO settings/)
  assert.match(stmt, /ON CONFLICT\(key\) DO UPDATE SET/)
  assert.doesNotMatch(stmt, /OR REPLACE/)
  assert.match(stmt, /'homeAreas'/)
  assert.match(stmt, /\["架空市"\]/)
})

test('buildStatements: vendors/places/events/visits/videos は INSERT ... ON CONFLICT(id) DO UPDATE 文が生成される（OR REPLACE は使わない）', () => {
  const { sql } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  // settings だけ主キーが key なので別テストで見る。ここでは id が主キーのテーブルだけ見る。
  const idKeyedStatements = sql.filter((s) => !s.includes('INTO settings'))
  assert.ok(idKeyedStatements.some((s) => s.includes('INTO vendors')))
  assert.ok(idKeyedStatements.some((s) => s.includes('INTO places')))
  assert.ok(idKeyedStatements.some((s) => s.includes('INTO events')))
  assert.ok(idKeyedStatements.some((s) => s.includes('INTO visits')))
  assert.ok(idKeyedStatements.some((s) => s.includes('INTO videos')))
  for (const stmt of idKeyedStatements) {
    assert.match(stmt, /^INSERT INTO/)
    assert.match(stmt, /ON CONFLICT\(id\) DO UPDATE SET/)
    assert.doesNotMatch(stmt, /OR REPLACE/)
  }
})

test('buildStatements: vendors の ON CONFLICT DO UPDATE は created_by/created_at を更新対象から除く（他の列は更新する）', () => {
  const { sql } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  const vendorStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空工務店A'))
  assert.ok(vendorStmt, 'vendor-a の statement が見つからない')
  assert.doesNotMatch(vendorStmt, /created_by = excluded\.created_by/)
  assert.doesNotMatch(vendorStmt, /created_at = excluded\.created_at/)
  assert.match(vendorStmt, /name = excluded\.name/)
  assert.match(vendorStmt, /updated_at = excluded\.updated_at/)
})

test('buildStatements: created_by に actorEmail が入る', () => {
  const { sql } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  const vendorStmt = sql.find((s) => s.includes('INTO vendors'))
  assert.match(vendorStmt, /'owner@example\.com'/)
})

test('buildStatements: serviceAreas/tags は JSON 文字列としてシリアライズされる', () => {
  const { sql } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  const vendorStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空工務店A'))
  assert.ok(vendorStmt, 'vendor-a の statement が見つからない')
  assert.match(vendorStmt, /\["架空市","隣町"\]/)
  const videoStmt = sql.find((s) => s.includes('INTO videos'))
  assert.match(videoStmt, /\["タグ1","タグ2"\]/)
})

test('buildStatements: vendor の socialUrls は JSON 文字列になり、無指定なら空配列になる', () => {
  const { sql } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  const vendorAStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空工務店A'))
  assert.ok(vendorAStmt, 'vendor-a の statement が見つからない')
  assert.match(
    vendorAStmt,
    /\["https:\/\/www\.instagram\.com\/example\/","https:\/\/x\.com\/example"\]/,
  )
  const vendorBStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空ハウス'))
  assert.ok(vendorBStmt, 'vendor-b の statement が見つからない')
  assert.match(vendorBStmt, /'\[\]'/)
})

test('buildStatements: vendor の newsUrl/newsSource が指定されれば vendors INSERT に入る', () => {
  const { sql } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  const vendorAStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空工務店A'))
  assert.ok(vendorAStmt, 'vendor-a の statement が見つからない')
  assert.match(vendorAStmt, /'https:\/\/news\.example\.com\/feed\/'/)
  assert.match(vendorAStmt, /'rss'/)
})

test('buildStatements: vendor の newsUrl/newsSource が未指定なら NULL になる', () => {
  const { sql } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  const vendorBStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空ハウス'))
  assert.ok(vendorBStmt, 'vendor-b の statement が見つからない')
  // social_urls の直後（news_url, news_source の列位置）に NULL, NULL が並ぶ。
  // representative_photo_key は representativePhotoReady に無いので列ごと出ない（Finding 3 参照）
  assert.match(vendorBStmt, /'\[\]', NULL, NULL, 'owner@example\.com'/)
})

test('buildStatements: newsSource に html-list を指定できる', () => {
  const seed = fictionalSeed()
  seed.vendors[1].newsUrl = 'https://www.example-koumuten.co.jp/'
  seed.vendors[1].newsSource = 'html-list'
  const { sql } = buildStatements(seed, { actorEmail: 'owner@example.com' })
  const vendorBStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空ハウス'))
  assert.match(vendorBStmt, /'html-list'/)
})

test('buildStatements: newsSource が rss/html-list 以外なら例外（slug と値を含む）', () => {
  const seed = fictionalSeed()
  seed.vendors[0].newsSource = 'atom'
  assert.throws(() => buildStatements(seed, { actorEmail: 'owner@example.com' }), /vendor-a.*atom/s)
})

test('buildStatements: vendor の representative/affiliations が指定されれば vendors INSERT に入る', () => {
  const seed = fictionalSeed()
  seed.vendors[0].representative = '山田太郎'
  seed.vendors[0].affiliations = ['iedukuri100', 'miratsugu']
  const { sql } = buildStatements(seed, { actorEmail: 'owner@example.com' })
  const vendorAStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空工務店A'))
  assert.ok(vendorAStmt, 'vendor-a の statement が見つからない')
  assert.match(vendorAStmt, /'山田太郎'/)
  assert.match(vendorAStmt, /\["iedukuri100","miratsugu"\]/)
})

test('buildStatements: vendor の representative/affiliations が未指定なら NULL / 空配列になる', () => {
  const { sql } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  const vendorBStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空ハウス'))
  assert.ok(vendorBStmt, 'vendor-b の statement が見つからない')
  assert.match(vendorBStmt, /hq, representative, service_areas, affiliations/)
  assert.match(vendorBStmt, /NULL, NULL, '\[\]', '\[\]'/)
})

test('buildStatements: affiliations に未知の id が混ざると例外（slug と値を含む）', () => {
  const seed = fictionalSeed()
  seed.vendors[0].affiliations = ['iedukuri100', 'no-such-group']
  assert.throws(
    () => buildStatements(seed, { actorEmail: 'owner@example.com' }),
    /vendor-a.*no-such-group/s,
  )
})

test('buildStatements: vendor の affiliationLinks が指定されれば vendors INSERT に JSON で入る', () => {
  const seed = fictionalSeed()
  seed.vendors[0].affiliationLinks = {
    'kouzou-cram': { url: 'https://kouzou-cram.com/partnermap/example/', note: '構造 ★★★' },
  }
  const { sql } = buildStatements(seed, { actorEmail: 'owner@example.com' })
  const vendorAStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空工務店A'))
  assert.ok(vendorAStmt, 'vendor-a の statement が見つからない')
  assert.match(
    vendorAStmt,
    /\{"kouzou-cram":\{"url":"https:\/\/kouzou-cram\.com\/partnermap\/example\/","note":"構造 ★★★"\}\}/,
  )
})

test('buildStatements: affiliationLinks が未指定なら空オブジェクトになる（許容する）', () => {
  const { sql } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  const vendorBStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空ハウス'))
  assert.ok(vendorBStmt, 'vendor-b の statement が見つからない')
  assert.match(vendorBStmt, /affiliations, affiliation_links/)
  assert.match(vendorBStmt, /'\[\]', '\{\}'/)
})

test('buildStatements: affiliationLinks に未知の id が混ざると例外（slug と値を含む）', () => {
  const seed = fictionalSeed()
  seed.vendors[0].affiliationLinks = { 'no-such-group': { url: 'https://example.com/' } }
  assert.throws(
    () => buildStatements(seed, { actorEmail: 'owner@example.com' }),
    /vendor-a.*no-such-group/s,
  )
})

test('buildStatements: affiliationLinks.url が https:// で始まらないと例外', () => {
  const seed = fictionalSeed()
  seed.vendors[0].affiliationLinks = { 'kouzou-cram': { url: 'http://example.com/' } }
  assert.throws(
    () => buildStatements(seed, { actorEmail: 'owner@example.com' }),
    /vendor-a.*affiliationLinks\.kouzou-cram\.url/s,
  )
})

test('buildStatements: affiliationLinks.note が 60 字を超えると例外', () => {
  const seed = fictionalSeed()
  seed.vendors[0].affiliationLinks = {
    'kouzou-cram': { url: 'https://example.com/', note: 'あ'.repeat(61) },
  }
  assert.throws(
    () => buildStatements(seed, { actorEmail: 'owner@example.com' }),
    /vendor-a.*affiliationLinks\.kouzou-cram\.note/s,
  )
})

test('buildStatements: representativePhotoReady に slug が入っていれば representative_photo_key が入る（vendorId だけから決まる key）', () => {
  const seed = fictionalSeed()
  const { sql } = buildStatements(seed, {
    actorEmail: 'owner@example.com',
    representativePhotoReady: new Set(['vendor-a']),
  })
  const vendorAId = slugToId('vendor:vendor-a')
  const vendorAStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空工務店A'))
  assert.ok(vendorAStmt, 'vendor-a の statement が見つからない')
  assert.match(vendorAStmt, new RegExp(`'vendors/${vendorAId}/representative-display\\.jpg'`))
})

test('buildStatements: representativePhotoReady に無い vendor は representative_photo_key が NULL のまま（未指定の既定も同じ）', () => {
  const { sql } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  const vendorAStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空工務店A'))
  assert.ok(vendorAStmt, 'vendor-a の statement が見つからない')
  assert.doesNotMatch(vendorAStmt, /representative-display\.jpg/)
})

// Finding 3 の回帰防止: representativePhoto を持たない（= representativePhotoReady に無い）
// vendor を再取り込みしても、フォーム経由で既に付いている representative_photo_key を
// NULL に巻き戻してはいけない（favicon_key と同じ「seed が触らない列」の扱い）。
// upsertStatement は row に無い列を UPDATE SET にも出さないので、INSERT 文そのものに
// `representative_photo_key` という語が一切現れないことを確認すれば「列ごと省略されている
// （= 値を明示的に null で上書きしていない）」ことを厳密に検証できる。
test('buildStatements: representativePhoto が無い vendor の INSERT 文に representative_photo_key 列自体が出ない（再取込で列を NULL に巻き戻さない）', () => {
  const { sql } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  const vendorAStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空工務店A'))
  const vendorBStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空ハウス'))
  assert.ok(vendorAStmt, 'vendor-a の statement が見つからない')
  assert.ok(vendorBStmt, 'vendor-b の statement が見つからない')
  assert.doesNotMatch(vendorAStmt, /representative_photo_key/)
  assert.doesNotMatch(vendorBStmt, /representative_photo_key/)
})

test('buildStatements: representativePhotoReady に slug が入っている vendor だけ、その INSERT/UPDATE 文に representative_photo_key 列が出る', () => {
  const seed = fictionalSeed()
  const { sql } = buildStatements(seed, {
    actorEmail: 'owner@example.com',
    representativePhotoReady: new Set(['vendor-a']),
  })
  const vendorAStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空工務店A'))
  const vendorBStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空ハウス'))
  assert.ok(vendorAStmt, 'vendor-a の statement が見つからない')
  assert.ok(vendorBStmt, 'vendor-b の statement が見つからない')
  assert.match(vendorAStmt, /representative_photo_key = excluded\.representative_photo_key/)
  assert.doesNotMatch(vendorBStmt, /representative_photo_key/)
})

test("buildStatements: 名前に ' が入っていてもエスケープされる", () => {
  const seed = fictionalSeed()
  seed.vendors[0].name = "架空's工務店"
  const { sql } = buildStatements(seed, { actorEmail: 'owner@example.com' })
  const vendorStmt = sql.find((s) => s.includes('INTO vendors') && s.includes("架空''s工務店"))
  assert.ok(vendorStmt, 'エスケープされた名前を含む文が見つからない')
})

test('buildStatements: vendor が存在しない slug を参照するとエラー（slug を含む）', () => {
  const seed = fictionalSeed()
  seed.places[0].vendor = 'no-such-vendor'
  assert.throws(() => buildStatements(seed, { actorEmail: 'owner@example.com' }), /no-such-vendor/)
})

test('buildStatements: place が存在しない slug を参照するとエラー（slug を含む）', () => {
  const seed = fictionalSeed()
  seed.events[0].place = 'no-such-place'
  assert.throws(() => buildStatements(seed, { actorEmail: 'owner@example.com' }), /no-such-place/)
})

test('buildStatements: visit が存在しない place slug を参照するとエラー', () => {
  const seed = fictionalSeed()
  seed.visits[0].place = 'no-such-place'
  assert.throws(() => buildStatements(seed, { actorEmail: 'owner@example.com' }), /no-such-place/)
})

test('buildStatements: visit が存在しない event slug を参照するとエラー', () => {
  const seed = fictionalSeed()
  seed.visits[0].event = 'no-such-event'
  assert.throws(() => buildStatements(seed, { actorEmail: 'owner@example.com' }), /no-such-event/)
})

test('buildStatements: photos は visit ごとに src 配列の並び順で sortOrder 0,1,… になる', () => {
  const { photos } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  const own = photos.filter((p) => p.visitSlug === 'visit-a')
  assert.equal(own.length, 2)
  assert.equal(own[0].sortOrder, 0)
  assert.equal(own[1].sortOrder, 1)
  assert.equal(own[0].src, 'seed.local/photos/fake-1.HEIC')
  assert.equal(own[1].src, 'seed.local/photos/fake-2.HEIC')
})

test('buildStatements: photos の id/キーは決定的（photoId は slugToId(visitSlug + ":" + basename)）', () => {
  const { photos } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  const p0 = photos.find((p) => p.src === 'seed.local/photos/fake-1.HEIC')
  assert.equal(p0.photoId, slugToId('visit-a:fake-1.HEIC'))
  assert.match(p0.displayKey, /^photos\/[0-9a-f-]{36}\/[0-9a-f-]{36}-display\.jpg$/)
  assert.match(p0.thumbKey, /^photos\/[0-9a-f-]{36}\/[0-9a-f-]{36}-thumb\.jpg$/)
})

test('buildStatements: photoSizes が無い写真の SQL は省略される（sql には出ない）', () => {
  const { sql, photos } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  assert.ok(photos.length > 0)
  assert.ok(!sql.some((s) => s.includes('INTO photos')))
})

test('buildStatements: photoSizes を渡すと該当写真の photos INSERT 文が実寸込みで出る', () => {
  const seed = fictionalSeed()
  const first = buildStatements(seed, { actorEmail: 'owner@example.com' })
  const photoSizes = Object.fromEntries(
    first.photos.map((p) => [p.photoId, { width: 1600, height: 1200 }]),
  )
  const { sql } = buildStatements(seed, { actorEmail: 'owner@example.com', photoSizes })
  const photoStmts = sql.filter((s) => s.includes('INTO photos'))
  assert.equal(photoStmts.length, 2)
  assert.ok(photoStmts.every((s) => s.includes('1600') && s.includes('1200')))
})

test('buildStatements: coords を渡すと places の lat/lng/geocode_source が入る', () => {
  const seed = fictionalSeed()
  const coords = { 'place-a': { lat: 35.1, lng: 139.4 } }
  const { sql } = buildStatements(seed, { actorEmail: 'owner@example.com', coords })
  const placeStmt = sql.find((s) => s.includes('INTO places'))
  assert.match(placeStmt, /35\.1/)
  assert.match(placeStmt, /139\.4/)
  assert.match(placeStmt, /'gsi'/)
})

test('buildStatements: coords が無い place の lat/lng は NULL', () => {
  const { sql } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  const placeStmt = sql.find((s) => s.includes('INTO places'))
  // lat, lng の並びで NULL, NULL が出ることを確認（列順は places テーブル定義に依存）
  assert.match(placeStmt, /NULL/)
})

test('buildStatements: now を渡すと created_at/updated_at に使われる', () => {
  const { sql } = buildStatements(fictionalSeed(), {
    actorEmail: 'owner@example.com',
    now: '2026-01-01T00:00:00.000Z',
  })
  const vendorStmt = sql.find((s) => s.includes('INTO vendors'))
  assert.match(vendorStmt, /2026-01-01T00:00:00\.000Z/)
})

// --- sources ---------------------------------------------------------------

function fictionalSource(overrides = {}) {
  return {
    slug: 'source-a',
    kind: 'youtube',
    name: '架空チャンネル',
    url: 'https://www.youtube.com/@example-house',
    handle: '@example-house',
    channelId: null,
    genre: 'knowledge',
    description: '架空チャンネルの説明',
    avatarUrl: 'https://yt3.googleusercontent.com/fake=s900',
    vendorSlug: null,
    affiliation: null,
    sortOrder: 0,
    ...overrides,
  }
}

// url が自然キー（brief のレビュー指摘どおり）: フォームから先に同じ URL の行が
// 別 id で作られていても、再取り込みが「別行の追加」にならず「その行の上書き」になる。
test('buildStatements: sources は url を自然キーに INSERT ... ON CONFLICT(url) DO UPDATE 文が生成される（id ではない）', () => {
  const seed = fictionalSeed({ sources: [fictionalSource()] })
  const { sql } = buildStatements(seed, { actorEmail: 'owner@example.com' })
  const stmt = sql.find((s) => s.includes('INTO sources'))
  assert.ok(stmt, 'sources statement が見つからない')
  assert.match(stmt, /^INSERT INTO sources/)
  assert.match(stmt, /ON CONFLICT\(url\) DO UPDATE SET/)
  assert.doesNotMatch(stmt, /ON CONFLICT\(id\)/)
  assert.doesNotMatch(stmt, /OR REPLACE/)
  assert.match(stmt, /架空チャンネル/)
})

test('buildStatements: sources の ON CONFLICT(url) DO UPDATE は id も更新対象に含む（所有者が手で足した行の id を seed の決定的な id に揃える）', () => {
  const seed = fictionalSeed({ sources: [fictionalSource()] })
  const { sql } = buildStatements(seed, { actorEmail: 'owner@example.com' })
  const stmt = sql.find((s) => s.includes('INTO sources'))
  assert.match(stmt, /id = excluded\.id/)
  assert.doesNotMatch(stmt, /created_by = excluded\.created_by/)
  assert.doesNotMatch(stmt, /created_at = excluded\.created_at/)
})

test('buildStatements: source の id は slugToId("source:" + slug) で決まる（冪等）', () => {
  const seed = fictionalSeed({ sources: [fictionalSource({ slug: 'yt-example' })] })
  const { sql } = buildStatements(seed, { actorEmail: 'owner@example.com' })
  const stmt = sql.find((s) => s.includes('INTO sources'))
  assert.match(stmt, new RegExp(slugToId('source:yt-example')))
})

test('buildStatements: source の vendorSlug が指定されれば vendor_id が解決される', () => {
  const seed = fictionalSeed({ sources: [fictionalSource({ vendorSlug: 'vendor-a' })] })
  const { sql } = buildStatements(seed, { actorEmail: 'owner@example.com' })
  const stmt = sql.find((s) => s.includes('INTO sources'))
  assert.match(stmt, new RegExp(slugToId('vendor:vendor-a')))
})

test('buildStatements: source の vendorSlug が存在しない slug を参照するとエラー（slug を含む）', () => {
  const seed = fictionalSeed({ sources: [fictionalSource({ vendorSlug: 'no-such-vendor' })] })
  assert.throws(() => buildStatements(seed, { actorEmail: 'owner@example.com' }), /no-such-vendor/)
})

test('buildStatements: source の kind を省略すると URL から自動判定される（YouTube チャンネル URL → youtube）', () => {
  const seed = fictionalSeed({
    sources: [fictionalSource({ kind: undefined, url: 'https://www.youtube.com/@example-house' })],
  })
  const { sql } = buildStatements(seed, { actorEmail: 'owner@example.com' })
  const stmt = sql.find((s) => s.includes('INTO sources'))
  assert.match(stmt, /'youtube'/)
})

test('buildStatements: source の kind を省略し URL が YouTube チャンネルの形でなければ site になる', () => {
  const seed = fictionalSeed({
    sources: [fictionalSource({ kind: undefined, url: 'https://example.com/blog' })],
  })
  const { sql } = buildStatements(seed, { actorEmail: 'owner@example.com' })
  const stmt = sql.find((s) => s.includes('INTO sources'))
  assert.match(stmt, /'site'/)
})

test('buildStatements: source の genre が未知なら例外（slug と値を含む）', () => {
  const seed = fictionalSeed({ sources: [fictionalSource({ genre: 'no-such-genre' })] })
  assert.throws(
    () => buildStatements(seed, { actorEmail: 'owner@example.com' }),
    /source-a.*no-such-genre/s,
  )
})

test('buildStatements: source の kind が未知なら例外（slug と値を含む）', () => {
  const seed = fictionalSeed({ sources: [fictionalSource({ kind: 'podcast' })] })
  assert.throws(
    () => buildStatements(seed, { actorEmail: 'owner@example.com' }),
    /source-a.*podcast/s,
  )
})

test('buildStatements: source の url が https:// で始まらなければ例外', () => {
  const seed = fictionalSeed({ sources: [fictionalSource({ url: 'http://example.com' })] })
  assert.throws(() => buildStatements(seed, { actorEmail: 'owner@example.com' }), /https:\/\//)
})

test('buildStatements: source の avatarUrl が https:// で始まらなければ例外', () => {
  const seed = fictionalSeed({
    sources: [fictionalSource({ avatarUrl: 'http://yt3.ggpht.com/fake' })],
  })
  assert.throws(() => buildStatements(seed, { actorEmail: 'owner@example.com' }), /avatarUrl/)
})

// zod 側（sources.schema.ts の isAllowedAvatarUrl）と同じホスト許可リストを seed でも見る
// （brief のレビュー指摘: 2 つの入口で規則がずれていた）
test('buildStatements: source の avatarUrl が許可ホスト外なら例外（slug と値を含む）', () => {
  const seed = fictionalSeed({
    sources: [fictionalSource({ avatarUrl: 'https://evil.example/a.jpg' })],
  })
  assert.throws(
    () => buildStatements(seed, { actorEmail: 'owner@example.com' }),
    /source-a.*evil\.example/s,
  )
})

test('buildStatements: source の avatarUrl は yt3.ggpht.com / i.ytimg.com も許可する', () => {
  for (const avatarUrl of [
    'https://yt3.ggpht.com/fake=s900',
    'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
  ]) {
    const seed = fictionalSeed({ sources: [fictionalSource({ avatarUrl })] })
    assert.doesNotThrow(() => buildStatements(seed, { actorEmail: 'owner@example.com' }))
  }
})

test('buildStatements: source の affiliation が未知なら例外（slug と値を含む）', () => {
  const seed = fictionalSeed({ sources: [fictionalSource({ affiliation: 'no-such-affiliation' })] })
  assert.throws(
    () => buildStatements(seed, { actorEmail: 'owner@example.com' }),
    /source-a.*no-such-affiliation/s,
  )
})

test('buildStatements: source の affiliation（構造塾マップ含む既知の id）は許可される', () => {
  for (const affiliation of ['iedukuri100', 'miratsugu', 'kouzou-cram']) {
    const seed = fictionalSeed({ sources: [fictionalSource({ affiliation })] })
    assert.doesNotThrow(() => buildStatements(seed, { actorEmail: 'owner@example.com' }))
  }
})

test('buildStatements: source の handle/channelId/description/avatarUrl/affiliation 未指定は NULL になる', () => {
  const seed = fictionalSeed({
    sources: [
      {
        slug: 'source-min',
        name: '最小構成チャンネル',
        url: 'https://www.youtube.com/@minimal',
        genre: 'owners',
        sortOrder: 0,
      },
    ],
  })
  const { sql } = buildStatements(seed, { actorEmail: 'owner@example.com' })
  const stmt = sql.find((s) => s.includes('INTO sources'))
  assert.match(stmt, /最小構成チャンネル/)
  // 6 個の NULL（handle, channel_id, description, avatar_url, vendor_id, affiliation）が
  // 少なくとも入っていることだけ緩く確認する（列順に依存しすぎない）
  const nullCount = (stmt.match(/NULL/g) ?? []).length
  assert.ok(nullCount >= 6, `NULL の数が想定より少ない: ${nullCount}`)
})

test('sources が無い seed（sources キー自体が無い）でも buildStatements は例外にならない', () => {
  const seed = fictionalSeed()
  delete seed.sources
  assert.doesNotThrow(() => buildStatements(seed, { actorEmail: 'owner@example.com' }))
})
