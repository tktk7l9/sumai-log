#!/usr/bin/env node
/**
 * seed.local.json（gitignore 済みの実データ）を D1/R2 へ取り込む CLI。
 *
 *   node scripts/import-seed.mjs --local|--remote [--dry-run]
 *
 * 冪等: scripts/lib/seed.mjs の buildStatements が slug から決定的に id を作り、
 * すべて `INSERT OR REPLACE` で書くので、同じ引数で何度実行しても結果は変わらない。
 *
 * 流れ:
 *   1. .dev.vars から DEV_IDENTITY_EMAIL を読む（= created_by。ここでは絶対に出力しない）
 *   2. seed.local.json を読む
 *   3. 場所を国土地理院 住所検索 API で座標に変換（1 リクエスト/1.2秒）。結果は geocode_cache にも書く
 *   4. 写真（HEIC）を sips で display/thumb の JPEG に変換し実寸を測る（macOS のみ）
 *   5. buildStatements で最終 SQL を作り、1 ファイルにまとめる
 *   6. --dry-run ならここで統計を出して終了。そうでなければ R2 へ写真を put → D1 に SQL を流す → 件数を表示
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildStatements, normalizeAddress, sqlString } from './lib/seed.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATABASE = 'sumai-log'
const R2_BUCKET = 'sumai-log-photos'
const GSI_ENDPOINT = 'https://msearch.gsi.go.jp/address-search/AddressSearch'
const GSI_PAUSE_MS = 1200

/** buildStatements が作る全テーブル名（geocode_cache は import-seed 側で足す） */
const ALL_TABLES = [
  'settings',
  'vendors',
  'places',
  'events',
  'visits',
  'photos',
  'videos',
  'geocode_cache',
]

function parseArgs(argv) {
  const target = argv.includes('--local') ? 'local' : argv.includes('--remote') ? 'remote' : null
  const dryRun = argv.includes('--dry-run')
  return { target, dryRun }
}

/** .dev.vars の最小パーサ。値のクォートを外すだけ（check-pii.mjs と同じ流儀） */
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
 * 場所（住所つき）を国土地理院 住所検索 API で座標に変換する。
 * 見つからない/住所が無い場所は coords に含めない（呼び出し側で lat/lng が NULL のまま残る）。
 * 見つかった分は geocode_cache への INSERT 文も返す。
 */
async function geocodePlaces(places, now) {
  const coords = {}
  const geocodeCacheSql = []
  const withAddress = places.filter((p) => p.address)
  let skippedNoAddress = places.length - withAddress.length

  for (const place of withAddress) {
    const query = normalizeAddress(place.address)
    let features = []
    try {
      const res = await fetch(`${GSI_ENDPOINT}?q=${encodeURIComponent(query)}`)
      if (res.ok) features = await res.json()
    } catch {
      features = []
    }

    if (features.length > 0) {
      const [lng, lat] = features[0].geometry.coordinates
      const title = features[0].properties?.title ?? null
      coords[place.slug] = { lat, lng }
      geocodeCacheSql.push(
        `INSERT OR REPLACE INTO geocode_cache (query, lat, lng, title, fetched_at) VALUES (${sqlString(query)}, ${sqlString(lat)}, ${sqlString(lng)}, ${sqlString(title)}, ${sqlString(now)});`,
      )
    }

    await sleep(GSI_PAUSE_MS)
  }

  const notFound = withAddress.length - Object.keys(coords).length
  return { coords, geocodeCacheSql, skippedNoAddress, notFound }
}

/** display の実寸を sips -g で読む。"  pixelWidth: 1600" のような行から数値を拾う */
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
 * 写真（HEIC）を display(1600px)/thumb(400px) の JPEG に変換し、display の実寸を測る。
 * macOS 以外では変換できないので何もせず空の結果を返す。
 *
 * photoId → { displayPath, thumbPath } の map を返す。photos の SQL/R2 キーは
 * buildStatements を 2 回呼ぶ（座標・実寸を知る前後）ため、descriptor オブジェクトの
 * 参照は使い回せない。photoId は visitSlug + basename から決定的に決まるので、
 * この map を id 経由で引けば呼び出しをまたいで対応が取れる。
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

  const seedPath = resolve(root, 'seed.local.json')
  if (!existsSync(seedPath)) {
    console.error('seed.local.json が見つかりません。')
    process.exit(1)
  }
  const seed = JSON.parse(readFileSync(seedPath, 'utf8'))

  // 1回目: 座標・写真実寸を知る前の呼び出し。photos の descriptor（src/photoId/キー）を得るためだけに使う
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

  // 2回目: 座標・写真実寸込みの最終 SQL
  const { sql, photos } = buildStatements(seed, { actorEmail, now, photoSizes, coords })
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

  console.log('--- SQL 文の件数（テーブルごと） ---')
  for (const [table, count] of Object.entries(countsByTable)) {
    console.log(`  ${table}: ${count}`)
  }
  console.log(`--- R2 に置くキー（${r2Keys.length} 件） ---`)
  for (const key of r2Keys) console.log(`  ${key}`)
  console.log(`SQL ファイル: ${sqlPath}`)

  if (dryRun) {
    console.log('\n--dry-run のため、R2/D1 へは書き込みません。')
    return
  }

  console.log(`\n${target === 'local' ? 'ローカル' : '本番'} R2 へ写真をアップロード中…`)
  for (const p of photos) {
    const paths = photoPaths[p.photoId]
    if (!paths) continue
    // r2 object put は --local/--remote を省略すると local 扱いになる（--help の記載と異なり
    // 「remote が既定」ではなかった。target を毎回明示する）
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
