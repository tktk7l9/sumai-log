/**
 * seed.local.json（実データ・gitignore 済み）を D1 の INSERT 文へ変換する純粋な部分。
 *
 * ここにはファイル I/O・ネットワーク・sips 呼び出しなどの副作用を一切書かない。
 * 副作用は scripts/import-seed.mjs 側に置き、ここは「入力→出力」だけのテスト可能な関数群にする。
 */

import { createHash } from 'node:crypto'
import { basename } from 'node:path'

import { normalizeAddress, normalizeSocialUrls } from './normalize.mjs'

// normalizeAddress・normalizeSocialUrls は scripts/lib/normalize.mjs に移した
// （src/lib/normalize-parity.test.ts から .mjs 側の実装として直接 import できるように
// する）。ここでの再エクスポートは既存の import パス（`./seed.mjs` から取れる）を
// 変えないため（scripts/lib/seed.test.mjs・scripts/import-seed.mjs）。
export { normalizeAddress, normalizeSocialUrls }

/**
 * slug（人間が読める識別子）から決定的に id を作る。
 * 同じ文字列は常に同じ id になるので、`INSERT OR REPLACE` による再取り込みが冪等になる。
 *
 * 呼び出し側は `<種類>:<slug>` のように種類を前置して渡す（例: `vendor:some-koumuten`）。
 * 種類をプレフィックスすることで、異なるテーブル間で slug 文字列がたまたま
 * 一致しても id が衝突しない。
 */
export function slugToId(slug) {
  const hex = createHash('sha256').update(`sumai-log:${slug}`).digest('hex').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/**
 * SQL リテラルへ変換する。
 * - null/undefined → NULL
 * - 真偽値 → 0/1（integer mode boolean の列に合わせる）
 * - 数値 → そのまま（クォートしない）
 * - それ以外 → 文字列化して `'` を `''` にエスケープし単一引用符で囲む
 */
export function sqlString(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'number') return String(value)
  return `'${String(value).replaceAll("'", "''")}'`
}

function inRange(lat, lng) {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

/**
 * 国土地理院 住所検索 API のレスポンス（JSON）から先頭の Feature の座標と title を取り出す。
 * src/lib/geocode.ts の parseGsiResponse と同一に保つ。
 * 空配列・配列でない・座標が数値でない・緯度経度が範囲外（lat: -90〜90, lng: -180〜180）は
 * すべて「該当なし」として null を返す。
 */
export function parseGsiResponse(json) {
  if (!Array.isArray(json) || json.length === 0) return null
  const first = json[0]
  const coords = first?.geometry?.coordinates
  if (!Array.isArray(coords) || coords.length < 2) return null
  const [lng, lat] = coords
  if (typeof lat !== 'number' || typeof lng !== 'number' || !inRange(lat, lng)) return null
  const title = typeof first.properties?.title === 'string' ? first.properties.title : null
  return { lat, lng, title }
}

function insertStatement(table, row) {
  const columns = Object.keys(row)
  const values = columns.map((c) => sqlString(row[c]))
  return `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')});`
}

/**
 * slug → id の対応表を引く。無ければ「どの種類のどの slug が見つからないか」が
 * わかるメッセージで例外を投げる（取り込み中断時に原因がすぐわかるように）。
 */
function resolveId(map, slug, kind) {
  if (slug === null || slug === undefined) return null
  const id = map[slug]
  if (id === undefined) {
    throw new Error(`unknown ${kind} slug: ${slug}`)
  }
  return id
}

// src/db/schema.ts の NEWS_SOURCES と同じ値。plain .mjs から TS を import できないため
// 値を重複させている（他の enum も seed.mjs ではリテラルのまま検証している）。
const NEWS_SOURCES = ['rss', 'html-list']

/** newsSource が指定されているのに未知の値なら、どの業者のどの値かがわかるメッセージで例外を投げる */
function validateNewsSource(vendorSlug, newsSource) {
  if (newsSource === undefined || newsSource === null) return
  if (!NEWS_SOURCES.includes(newsSource)) {
    throw new Error(
      `vendor ${vendorSlug}: unknown newsSource: ${newsSource} (expected one of ${NEWS_SOURCES.join(', ')})`,
    )
  }
}

/**
 * seed.local.json の内容を D1 の INSERT OR REPLACE 文へ変換する。
 *
 * @param {object} seed - seed.local.json をパースしたオブジェクト
 * @param {object} opts
 * @param {string} opts.actorEmail - created_by に入れるメール（.dev.vars の DEV_IDENTITY_EMAIL）
 * @param {string} [opts.now] - created_at/updated_at に入れる ISO-8601 文字列（省略時は new Date().toISOString()）
 * @param {Record<string, {width:number,height:number}>} [opts.photoSizes] - photoId → 実寸。
 *   無い写真は photos テーブルへの INSERT 文を作らない（sips 変換前の 1 回目の呼び出し用）。
 * @param {Record<string, {lat:number,lng:number}>} [opts.coords] - place slug → 座標。
 *   無い place は lat/lng/geocode_source が NULL のまま（地図に出せない場所として扱われる）。
 * @returns {{ sql: string[], photos: Array<{visitSlug:string, src:string, photoId:string, displayKey:string, thumbKey:string, sortOrder:number}> }}
 */
export function buildStatements(seed, opts) {
  const { actorEmail, now = new Date().toISOString(), photoSizes = {}, coords = {} } = opts

  const sql = []

  // --- settings ---------------------------------------------------------
  if (seed.settings?.homeAreas) {
    sql.push(
      insertStatement('settings', {
        key: 'homeAreas',
        value: JSON.stringify(seed.settings.homeAreas),
        updated_at: now,
      }),
    )
  }

  // --- vendors ------------------------------------------------------------
  const vendorIdBySlug = {}
  for (const v of seed.vendors ?? []) {
    vendorIdBySlug[v.slug] = slugToId(`vendor:${v.slug}`)
  }
  for (const v of seed.vendors ?? []) {
    validateNewsSource(v.slug, v.newsSource)
    sql.push(
      insertStatement('vendors', {
        id: vendorIdBySlug[v.slug],
        name: v.name,
        kind: v.kind,
        hq: v.hq ?? null,
        service_areas: JSON.stringify(v.serviceAreas ?? []),
        ua_value: v.uaValue ?? null,
        c_value_published: v.cValuePublished ?? false,
        seismic_grade: v.seismicGrade ?? null,
        long_term_certified: v.longTermCertified ?? false,
        price_per_tsubo_min: v.pricePerTsuboMin ?? null,
        price_per_tsubo_max: v.pricePerTsuboMax ?? null,
        structure: v.structure ?? null,
        features: v.features ?? null,
        status: v.status,
        source_url: v.sourceUrl ?? null,
        website_url: v.websiteUrl ?? null,
        social_urls: JSON.stringify(normalizeSocialUrls(v.socialUrls)),
        news_url: v.newsUrl ?? null,
        news_source: v.newsSource ?? null,
        created_by: actorEmail,
        created_at: now,
        updated_at: now,
      }),
    )
  }

  // --- places ---------------------------------------------------------------
  const placeIdBySlug = {}
  for (const p of seed.places ?? []) {
    placeIdBySlug[p.slug] = slugToId(`place:${p.slug}`)
  }
  for (const p of seed.places ?? []) {
    const coord = coords[p.slug]
    sql.push(
      insertStatement('places', {
        id: placeIdBySlug[p.slug],
        name: p.name,
        kind: p.kind,
        address: p.address ?? null,
        lat: coord?.lat ?? null,
        lng: coord?.lng ?? null,
        coords_text: null,
        geocode_source: coord ? 'gsi' : null,
        vendor_id: resolveId(vendorIdBySlug, p.vendor, 'vendor'),
        property_id: null,
        note: p.note ?? null,
        created_by: actorEmail,
        created_at: now,
        updated_at: now,
      }),
    )
  }

  // --- events ---------------------------------------------------------------
  const eventIdBySlug = {}
  for (const e of seed.events ?? []) {
    eventIdBySlug[e.slug] = slugToId(`event:${e.slug}`)
  }
  for (const e of seed.events ?? []) {
    sql.push(
      insertStatement('events', {
        id: eventIdBySlug[e.slug],
        title: e.title,
        kind: e.kind,
        starts_at: e.startsAt,
        ends_at: e.endsAt ?? null,
        all_day: e.allDay ?? false,
        place_id: resolveId(placeIdBySlug, e.place, 'place'),
        vendor_id: resolveId(vendorIdBySlug, e.vendor, 'vendor'),
        property_id: null,
        note: e.note ?? null,
        created_by: actorEmail,
        created_at: now,
        updated_at: now,
      }),
    )
  }

  // --- visits -----------------------------------------------------------------
  const visitIdBySlug = {}
  for (const vi of seed.visits ?? []) {
    visitIdBySlug[vi.slug] = slugToId(`visit:${vi.slug}`)
  }
  for (const vi of seed.visits ?? []) {
    sql.push(
      insertStatement('visits', {
        id: visitIdBySlug[vi.slug],
        event_id: resolveId(eventIdBySlug, vi.event, 'event'),
        place_id: resolveId(placeIdBySlug, vi.place, 'place'),
        vendor_id: resolveId(vendorIdBySlug, vi.vendor, 'vendor'),
        property_id: null,
        visited_on: vi.visitedOn,
        attendees: vi.attendees,
        good: vi.good ?? null,
        concerns: vi.concerns ?? null,
        qa: vi.qa ?? null,
        next_actions: vi.nextActions ?? null,
        created_by: actorEmail,
        created_at: now,
        updated_at: now,
      }),
    )
  }

  // --- photos（visit ごとに src 配列の並び順で sortOrder を振る） ------------------
  const photos = []
  for (const vi of seed.visits ?? []) {
    const visitId = visitIdBySlug[vi.slug]
    ;(vi.photos ?? []).forEach((src, sortOrder) => {
      const photoId = slugToId(`${vi.slug}:${basename(src)}`)
      const displayKey = `photos/${visitId}/${photoId}-display.jpg`
      const thumbKey = `photos/${visitId}/${photoId}-thumb.jpg`
      photos.push({ visitSlug: vi.slug, src, photoId, displayKey, thumbKey, sortOrder })

      const size = photoSizes[photoId]
      if (!size) return // 実寸を知らない写真は SQL を作らない（sips 変換前の 1 回目呼び出し）

      sql.push(
        insertStatement('photos', {
          id: photoId,
          visit_id: visitId,
          display_key: displayKey,
          thumb_key: thumbKey,
          width: size.width,
          height: size.height,
          caption: null,
          sort_order: sortOrder,
          created_by: actorEmail,
          created_at: now,
          updated_at: now,
        }),
      )
    })
  }

  // --- videos -------------------------------------------------------------------
  for (const vid of seed.videos ?? []) {
    sql.push(
      insertStatement('videos', {
        id: slugToId(`video:${vid.videoId}`),
        url: vid.url,
        video_id: vid.videoId,
        title: vid.title,
        channel: vid.channel ?? null,
        thumbnail_url: vid.thumbnailUrl ?? null,
        watched_on: vid.watchedOn ?? null,
        watched_by: vid.watchedBy,
        tags: JSON.stringify(vid.tags ?? []),
        takeaways: vid.takeaways ?? null,
        vendor_id: resolveId(vendorIdBySlug, vid.vendor, 'vendor'),
        created_by: actorEmail,
        created_at: now,
        updated_at: now,
      }),
    )
  }

  return { sql, photos }
}
