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
 * 同じ文字列は常に同じ id になるので、再取り込みが冪等になる（同じ id への
 * INSERT ... ON CONFLICT DO UPDATE が常に「同じ行の更新」になる）。
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

/**
 * 冪等な `INSERT ... ON CONFLICT DO UPDATE` 文を作る。
 *
 * 以前は `INSERT OR REPLACE` を使っていたが、SQLite の REPLACE は主キーが
 * 衝突した既存行を一度 DELETE してから INSERT し直す。外部キーを ON で
 * 有効にしていると、その DELETE が `ON DELETE CASCADE` の子行まで巻き込んで
 * 消してしまう（例: vendors を REPLACE すると vendor_news が cascade で消える）。
 * `ON CONFLICT DO UPDATE` は既存行をその場で UPDATE するだけで DELETE を
 * 経由しないため、子行は残る。
 *
 * `conflictColumn` は衝突判定に使う主キー列（既定 'id'。settings だけ 'key'）。
 * `excludeFromUpdate` に挙げた列（既定で created_by・created_at。存在しない
 * テーブルでは単に無視される）と `conflictColumn` 自身を除く全列を
 * `col = excluded.col` で UPDATE 対象にする。
 */
function upsertStatement(
  table,
  row,
  { conflictColumn = 'id', excludeFromUpdate = ['created_by', 'created_at'] } = {},
) {
  const columns = Object.keys(row)
  const values = columns.map((c) => sqlString(row[c]))
  const updateColumns = columns.filter(
    (c) => c !== conflictColumn && !excludeFromUpdate.includes(c),
  )
  const updateClause = updateColumns.map((c) => `${c} = excluded.${c}`).join(', ')
  return (
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')}) ` +
    `ON CONFLICT(${conflictColumn}) DO UPDATE SET ${updateClause};`
  )
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

// src/content/affiliations.ts の AFFILIATION_IDS と同じ値。plain .mjs から TS を import
// できないため値を重複させている（NEWS_SOURCES と同じ理由）。
const AFFILIATION_IDS = ['iedukuri100', 'miratsugu', 'kouzou-cram']

/** affiliations に未知の id が混ざっていたら、どの業者のどの値かがわかるメッセージで例外を投げる */
function validateAffiliations(vendorSlug, affiliations) {
  if (affiliations === undefined || affiliations === null) return
  for (const id of affiliations) {
    if (!AFFILIATION_IDS.includes(id)) {
      throw new Error(
        `vendor ${vendorSlug}: unknown affiliation: ${id} (expected one of ${AFFILIATION_IDS.join(', ')})`,
      )
    }
  }
}

/**
 * affiliationLinks（{ [affiliationId]: { url, note? } }）を検証する。省略は許容する
 * （所有者の seed.local.json は一部の業者にしか付けない想定。src/server/candidates.ts の
 * zod と同じ判定: キーは既知の affiliation id・url は https:// 始まり・note は 60 字以内）。
 */
function validateAffiliationLinks(vendorSlug, affiliationLinks) {
  if (affiliationLinks === undefined || affiliationLinks === null) return
  for (const [id, link] of Object.entries(affiliationLinks)) {
    if (!AFFILIATION_IDS.includes(id)) {
      throw new Error(
        `vendor ${vendorSlug}: unknown affiliationLinks key: ${id} (expected one of ${AFFILIATION_IDS.join(', ')})`,
      )
    }
    if (typeof link?.url !== 'string' || !/^https:\/\//.test(link.url)) {
      throw new Error(`vendor ${vendorSlug}: affiliationLinks.${id}.url must start with https://`)
    }
    if (link.note !== undefined && link.note !== null && link.note.length > 60) {
      throw new Error(
        `vendor ${vendorSlug}: affiliationLinks.${id}.note must be 60 characters or less`,
      )
    }
  }
}

/**
 * seed.local.json の内容を D1 の INSERT ... ON CONFLICT DO UPDATE 文へ変換する。
 *
 * @param {object} seed - seed.local.json をパースしたオブジェクト
 * @param {object} opts
 * @param {string} opts.actorEmail - created_by に入れるメール（.dev.vars の DEV_IDENTITY_EMAIL）
 * @param {string} [opts.now] - created_at/updated_at に入れる ISO-8601 文字列（省略時は new Date().toISOString()）
 * @param {Record<string, {width:number,height:number}>} [opts.photoSizes] - photoId → 実寸。
 *   無い写真は photos テーブルへの INSERT 文を作らない（sips 変換前の 1 回目の呼び出し用）。
 * @param {Record<string, {lat:number,lng:number}>} [opts.coords] - place slug → 座標。
 *   無い place は lat/lng/geocode_source が NULL のまま（地図に出せない場所として扱われる）。
 * @param {Set<string>} [opts.representativePhotoReady] - representativePhoto の sips 変換
 *   （→ R2 アップロード）が済んだ vendor slug の集合。無い vendor は representative_photo_key
 *   が NULL のまま（R2 に実体が無いのに DB だけ「写真あり」を指さないようにするため）。
 * @returns {{ sql: string[], photos: Array<{visitSlug:string, src:string, photoId:string, displayKey:string, thumbKey:string, sortOrder:number}> }}
 */
export function buildStatements(seed, opts) {
  const {
    actorEmail,
    now = new Date().toISOString(),
    photoSizes = {},
    coords = {},
    representativePhotoReady = new Set(),
  } = opts

  const sql = []

  // --- settings ---------------------------------------------------------
  if (seed.settings?.homeAreas) {
    sql.push(
      upsertStatement(
        'settings',
        {
          key: 'homeAreas',
          value: JSON.stringify(seed.settings.homeAreas),
          updated_at: now,
        },
        { conflictColumn: 'key' },
      ),
    )
  }

  // --- vendors ------------------------------------------------------------
  const vendorIdBySlug = {}
  for (const v of seed.vendors ?? []) {
    vendorIdBySlug[v.slug] = slugToId(`vendor:${v.slug}`)
  }
  for (const v of seed.vendors ?? []) {
    validateNewsSource(v.slug, v.newsSource)
    validateAffiliations(v.slug, v.affiliations)
    validateAffiliationLinks(v.slug, v.affiliationLinks)
    const vendorId = vendorIdBySlug[v.slug]
    sql.push(
      upsertStatement('vendors', {
        id: vendorId,
        name: v.name,
        kind: v.kind,
        hq: v.hq ?? null,
        representative: v.representative ?? null,
        service_areas: JSON.stringify(v.serviceAreas ?? []),
        affiliations: JSON.stringify(v.affiliations ?? []),
        affiliation_links: JSON.stringify(v.affiliationLinks ?? {}),
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
        // representative_photo_key は src/lib/photos.ts の vendorImageKeys と同じ形
        // （vendorId だけから決まる）。sips 変換（→ R2 アップロード）が済んだ業者だけ列自体を
        // 出す。favicon_key と同じ理由でキーごと省略する（値を null にするのではない）:
        // upsertStatement は row に含まれる列だけを UPDATE SET に載せるため、ここで列を
        // 省略すれば再取り込みのたびに ON CONFLICT DO UPDATE が走っても既存値は変わらない。
        // 値を null にしてしまうと（favicon_key と違って）常に列が出るぶん、seed に
        // representativePhoto が無いだけで、フォームからアップロード済みの写真キーが
        // NULL に巻き戻ってしまう（R2 の実体は残ったまま UI から見えなくなる）。
        ...(representativePhotoReady.has(v.slug)
          ? { representative_photo_key: `vendors/${vendorId}/representative-display.jpg` }
          : {}),
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
      upsertStatement('places', {
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
      upsertStatement('events', {
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
      upsertStatement('visits', {
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
        upsertStatement('photos', {
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
      upsertStatement('videos', {
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
