#!/usr/bin/env node
/**
 * CLI that imports seed.local.json (gitignored real data) into D1/R2.
 *
 *   node scripts/import-seed.mjs --local|--remote [--dry-run]
 *
 * Idempotent: buildStatements in scripts/lib/seed.mjs builds ids deterministically from
 * slugs and writes everything with `INSERT ... ON CONFLICT DO UPDATE`, so running it any
 * number of times with the same arguments gives the same result (`INSERT OR REPLACE` is
 * not used: it DELETEs the existing row once and recreates it, which also deletes child
 * rows whose foreign key is ON DELETE CASCADE, such as vendor_news).
 *
 * Flow:
 *   1. Read DEV_IDENTITY_EMAIL from .dev.vars (= created_by. Never print it here)
 *   2. Read seed.local.json
 *   3. Convert places to coordinates with the GSI address search API (1 request per 1.2 s).
 *      The results are also written to geocode_cache
 *   4. Convert photos (HEIC) to display/thumb JPEGs with sips and measure the actual size
 *      (macOS only)
 *   5. Build the final SQL with buildStatements and put it into 1 file
 *   6. With --dry-run, print statistics here and exit. Otherwise put photos to R2 -> run
 *      the SQL on D1 -> show the counts
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildStatements,
  normalizeAddress,
  parseGsiResponse,
  slugToId,
  sqlString,
} from './lib/seed.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATABASE = 'sumai-log'
const R2_BUCKET = 'sumai-log-photos'
// Same value as GSI_ADDRESS_SEARCH in src/lib/geocode.ts. The value is duplicated because
// plain .mjs cannot import TS. When changing it, fix both.
const GSI_ENDPOINT = 'https://msearch.gsi.go.jp/address-search/AddressSearch'
const GSI_PAUSE_MS = 1200

/**
 * All table names that buildStatements produces (geocode_cache is added on the import-seed side)
 */
const ALL_TABLES = [
  'settings',
  'vendors',
  'places',
  'events',
  'visits',
  'photos',
  'videos',
  'sources',
  'geocode_cache',
]

function parseArgs(argv) {
  const target = argv.includes('--local') ? 'local' : argv.includes('--remote') ? 'remote' : null
  const dryRun = argv.includes('--dry-run')
  return { target, dryRun }
}

/** Minimal parser for .dev.vars. It only strips quotes from values (same style as check-pii.mjs) */
function unquote(v) {
  return v.length >= 2 && v[0] === v[v.length - 1] && (v[0] === '"' || v[0] === "'")
    ? v.slice(1, -1)
    : v
}
function readDevVars() {
  const path = resolve(root, '.dev.vars')
  if (!existsSync(path)) {
    throw new Error('.dev.vars が見つかりません（ローカル開発用の値をコピーして作ってください）')
  }
  const vars = Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), unquote(l.slice(i + 1).trim())]
      }),
  )
  if (!vars.DEV_IDENTITY_EMAIL) {
    throw new Error('.dev.vars に DEV_IDENTITY_EMAIL がありません')
  }
  return vars
}

function wrangler(args, opts = {}) {
  return execFileSync('npx', ['wrangler', ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: opts.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  })
}

function targetFlag(target) {
  return target === 'local' ? '--local' : '--remote'
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms))
}

/**
 * Convert places (with an address) to coordinates with the GSI address search API.
 * Places that are not found or have no address are not included in coords (lat/lng stays
 * NULL on the caller side).
 * For the ones found, INSERT statements for geocode_cache are also returned.
 *
 * Response parsing (including the range check) is delegated to parseGsiResponse in seed.mjs,
 * to make the same judgment as src/server/geocode.ts in the app itself.
 */
async function geocodePlaces(places, now) {
  const coords = {}
  const geocodeCacheSql = []
  const withAddress = places.filter((p) => p.address)
  const skippedNoAddress = places.length - withAddress.length

  for (const place of withAddress) {
    const query = normalizeAddress(place.address)
    let json = []
    try {
      const res = await fetch(`${GSI_ENDPOINT}?q=${encodeURIComponent(query)}`)
      if (res.ok) json = await res.json()
    } catch {
      json = []
    }
    const hit = parseGsiResponse(json)

    if (hit) {
      coords[place.slug] = { lat: hit.lat, lng: hit.lng }
      geocodeCacheSql.push(
        `INSERT OR REPLACE INTO geocode_cache (query, lat, lng, title, fetched_at) VALUES (${sqlString(query)}, ${sqlString(hit.lat)}, ${sqlString(hit.lng)}, ${sqlString(hit.title)}, ${sqlString(now)});`,
      )
    }

    await sleep(GSI_PAUSE_MS)
  }

  const notFound = withAddress.length - Object.keys(coords).length
  return { coords, geocodeCacheSql, skippedNoAddress, notFound }
}

/**
 * Convert the representative's portrait photo to display(800px)/thumb(240px) JPEGs with sips
 * (same size convention as vendorImageKeys in src/lib/photos.ts: smaller than visit photos).
 * Conversion is not possible outside macOS, so do nothing and return empty (same policy as
 * convertPhotos).
 * The actual size is not needed (the vendors table has no width/height columns), so it is
 * not measured.
 *
 * Returns a map of vendor slug -> { vendorId, displayPath, thumbPath } (only vendors whose
 * conversion succeeded).
 * Pass a Set of this map's keys (slugs) as representativePhotoReady of buildStatements.
 */
function convertRepresentativePhotos(vendorRows) {
  const withPhoto = (vendorRows ?? []).filter((v) => v.representativePhoto)
  if (process.platform !== 'darwin') {
    if (withPhoto.length > 0) {
      console.log(
        `代表者の写真は変換できないので飛ばします（sips は macOS 専用。現在: ${process.platform}）。`,
      )
    }
    return {}
  }
  if (withPhoto.length === 0) return {}

  const outDir = resolve(root, 'seed.local/out')
  mkdirSync(outDir, { recursive: true })

  const ready = {}
  for (const v of withPhoto) {
    const vendorId = slugToId(`vendor:${v.slug}`)
    const src = resolve(root, v.representativePhoto)
    const displayPath = resolve(outDir, `rep-${vendorId}-display.jpg`)
    const thumbPath = resolve(outDir, `rep-${vendorId}-thumb.jpg`)

    execFileSync(
      'sips',
      ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', '-Z', '800', src, '--out', displayPath],
      { stdio: 'pipe' },
    )
    execFileSync(
      'sips',
      ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', '-Z', '240', src, '--out', thumbPath],
      { stdio: 'pipe' },
    )
    ready[v.slug] = { vendorId, displayPath, thumbPath }
  }
  return ready
}

/**
 * Read the actual size of display with sips -g. Picks the number from a line like "  pixelWidth:
 * 1600"
 */
function readPixelSize(path) {
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', path], {
    encoding: 'utf8',
  })
  const width = Number(out.match(/pixelWidth:\s*(\d+)/)?.[1])
  const height = Number(out.match(/pixelHeight:\s*(\d+)/)?.[1])
  if (!width || !height) throw new Error(`sips が ${path} の実寸を読めなかった`)
  return { width, height }
}

/**
 * Convert photos (HEIC) to display(1600px)/thumb(400px) JPEGs and measure the actual size
 * of display.
 * Conversion is not possible outside macOS, so do nothing and return an empty result.
 *
 * Returns a map of photoId -> { displayPath, thumbPath }. For the SQL/R2 keys of photos,
 * buildStatements is called 2 times (before and after the coordinates and actual sizes are
 * known), so references to descriptor objects cannot be reused. photoId is determined
 * deterministically from visitSlug + basename, so looking this map up by id keeps the
 * correspondence across calls.
 */
function convertPhotos(photoDescriptors) {
  if (process.platform !== 'darwin') {
    console.log(
      `写真は変換できないので飛ばします（sips は macOS 専用。現在: ${process.platform}）。SQL のみ流します。`,
    )
    return { photoSizes: {}, photoPaths: {} }
  }
  if (photoDescriptors.length === 0) return { photoSizes: {}, photoPaths: {} }

  const outDir = resolve(root, 'seed.local/out')
  mkdirSync(outDir, { recursive: true })

  const photoSizes = {}
  const photoPaths = {}
  for (const p of photoDescriptors) {
    const src = resolve(root, p.src)
    const displayPath = resolve(outDir, `${p.photoId}-display.jpg`)
    const thumbPath = resolve(outDir, `${p.photoId}-thumb.jpg`)

    execFileSync(
      'sips',
      [
        '-s',
        'format',
        'jpeg',
        '-s',
        'formatOptions',
        '80',
        '-Z',
        '1600',
        src,
        '--out',
        displayPath,
      ],
      { stdio: 'pipe' },
    )
    execFileSync(
      'sips',
      ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', '-Z', '400', src, '--out', thumbPath],
      { stdio: 'pipe' },
    )

    photoSizes[p.photoId] = readPixelSize(displayPath)
    photoPaths[p.photoId] = { displayPath, thumbPath }
  }
  return { photoSizes, photoPaths }
}

function countPerTable(target) {
  const counts = {}
  for (const table of ALL_TABLES) {
    const out = wrangler(
      [
        'd1',
        'execute',
        DATABASE,
        targetFlag(target),
        '--command',
        `select count(*) as n from ${table};`,
        '--json',
      ],
      { capture: true },
    )
    const parsed = JSON.parse(out)
    counts[table] = parsed[0]?.results?.[0]?.n ?? null
  }
  return counts
}

async function main() {
  const { target, dryRun } = parseArgs(process.argv.slice(2))
  if (!target) {
    console.error('Usage: node scripts/import-seed.mjs --local|--remote [--dry-run]')
    process.exit(1)
  }

  const devVars = readDevVars()
  const actorEmail = devVars.DEV_IDENTITY_EMAIL
  const now = new Date().toISOString()
  // Build here the same value as the stamp that buildStatements (scripts/lib/seed.mjs) embeds
  // in representative_photo_key (so the key actually put to R2 matches the value written to the
  // DB).
  const representativePhotoStamp = new Date(now).getTime().toString(36)

  const seedPath = resolve(root, 'seed.local.json')
  if (!existsSync(seedPath)) {
    console.error('seed.local.json が見つかりません。')
    process.exit(1)
  }
  const seed = JSON.parse(readFileSync(seedPath, 'utf8'))

  // 1st call: before the coordinates and photo sizes are known. Used only to get the photos
  // descriptors (src/photoId/keys)
  const { photos: photoDescriptors } = buildStatements(seed, { actorEmail, now })

  console.log(
    `国土地理院 API で ${seed.places?.length ?? 0} 件の場所を座標に変換中（1件あたり${GSI_PAUSE_MS}ms待機）…`,
  )
  const { coords, geocodeCacheSql, skippedNoAddress, notFound } = await geocodePlaces(
    seed.places ?? [],
    now,
  )
  console.log(
    `  → 座標が付いた場所: ${Object.keys(coords).length} / 住所なし: ${skippedNoAddress} / 該当なし: ${notFound}`,
  )

  console.log(`写真 ${photoDescriptors.length} 枚を変換中…`)
  const { photoSizes, photoPaths } = convertPhotos(photoDescriptors)
  console.log(
    `  → 実寸を取得できた写真: ${Object.keys(photoSizes).length} / ${photoDescriptors.length}`,
  )

  const repPhotoVendors = (seed.vendors ?? []).filter((v) => v.representativePhoto)
  console.log(`代表者の写真 ${repPhotoVendors.length} 枚を変換中…`)
  const repPhotosReady = convertRepresentativePhotos(seed.vendors)
  console.log(
    `  → 変換できた代表者の写真: ${Object.keys(repPhotosReady).length} / ${repPhotoVendors.length}`,
  )

  // 2nd call: the final SQL including coordinates, photo sizes and the representative photo
  // conversion results
  const { sql, photos } = buildStatements(seed, {
    actorEmail,
    now,
    photoSizes,
    coords,
    representativePhotoReady: new Set(Object.keys(repPhotosReady)),
  })
  const allSql = [...sql, ...geocodeCacheSql]

  const outDir = resolve(root, 'seed.local/out')
  mkdirSync(outDir, { recursive: true })
  const sqlPath = resolve(outDir, `import-${target}.sql`)
  writeFileSync(sqlPath, `${allSql.join('\n')}\n`, 'utf8')

  const countsByTable = {}
  for (const stmt of allSql) {
    const table = stmt.match(/INTO (\w+)/)?.[1]
    if (table) countsByTable[table] = (countsByTable[table] ?? 0) + 1
  }

  const r2Keys = photos
    .filter((p) => photoSizes[p.photoId])
    .flatMap((p) => [p.displayKey, p.thumbKey])
  const repPhotoR2Keys = Object.entries(repPhotosReady).flatMap(([, { vendorId }]) => [
    `vendors/${vendorId}/representative-${representativePhotoStamp}-display.jpg`,
    `vendors/${vendorId}/representative-${representativePhotoStamp}-thumb.jpg`,
  ])

  console.log('--- SQL 文の件数（テーブルごと） ---')
  for (const [table, count] of Object.entries(countsByTable)) {
    console.log(`  ${table}: ${count}`)
  }
  console.log(`--- R2 に置くキー（${r2Keys.length + repPhotoR2Keys.length} 件） ---`)
  for (const key of [...r2Keys, ...repPhotoR2Keys]) console.log(`  ${key}`)
  console.log(`SQL ファイル: ${sqlPath}`)

  if (dryRun) {
    console.log('\n--dry-run のため、R2/D1 へは書き込みません。')
    return
  }

  console.log(`\n${target === 'local' ? 'ローカル' : '本番'} R2 へ写真をアップロード中…`)
  for (const p of photos) {
    const paths = photoPaths[p.photoId]
    if (!paths) continue
    // r2 object put is treated as local when --local/--remote is omitted (unlike what --help
    // says, "remote is the default" was not true. State the target explicitly every time)
    wrangler([
      'r2',
      'object',
      'put',
      `${R2_BUCKET}/${p.displayKey}`,
      '--file',
      paths.displayPath,
      '--content-type',
      'image/jpeg',
      targetFlag(target),
    ])
    wrangler([
      'r2',
      'object',
      'put',
      `${R2_BUCKET}/${p.thumbKey}`,
      '--file',
      paths.thumbPath,
      '--content-type',
      'image/jpeg',
      targetFlag(target),
    ])
  }

  console.log(`\n${target === 'local' ? 'ローカル' : '本番'} R2 へ代表者の写真をアップロード中…`)
  for (const { vendorId, displayPath, thumbPath } of Object.values(repPhotosReady)) {
    wrangler([
      'r2',
      'object',
      'put',
      `${R2_BUCKET}/vendors/${vendorId}/representative-${representativePhotoStamp}-display.jpg`,
      '--file',
      displayPath,
      '--content-type',
      'image/jpeg',
      targetFlag(target),
    ])
    wrangler([
      'r2',
      'object',
      'put',
      `${R2_BUCKET}/vendors/${vendorId}/representative-${representativePhotoStamp}-thumb.jpg`,
      '--file',
      thumbPath,
      '--content-type',
      'image/jpeg',
      targetFlag(target),
    ])
  }

  console.log(`\n${target === 'local' ? 'ローカル' : '本番'} D1 へ SQL を実行中…`)
  wrangler(['d1', 'execute', DATABASE, targetFlag(target), '--file', sqlPath, '-y'])

  console.log('\n--- 取り込み後の件数 ---')
  const counts = countPerTable(target)
  for (const [table, n] of Object.entries(counts)) {
    console.log(`  ${table}: ${n}`)
  }
}

main().catch((err) => {
  console.error(err.stack ?? String(err))
  process.exit(1)
})
