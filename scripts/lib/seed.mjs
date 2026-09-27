/**
 * The pure part that converts seed.local.json (real data, gitignored) into D1 INSERT statements.
 *
 * No side effects at all are written here, such as file I/O, network, or sips calls.
 * Side effects live in scripts/import-seed.mjs, and this file is a set of testable
 * "input -> output" functions only.
 */

import { createHash } from 'node:crypto'
import { basename } from 'node:path'

import { normalizeAddress, normalizeSocialUrls } from './normalize.mjs'

// normalizeAddress and normalizeSocialUrls were moved to scripts/lib/normalize.mjs
// (so that src/lib/normalize-parity.test.ts can import them directly as the .mjs side
// implementation). The re-export here keeps the existing import path (available from
// `./seed.mjs`) unchanged (scripts/lib/seed.test.mjs, scripts/import-seed.mjs).
export { normalizeAddress, normalizeSocialUrls }

/**
 * Build an id deterministically from a slug (a human-readable identifier).
 * The same string always gives the same id, so re-importing is idempotent (an
 * INSERT ... ON CONFLICT DO UPDATE on the same id is always "an update of the same row").
 *
 * Callers pass it with the kind in front, like `<kind>:<slug>` (e.g. `vendor:some-koumuten`).
 * Prefixing the kind means ids do not collide even when slug strings happen to
 * match across different tables.
 */
export function slugToId(slug) {
  const hex = createHash('sha256').update(`sumai-log:${slug}`).digest('hex').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/**
 * Convert to an SQL literal.
 * - null/undefined -> NULL
 * - boolean -> 0/1 (matches integer mode boolean columns)
 * - number -> as is (not quoted)
 * - anything else -> stringify, escape `'` as `''`, and wrap in single quotes
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
 * Extract the coordinates and title of the first Feature from a GSI address search API
 * response (JSON).
 * Keep identical to parseGsiResponse in src/lib/geocode.ts.
 * An empty array, a non-array, non-numeric coordinates, and latitude/longitude out of range
 * (lat: -90 to 90, lng: -180 to 180) all return null as "not found".
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
 * Build an idempotent `INSERT ... ON CONFLICT DO UPDATE` statement.
 *
 * `INSERT OR REPLACE` was used before, but SQLite's REPLACE DELETEs the existing row
 * whose primary key conflicts and then INSERTs again. With foreign keys turned ON,
 * that DELETE also deletes the `ON DELETE CASCADE` child rows
 * (e.g. REPLACE on vendors deletes vendor_news by cascade).
 * `ON CONFLICT DO UPDATE` only UPDATEs the existing row in place and does not go
 * through DELETE, so the child rows remain.
 *
 * `conflictColumn` is the primary key column used for conflict detection (default 'id'.
 * Only settings uses 'key').
 * All columns except the ones listed in `excludeFromUpdate` (default created_by and
 * created_at. Simply ignored for tables that do not have them) and `conflictColumn`
 * itself become UPDATE targets as `col = excluded.col`.
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
 * Look up the slug -> id table. If missing, throw with a message that tells "which slug
 * of which kind was not found" (so the cause is clear right away when the import aborts).
 */
function resolveId(map, slug, kind) {
  if (slug === null || slug === undefined) return null
  const id = map[slug]
  if (id === undefined) {
    throw new Error(`unknown ${kind} slug: ${slug}`)
  }
  return id
}

// Same values as NEWS_SOURCES in src/db/schema.ts. The values are duplicated because plain
// .mjs cannot import TS (other enums are also validated as literals in seed.mjs).
const NEWS_SOURCES = ['rss', 'html-list']

/**
 * If newsSource is given but unknown, throw with a message that tells which value of which vendor
 */
function validateNewsSource(vendorSlug, newsSource) {
  if (newsSource === undefined || newsSource === null) return
  if (!NEWS_SOURCES.includes(newsSource)) {
    throw new Error(
      `vendor ${vendorSlug}: unknown newsSource: ${newsSource} (expected one of ${NEWS_SOURCES.join(', ')})`,
    )
  }
}

// Same values as AFFILIATION_IDS in src/content/affiliations.ts. The values are duplicated
// because plain .mjs cannot import TS (same reason as NEWS_SOURCES).
const AFFILIATION_IDS = ['iedukuri100', 'miratsugu', 'kouzou-cram']

/**
 * If affiliations contains an unknown id, throw with a message that tells which value of which
 * vendor
 */
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

// Same values as SOURCE_GENRE_IDS in src/content/sourceGenres.ts. The values are duplicated
// because plain .mjs cannot import TS (same reason as NEWS_SOURCES/AFFILIATION_IDS).
const SOURCE_GENRE_IDS = [
  'candidates',
  'associations',
  'knowledge',
  'builders',
  'hm',
  'condo-reno',
  'money',
  'energy',
  'owners',
]

// Same values as SOURCE_KINDS in src/db/schema.ts.
const SOURCE_KINDS = ['youtube', 'site']

// Same values as AVATAR_HOSTS in src/lib/sources.ts. The values are duplicated because plain
// .mjs cannot import TS (same reason as the other enums). The zod side (isAllowedAvatarUrl in
// sources.schema.ts) silently turns an avatarUrl outside these hosts into null, but seed
// rejects it here and stops the import
// (so that data entry mistakes get noticed. The person who wrote the value can fix
// seed.local.json).
const AVATAR_HOSTS = ['yt3.ggpht.com', 'yt3.googleusercontent.com', 'i.ytimg.com']

/** The shape of a known YouTube channel URL (a minimal reimplementation, on the .mjs side that
 * cannot import TS, of the same judgment as parseYoutubeChannelUrl in src/lib/sources.ts).
 * Used to auto-detect kind at import time */
function looksLikeYoutubeChannelUrl(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  const hosts = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']
  if (!hosts.includes(parsed.hostname.toLowerCase())) return false
  const [first] = parsed.pathname.split('/').filter(Boolean)
  return Boolean(first)
}

/** Validate kind/genre/url/avatarUrl of a source. Throws with a message that tells which
 * value of which slug is invalid (same style as validateAffiliations) */
function validateSource(s) {
  if (s.kind !== undefined && s.kind !== null && !SOURCE_KINDS.includes(s.kind)) {
    throw new Error(
      `source ${s.slug}: unknown kind: ${s.kind} (expected one of ${SOURCE_KINDS.join(', ')})`,
    )
  }
  if (!SOURCE_GENRE_IDS.includes(s.genre)) {
    throw new Error(
      `source ${s.slug}: unknown genre: ${s.genre} (expected one of ${SOURCE_GENRE_IDS.join(', ')})`,
    )
  }
  if (!/^https:\/\//.test(s.url)) {
    throw new Error(`source ${s.slug}: url must start with https://`)
  }
  if (s.avatarUrl != null) {
    if (!/^https:\/\//.test(s.avatarUrl)) {
      throw new Error(`source ${s.slug}: avatarUrl must start with https://`)
    }
    let avatarHost
    try {
      avatarHost = new URL(s.avatarUrl).hostname.toLowerCase()
    } catch {
      throw new Error(`source ${s.slug}: avatarUrl is not a valid URL: ${s.avatarUrl}`)
    }
    if (!AVATAR_HOSTS.includes(avatarHost)) {
      throw new Error(
        `source ${s.slug}: avatarUrl host not allowed: ${avatarHost} (expected one of ${AVATAR_HOSTS.join(', ')})`,
      )
    }
  }
  if (s.affiliation != null && !AFFILIATION_IDS.includes(s.affiliation)) {
    throw new Error(
      `source ${s.slug}: unknown affiliation: ${s.affiliation} (expected one of ${AFFILIATION_IDS.join(', ')})`,
    )
  }
}

/**
 * Validate affiliationLinks ({ [affiliationId]: { url, note? } }). Omission is allowed
 * (the owner's seed.local.json is expected to set it only for some vendors. Same judgment
 * as the zod in src/server/candidates.ts: keys are known affiliation ids, url starts with
 * https://, note is 60 characters or less).
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
 * Convert the content of seed.local.json into D1 INSERT ... ON CONFLICT DO UPDATE statements.
 *
 * @param {object} seed - the parsed seed.local.json object
 * @param {object} opts
 * @param {string} opts.actorEmail - e-mail to put in created_by (DEV_IDENTITY_EMAIL in .dev.vars)
 * @param {string} [opts.now] - ISO-8601 string to put in created_at/updated_at (new Date().toISOString() when omitted)
 * @param {Record<string, {width:number,height:number}>} [opts.photoSizes] - photoId -> actual size.
 *   For photos not in it, no INSERT statement for the photos table is built (for the 1st
 *   call, before the sips conversion).
 * @param {Record<string, {lat:number,lng:number}>} [opts.coords] - place slug -> coordinates.
 *   For places not in it, lat/lng/geocode_source stay NULL (treated as a place that cannot
 *   be shown on the map).
 * @param {Set<string>} [opts.representativePhotoReady] - the set of vendor slugs whose
 *   representativePhoto sips conversion (-> R2 upload) is done. For vendors not in it, the
 *   representative_photo_key column itself is not emitted (so that the DB alone does not
 *   claim "has a photo" when R2 has no object, and so that a value set through the form is
 *   not rolled back to NULL on every re-import). The key of a ready vendor includes a stamp
 *   (same shape as vendorImageKeys in src/lib/photos.ts. A measure against immutable caching).
 *   The stamp is built deterministically from `now` (the real clock is not read directly,
 *   so that tests can fix it).
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
  // The stamp of representative_photo_key (same base36 format as vendorImageKeys in
  // src/lib/photos.ts). It is built deterministically from `now`, so fixing now in a test
  // also fixes the stamp.
  const representativePhotoStamp = new Date(now).getTime().toString(36)

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
        // representative_photo_key has the same shape as vendorImageKeys in src/lib/photos.ts
        // (determined from vendorId + stamp. The stamp is a measure against immutable
        // caching). The column itself is emitted only for vendors whose sips conversion
        // (-> R2 upload) is done. For the same reason as favicon_key, the whole key is
        // omitted (not set to null): upsertStatement puts only the columns present in row
        // into UPDATE SET, so omitting the column here keeps the existing value even though
        // ON CONFLICT DO UPDATE runs on every re-import. If the value were set to null,
        // the column would always be emitted (unlike favicon_key), so merely lacking
        // representativePhoto in seed would roll a photo key uploaded through the form
        // back to NULL (the R2 object remains but becomes invisible from the UI).
        ...(representativePhotoReady.has(v.slug)
          ? {
              representative_photo_key: `vendors/${vendorId}/representative-${representativePhotoStamp}-display.jpg`,
            }
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

  // --- photos (sortOrder follows the order of the src array per visit) ------------
  const photos = []
  for (const vi of seed.visits ?? []) {
    const visitId = visitIdBySlug[vi.slug]
    ;(vi.photos ?? []).forEach((src, sortOrder) => {
      const photoId = slugToId(`${vi.slug}:${basename(src)}`)
      const displayKey = `photos/${visitId}/${photoId}-display.jpg`
      const thumbKey = `photos/${visitId}/${photoId}-thumb.jpg`
      photos.push({ visitSlug: vi.slug, src, photoId, displayKey, thumbKey, sortOrder })

      const size = photoSizes[photoId]
      if (!size) return // no SQL for photos of unknown size (1st call, before sips conversion)

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

  // --- sources ---------------------------------------------------------------
  // url is the natural key (conflictColumn: 'url'): the identity of a source is decided by
  // its URL. When a row with the same URL was created from the form first (different id,
  // sources.url is UNIQUE), with ON CONFLICT(id) the INSERT fails on that UNIQUE violation
  // and the whole --file run stops.
  // With ON CONFLICT(url) it becomes "overwrite the row with the same URL, id included,
  // with the seed content", so the import is idempotent (the id changes = a row the owner
  // added by hand is aligned to the deterministic id of seed).
  // For the other tables id is the natural key, so they stay ON CONFLICT(id).
  for (const s of seed.sources ?? []) {
    validateSource(s)
    sql.push(
      upsertStatement(
        'sources',
        {
          id: slugToId(`source:${s.slug}`),
          kind: s.kind ?? (looksLikeYoutubeChannelUrl(s.url) ? 'youtube' : 'site'),
          name: s.name,
          url: s.url,
          handle: s.handle ?? null,
          channel_id: s.channelId ?? null,
          genre: s.genre,
          description: s.description ?? null,
          avatar_url: s.avatarUrl ?? null,
          vendor_id: resolveId(vendorIdBySlug, s.vendorSlug, 'vendor'),
          affiliation: s.affiliation ?? null,
          sort_order: s.sortOrder ?? 0,
          created_by: actorEmail,
          created_at: now,
          updated_at: now,
        },
        { conflictColumn: 'url' },
      ),
    )
  }

  return { sql, photos }
}
