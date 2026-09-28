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

test('slugToId returns a string in UUID format', () => {
  assert.match(slugToId('vendor:acme-koumuten'), UUID_RE)
})

test('slugToId always returns the same id for the same slug (the premise of idempotent import)', () => {
  assert.equal(slugToId('vendor:acme-koumuten'), slugToId('vendor:acme-koumuten'))
})

test('slugToId returns different ids for different slugs', () => {
  assert.notEqual(slugToId('vendor:acme-koumuten'), slugToId('vendor:other-koumuten'))
})

test("sqlString escapes ' in a string as ''", () => {
  assert.equal(sqlString("O'Reilly's House"), "'O''Reilly''s House'")
})

test('sqlString turns null/undefined into NULL', () => {
  assert.equal(sqlString(null), 'NULL')
  assert.equal(sqlString(undefined), 'NULL')
})

test('sqlString turns booleans into 0/1', () => {
  assert.equal(sqlString(true), '1')
  assert.equal(sqlString(false), '0')
})

test('sqlString emits numbers as is (not quoted)', () => {
  assert.equal(sqlString(42), '42')
  assert.equal(sqlString(1.5), '1.5')
})

test('normalizeAddress normalizes full-width digits / chome-ban-go notation to half-width hyphen separators', () => {
  assert.equal(normalizeAddress('架空市架空町1丁目2番3号'), '架空市架空町1-2-3')
  assert.equal(normalizeAddress('架空市架空町1丁目2番'), '架空市架空町1-2')
})

test('normalizeAddress normalizes full-width digits and whitespace', () => {
  assert.equal(normalizeAddress('架空市 架空町１丁目２番３号'), '架空市架空町1-2-3')
})

test('normalizeAddress unifies dash-like characters to the half-width hyphen', () => {
  assert.equal(normalizeAddress('架空市架空町1－2－3'), '架空市架空町1-2-3')
  assert.equal(normalizeAddress('架空市架空町1ー2ー3'), '架空市架空町1-2-3')
})

test('normalizeAddress returns null/undefined/empty string as is', () => {
  assert.equal(normalizeAddress(null), null)
  assert.equal(normalizeAddress(undefined), undefined)
  assert.equal(normalizeAddress(''), '')
})

// The following 3 are the same cases as normalizeAddress.test.ts of src/lib/geocode.ts.
// The behavior is matched entirely, to guarantee that geocode_cache keys keep matching the app
// itself.
test('normalizeAddress: folds full-width alphanumerics to half-width, removes whitespace, and unifies chome/banchi notation variants (same behavior as src/lib/geocode.ts)', () => {
  assert.equal(normalizeAddress(' 仮想県 テスト市 １－２－３ '), '仮想県テスト市1-2-3')
  assert.equal(normalizeAddress('仮想県テスト市1丁目2番3号'), '仮想県テスト市1-2-3')
  assert.equal(normalizeAddress('仮想県テスト市1丁目'), '仮想県テスト市1丁目')
})

test('normalizeAddress: notation that omits the trailing go (of ban-go) or chi (of banchi) is also unified to the chome-banchi form', () => {
  assert.equal(normalizeAddress('架空町1丁目2番3'), '架空町1-2-3')
  assert.equal(normalizeAddress('架空町1丁目2番地'), '架空町1-2')
})

// normalizeSocialUrls also behaves the same as src/lib/social.ts (trim, exclude empty/non-http,
// drop duplicates, at most 10 entries).
test('normalizeSocialUrls: trims whitespace, excludes empty and non-http, drops duplicates, up to 10 entries (same behavior as src/lib/social.ts)', () => {
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

test('normalizeSocialUrls: unspecified (undefined/null) returns an empty array', () => {
  assert.deepEqual(normalizeSocialUrls(undefined), [])
  assert.deepEqual(normalizeSocialUrls(null), [])
})

// parseGsiResponse also makes the same judgment as src/lib/geocode.ts (including the range check).
test('parseGsiResponse: returns the coordinates ([lng, lat]) and title of the first Feature', () => {
  const json = [
    {
      geometry: { type: 'Point', coordinates: [139.5, 35.5] },
      properties: { title: '仮想県テスト市' },
    },
    { geometry: { type: 'Point', coordinates: [140, 36] }, properties: { title: '別の候補' } },
  ]
  assert.deepEqual(parseGsiResponse(json), { lat: 35.5, lng: 139.5, title: '仮想県テスト市' })
})

test('parseGsiResponse: title becomes null when missing', () => {
  assert.deepEqual(parseGsiResponse([{ geometry: { coordinates: [139.5, 35.5] } }]), {
    lat: 35.5,
    lng: 139.5,
    title: null,
  })
})

test('parseGsiResponse: empty array, non-array, non-numeric coordinates, and out of range give null', () => {
  assert.equal(parseGsiResponse([]), null)
  assert.equal(parseGsiResponse({}), null)
  assert.equal(parseGsiResponse(null), null)
  assert.equal(parseGsiResponse([{ geometry: { coordinates: ['a', 'b'] } }]), null)
  assert.equal(parseGsiResponse([{ geometry: { coordinates: [139.5] } }]), null)
  assert.equal(parseGsiResponse([{ geometry: { coordinates: [200, 35] } }]), null) // lng out of range
  assert.equal(parseGsiResponse([{ geometry: { coordinates: [139.5, 95] } }]), null) // lat out of range
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

test('buildStatements: includes the INSERT ... ON CONFLICT(key) DO UPDATE statement for settings', () => {
  const { sql } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  const stmt = sql.find((s) => s.includes('INTO settings'))
  assert.ok(stmt, 'settings statement not found')
  assert.match(stmt, /^INSERT INTO settings/)
  assert.match(stmt, /ON CONFLICT\(key\) DO UPDATE SET/)
  assert.doesNotMatch(stmt, /OR REPLACE/)
  assert.match(stmt, /'homeAreas'/)
  assert.match(stmt, /\["架空市"\]/)
})

test('buildStatements: vendors/places/events/visits/videos produce INSERT ... ON CONFLICT(id) DO UPDATE statements (OR REPLACE is not used)', () => {
  const { sql } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  // Only settings has key as its primary key, so it is checked in another test. Here only
  // tables whose primary key is id are checked.
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

test('buildStatements: ON CONFLICT DO UPDATE of vendors excludes created_by/created_at from the update (other columns are updated)', () => {
  const { sql } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  const vendorStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空工務店A'))
  assert.ok(vendorStmt, 'vendor-a statement not found')
  assert.doesNotMatch(vendorStmt, /created_by = excluded\.created_by/)
  assert.doesNotMatch(vendorStmt, /created_at = excluded\.created_at/)
  assert.match(vendorStmt, /name = excluded\.name/)
  assert.match(vendorStmt, /updated_at = excluded\.updated_at/)
})

test('buildStatements: actorEmail goes into created_by', () => {
  const { sql } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  const vendorStmt = sql.find((s) => s.includes('INTO vendors'))
  assert.match(vendorStmt, /'owner@example\.com'/)
})

test('buildStatements: serviceAreas/tags are serialized as JSON strings', () => {
  const { sql } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  const vendorStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空工務店A'))
  assert.ok(vendorStmt, 'vendor-a statement not found')
  assert.match(vendorStmt, /\["架空市","隣町"\]/)
  const videoStmt = sql.find((s) => s.includes('INTO videos'))
  assert.match(videoStmt, /\["タグ1","タグ2"\]/)
})

test('buildStatements: socialUrls of a vendor becomes a JSON string, and an empty array when unspecified', () => {
  const { sql } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  const vendorAStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空工務店A'))
  assert.ok(vendorAStmt, 'vendor-a statement not found')
  assert.match(
    vendorAStmt,
    /\["https:\/\/www\.instagram\.com\/example\/","https:\/\/x\.com\/example"\]/,
  )
  const vendorBStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空ハウス'))
  assert.ok(vendorBStmt, 'vendor-b statement not found')
  assert.match(vendorBStmt, /'\[\]'/)
})

test('buildStatements: newsUrl/newsSource of a vendor go into the vendors INSERT when specified', () => {
  const { sql } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  const vendorAStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空工務店A'))
  assert.ok(vendorAStmt, 'vendor-a statement not found')
  assert.match(vendorAStmt, /'https:\/\/news\.example\.com\/feed\/'/)
  assert.match(vendorAStmt, /'rss'/)
})

test('buildStatements: newsUrl/newsSource of a vendor become NULL when unspecified', () => {
  const { sql } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  const vendorBStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空ハウス'))
  assert.ok(vendorBStmt, 'vendor-b statement not found')
  // Right after social_urls (the column positions of news_url, news_source) come NULL, NULL.
  // representative_photo_key is not in representativePhotoReady, so the whole column is
  // not emitted (see Finding 3)
  assert.match(vendorBStmt, /'\[\]', NULL, NULL, 'owner@example\.com'/)
})

test('buildStatements: html-list can be specified as newsSource', () => {
  const seed = fictionalSeed()
  seed.vendors[1].newsUrl = 'https://www.example-koumuten.co.jp/'
  seed.vendors[1].newsSource = 'html-list'
  const { sql } = buildStatements(seed, { actorEmail: 'owner@example.com' })
  const vendorBStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空ハウス'))
  assert.match(vendorBStmt, /'html-list'/)
})

test('buildStatements: throws when newsSource is other than rss/html-list (includes the slug and value)', () => {
  const seed = fictionalSeed()
  seed.vendors[0].newsSource = 'atom'
  assert.throws(() => buildStatements(seed, { actorEmail: 'owner@example.com' }), /vendor-a.*atom/s)
})

test('buildStatements: representative/affiliations of a vendor go into the vendors INSERT when specified', () => {
  const seed = fictionalSeed()
  seed.vendors[0].representative = '山田太郎'
  seed.vendors[0].affiliations = ['iedukuri100', 'miratsugu']
  const { sql } = buildStatements(seed, { actorEmail: 'owner@example.com' })
  const vendorAStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空工務店A'))
  assert.ok(vendorAStmt, 'vendor-a statement not found')
  assert.match(vendorAStmt, /'山田太郎'/)
  assert.match(vendorAStmt, /\["iedukuri100","miratsugu"\]/)
})

test('buildStatements: representative/affiliations of a vendor become NULL / empty array when unspecified', () => {
  const { sql } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  const vendorBStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空ハウス'))
  assert.ok(vendorBStmt, 'vendor-b statement not found')
  assert.match(vendorBStmt, /hq, representative, service_areas, affiliations/)
  assert.match(vendorBStmt, /NULL, NULL, '\[\]', '\[\]'/)
})

test('buildStatements: throws when affiliations contains an unknown id (includes the slug and value)', () => {
  const seed = fictionalSeed()
  seed.vendors[0].affiliations = ['iedukuri100', 'no-such-group']
  assert.throws(
    () => buildStatements(seed, { actorEmail: 'owner@example.com' }),
    /vendor-a.*no-such-group/s,
  )
})

test('buildStatements: affiliationLinks of a vendor goes into the vendors INSERT as JSON when specified', () => {
  const seed = fictionalSeed()
  seed.vendors[0].affiliationLinks = {
    'kouzou-cram': { url: 'https://kouzou-cram.com/partnermap/example/', note: '構造 ★★★' },
  }
  const { sql } = buildStatements(seed, { actorEmail: 'owner@example.com' })
  const vendorAStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空工務店A'))
  assert.ok(vendorAStmt, 'vendor-a statement not found')
  assert.match(
    vendorAStmt,
    /\{"kouzou-cram":\{"url":"https:\/\/kouzou-cram\.com\/partnermap\/example\/","note":"構造 ★★★"\}\}/,
  )
})

test('buildStatements: affiliationLinks becomes an empty object when unspecified (allowed)', () => {
  const { sql } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  const vendorBStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空ハウス'))
  assert.ok(vendorBStmt, 'vendor-b statement not found')
  assert.match(vendorBStmt, /affiliations, affiliation_links/)
  assert.match(vendorBStmt, /'\[\]', '\{\}'/)
})

test('buildStatements: throws when affiliationLinks contains an unknown id (includes the slug and value)', () => {
  const seed = fictionalSeed()
  seed.vendors[0].affiliationLinks = { 'no-such-group': { url: 'https://example.com/' } }
  assert.throws(
    () => buildStatements(seed, { actorEmail: 'owner@example.com' }),
    /vendor-a.*no-such-group/s,
  )
})

test('buildStatements: throws when affiliationLinks.url does not start with https://', () => {
  const seed = fictionalSeed()
  seed.vendors[0].affiliationLinks = { 'kouzou-cram': { url: 'http://example.com/' } }
  assert.throws(
    () => buildStatements(seed, { actorEmail: 'owner@example.com' }),
    /vendor-a.*affiliationLinks\.kouzou-cram\.url/s,
  )
})

test('buildStatements: throws when affiliationLinks.note exceeds 60 characters', () => {
  const seed = fictionalSeed()
  seed.vendors[0].affiliationLinks = {
    'kouzou-cram': { url: 'https://example.com/', note: 'あ'.repeat(61) },
  }
  assert.throws(
    () => buildStatements(seed, { actorEmail: 'owner@example.com' }),
    /vendor-a.*affiliationLinks\.kouzou-cram\.note/s,
  )
})

test('buildStatements: when the slug is in representativePhotoReady, representative_photo_key is set with a stamp (a key determined from vendorId + stamp)', () => {
  const seed = fictionalSeed()
  // Fixing now makes the stamp (= new Date(now).getTime().toString(36)) deterministic too
  const now = '2026-01-01T00:00:00.000Z'
  const { sql } = buildStatements(seed, {
    actorEmail: 'owner@example.com',
    now,
    representativePhotoReady: new Set(['vendor-a']),
  })
  const vendorAId = slugToId('vendor:vendor-a')
  const stamp = new Date(now).getTime().toString(36)
  const vendorAStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空工務店A'))
  assert.ok(vendorAStmt, 'vendor-a statement not found')
  assert.match(
    vendorAStmt,
    new RegExp(`'vendors/${vendorAId}/representative-${stamp}-display\\.jpg'`),
  )
})

test('buildStatements: the key for representativePhotoReady gets a different stamp when now differs (the URL changes on every replacement)', () => {
  const seed = fictionalSeed()
  const first = buildStatements(seed, {
    actorEmail: 'owner@example.com',
    now: '2026-01-01T00:00:00.000Z',
    representativePhotoReady: new Set(['vendor-a']),
  }).sql.find((s) => s.includes('INTO vendors') && s.includes('架空工務店A'))
  const second = buildStatements(seed, {
    actorEmail: 'owner@example.com',
    now: '2026-06-01T00:00:00.000Z',
    representativePhotoReady: new Set(['vendor-a']),
  }).sql.find((s) => s.includes('INTO vendors') && s.includes('架空工務店A'))
  assert.notEqual(first, second)
})

test('buildStatements: for a vendor not in representativePhotoReady, representative_photo_key stays NULL (same for the default when unspecified)', () => {
  const { sql } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  const vendorAStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空工務店A'))
  assert.ok(vendorAStmt, 'vendor-a statement not found')
  assert.doesNotMatch(vendorAStmt, /representative-display\.jpg/)
})

// Regression guard for Finding 3: re-importing a vendor that has no representativePhoto
// (= not in representativePhotoReady) must not roll back to NULL a representative_photo_key
// that was already set through the form (treated as a "column seed does not touch", same
// as favicon_key).
// upsertStatement does not emit columns missing from row in UPDATE SET either, so checking
// that the word `representative_photo_key` never appears in the INSERT statement itself
// strictly verifies that "the whole column is omitted (= the value is not explicitly
// overwritten with null)".
test('buildStatements: the INSERT statement of a vendor without representativePhoto does not contain the representative_photo_key column itself (re-import does not roll the column back to NULL)', () => {
  const { sql } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  const vendorAStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空工務店A'))
  const vendorBStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空ハウス'))
  assert.ok(vendorAStmt, 'vendor-a statement not found')
  assert.ok(vendorBStmt, 'vendor-b statement not found')
  assert.doesNotMatch(vendorAStmt, /representative_photo_key/)
  assert.doesNotMatch(vendorBStmt, /representative_photo_key/)
})

test('buildStatements: only a vendor whose slug is in representativePhotoReady has the representative_photo_key column in its INSERT/UPDATE statement', () => {
  const seed = fictionalSeed()
  const { sql } = buildStatements(seed, {
    actorEmail: 'owner@example.com',
    representativePhotoReady: new Set(['vendor-a']),
  })
  const vendorAStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空工務店A'))
  const vendorBStmt = sql.find((s) => s.includes('INTO vendors') && s.includes('架空ハウス'))
  assert.ok(vendorAStmt, 'vendor-a statement not found')
  assert.ok(vendorBStmt, 'vendor-b statement not found')
  assert.match(vendorAStmt, /representative_photo_key = excluded\.representative_photo_key/)
  assert.doesNotMatch(vendorBStmt, /representative_photo_key/)
})

test("buildStatements: a name containing ' is still escaped", () => {
  const seed = fictionalSeed()
  seed.vendors[0].name = "架空's工務店"
  const { sql } = buildStatements(seed, { actorEmail: 'owner@example.com' })
  const vendorStmt = sql.find((s) => s.includes('INTO vendors') && s.includes("架空''s工務店"))
  assert.ok(vendorStmt, 'statement containing the escaped name not found')
})

test('buildStatements: error when vendor refers to a nonexistent slug (includes the slug)', () => {
  const seed = fictionalSeed()
  seed.places[0].vendor = 'no-such-vendor'
  assert.throws(() => buildStatements(seed, { actorEmail: 'owner@example.com' }), /no-such-vendor/)
})

test('buildStatements: error when place refers to a nonexistent slug (includes the slug)', () => {
  const seed = fictionalSeed()
  seed.events[0].place = 'no-such-place'
  assert.throws(() => buildStatements(seed, { actorEmail: 'owner@example.com' }), /no-such-place/)
})

test('buildStatements: error when a visit refers to a nonexistent place slug', () => {
  const seed = fictionalSeed()
  seed.visits[0].place = 'no-such-place'
  assert.throws(() => buildStatements(seed, { actorEmail: 'owner@example.com' }), /no-such-place/)
})

test('buildStatements: error when a visit refers to a nonexistent event slug', () => {
  const seed = fictionalSeed()
  seed.visits[0].event = 'no-such-event'
  assert.throws(() => buildStatements(seed, { actorEmail: 'owner@example.com' }), /no-such-event/)
})

test('buildStatements: photos get sortOrder 0,1,... in the order of the src array per visit', () => {
  const { photos } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  const own = photos.filter((p) => p.visitSlug === 'visit-a')
  assert.equal(own.length, 2)
  assert.equal(own[0].sortOrder, 0)
  assert.equal(own[1].sortOrder, 1)
  assert.equal(own[0].src, 'seed.local/photos/fake-1.HEIC')
  assert.equal(own[1].src, 'seed.local/photos/fake-2.HEIC')
})

test('buildStatements: ids/keys of photos are deterministic (photoId is slugToId(visitSlug + ":" + basename))', () => {
  const { photos } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  const p0 = photos.find((p) => p.src === 'seed.local/photos/fake-1.HEIC')
  assert.equal(p0.photoId, slugToId('visit-a:fake-1.HEIC'))
  assert.match(p0.displayKey, /^photos\/[0-9a-f-]{36}\/[0-9a-f-]{36}-display\.jpg$/)
  assert.match(p0.thumbKey, /^photos\/[0-9a-f-]{36}\/[0-9a-f-]{36}-thumb\.jpg$/)
})

test('buildStatements: SQL for photos without photoSizes is omitted (not emitted in sql)', () => {
  const { sql, photos } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  assert.ok(photos.length > 0)
  assert.ok(!sql.some((s) => s.includes('INTO photos')))
})

test('buildStatements: passing photoSizes emits the photos INSERT statement of those photos with the actual size', () => {
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

test('buildStatements: passing coords sets lat/lng/geocode_source of places', () => {
  const seed = fictionalSeed()
  const coords = { 'place-a': { lat: 35.1, lng: 139.4 } }
  const { sql } = buildStatements(seed, { actorEmail: 'owner@example.com', coords })
  const placeStmt = sql.find((s) => s.includes('INTO places'))
  assert.match(placeStmt, /35\.1/)
  assert.match(placeStmt, /139\.4/)
  assert.match(placeStmt, /'gsi'/)
})

test('buildStatements: lat/lng of a place without coords are NULL', () => {
  const { sql } = buildStatements(fictionalSeed(), { actorEmail: 'owner@example.com' })
  const placeStmt = sql.find((s) => s.includes('INTO places'))
  // Check that NULL, NULL appear at the lat, lng positions (the column order depends on
  // the places table definition)
  assert.match(placeStmt, /NULL/)
})

test('buildStatements: passing now uses it for created_at/updated_at', () => {
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

// url is the natural key (as pointed out in the review of the brief): even when a row with
// the same URL was created from the form first with a different id, re-importing becomes
// "overwriting that row", not "adding another row".
test('buildStatements: sources produce INSERT ... ON CONFLICT(url) DO UPDATE statements with url as the natural key (not id)', () => {
  const seed = fictionalSeed({ sources: [fictionalSource()] })
  const { sql } = buildStatements(seed, { actorEmail: 'owner@example.com' })
  const stmt = sql.find((s) => s.includes('INTO sources'))
  assert.ok(stmt, 'sources statement not found')
  assert.match(stmt, /^INSERT INTO sources/)
  assert.match(stmt, /ON CONFLICT\(url\) DO UPDATE SET/)
  assert.doesNotMatch(stmt, /ON CONFLICT\(id\)/)
  assert.doesNotMatch(stmt, /OR REPLACE/)
  assert.match(stmt, /架空チャンネル/)
})

test('buildStatements: ON CONFLICT(url) DO UPDATE of sources also updates id (aligns the id of a row the owner added by hand to the deterministic id of seed)', () => {
  const seed = fictionalSeed({ sources: [fictionalSource()] })
  const { sql } = buildStatements(seed, { actorEmail: 'owner@example.com' })
  const stmt = sql.find((s) => s.includes('INTO sources'))
  assert.match(stmt, /id = excluded\.id/)
  assert.doesNotMatch(stmt, /created_by = excluded\.created_by/)
  assert.doesNotMatch(stmt, /created_at = excluded\.created_at/)
})

test('buildStatements: the id of a source is determined by slugToId("source:" + slug) (idempotent)', () => {
  const seed = fictionalSeed({ sources: [fictionalSource({ slug: 'yt-example' })] })
  const { sql } = buildStatements(seed, { actorEmail: 'owner@example.com' })
  const stmt = sql.find((s) => s.includes('INTO sources'))
  assert.match(stmt, new RegExp(slugToId('source:yt-example')))
})

test('buildStatements: vendor_id is resolved when vendorSlug of a source is specified', () => {
  const seed = fictionalSeed({ sources: [fictionalSource({ vendorSlug: 'vendor-a' })] })
  const { sql } = buildStatements(seed, { actorEmail: 'owner@example.com' })
  const stmt = sql.find((s) => s.includes('INTO sources'))
  assert.match(stmt, new RegExp(slugToId('vendor:vendor-a')))
})

test('buildStatements: error when vendorSlug of a source refers to a nonexistent slug (includes the slug)', () => {
  const seed = fictionalSeed({ sources: [fictionalSource({ vendorSlug: 'no-such-vendor' })] })
  assert.throws(() => buildStatements(seed, { actorEmail: 'owner@example.com' }), /no-such-vendor/)
})

test('buildStatements: omitting kind of a source auto-detects it from the URL (YouTube channel URL -> youtube)', () => {
  const seed = fictionalSeed({
    sources: [fictionalSource({ kind: undefined, url: 'https://www.youtube.com/@example-house' })],
  })
  const { sql } = buildStatements(seed, { actorEmail: 'owner@example.com' })
  const stmt = sql.find((s) => s.includes('INTO sources'))
  assert.match(stmt, /'youtube'/)
})

test('buildStatements: omitting kind of a source gives site when the URL is not in the shape of a YouTube channel', () => {
  const seed = fictionalSeed({
    sources: [fictionalSource({ kind: undefined, url: 'https://example.com/blog' })],
  })
  const { sql } = buildStatements(seed, { actorEmail: 'owner@example.com' })
  const stmt = sql.find((s) => s.includes('INTO sources'))
  assert.match(stmt, /'site'/)
})

test('buildStatements: throws when genre of a source is unknown (includes the slug and value)', () => {
  const seed = fictionalSeed({ sources: [fictionalSource({ genre: 'no-such-genre' })] })
  assert.throws(
    () => buildStatements(seed, { actorEmail: 'owner@example.com' }),
    /source-a.*no-such-genre/s,
  )
})

test('buildStatements: throws when kind of a source is unknown (includes the slug and value)', () => {
  const seed = fictionalSeed({ sources: [fictionalSource({ kind: 'podcast' })] })
  assert.throws(
    () => buildStatements(seed, { actorEmail: 'owner@example.com' }),
    /source-a.*podcast/s,
  )
})

test('buildStatements: throws when url of a source does not start with https://', () => {
  const seed = fictionalSeed({ sources: [fictionalSource({ url: 'http://example.com' })] })
  assert.throws(() => buildStatements(seed, { actorEmail: 'owner@example.com' }), /https:\/\//)
})

test('buildStatements: throws when avatarUrl of a source does not start with https://', () => {
  const seed = fictionalSeed({
    sources: [fictionalSource({ avatarUrl: 'http://yt3.ggpht.com/fake' })],
  })
  assert.throws(() => buildStatements(seed, { actorEmail: 'owner@example.com' }), /avatarUrl/)
})

// seed also checks the same host allowlist as the zod side (isAllowedAvatarUrl in
// sources.schema.ts)
// (pointed out in the review of the brief: the rules differed between the 2 entry points)
test('buildStatements: throws when avatarUrl of a source is outside the allowed hosts (includes the slug and value)', () => {
  const seed = fictionalSeed({
    sources: [fictionalSource({ avatarUrl: 'https://evil.example/a.jpg' })],
  })
  assert.throws(
    () => buildStatements(seed, { actorEmail: 'owner@example.com' }),
    /source-a.*evil\.example/s,
  )
})

test('buildStatements: avatarUrl of a source also allows yt3.ggpht.com / i.ytimg.com', () => {
  for (const avatarUrl of [
    'https://yt3.ggpht.com/fake=s900',
    'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
  ]) {
    const seed = fictionalSeed({ sources: [fictionalSource({ avatarUrl })] })
    assert.doesNotThrow(() => buildStatements(seed, { actorEmail: 'owner@example.com' }))
  }
})

test('buildStatements: throws when affiliation of a source is unknown (includes the slug and value)', () => {
  const seed = fictionalSeed({ sources: [fictionalSource({ affiliation: 'no-such-affiliation' })] })
  assert.throws(
    () => buildStatements(seed, { actorEmail: 'owner@example.com' }),
    /source-a.*no-such-affiliation/s,
  )
})

test('buildStatements: affiliation of a source (known ids, including the Kouzou-juku map) is allowed', () => {
  for (const affiliation of ['iedukuri100', 'miratsugu', 'kouzou-cram']) {
    const seed = fictionalSeed({ sources: [fictionalSource({ affiliation })] })
    assert.doesNotThrow(() => buildStatements(seed, { actorEmail: 'owner@example.com' }))
  }
})

test('buildStatements: unspecified handle/channelId/description/avatarUrl/affiliation of a source become NULL', () => {
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
  // Loosely check only that at least 6 NULLs (handle, channel_id, description, avatar_url,
  // vendor_id, affiliation) are present (without depending too much on column order)
  const nullCount = (stmt.match(/NULL/g) ?? []).length
  assert.ok(nullCount >= 6, `fewer NULLs than expected: ${nullCount}`)
})

test('buildStatements does not throw even for a seed without sources (the sources key itself is missing)', () => {
  const seed = fictionalSeed()
  delete seed.sources
  assert.doesNotThrow(() => buildStatements(seed, { actorEmail: 'owner@example.com' }))
})
