#!/usr/bin/env node
/**
 * One command for the monthly backup (README §9).
 *
 *   node scripts/backup.mjs [--dest <folder>] [--skip-photos]
 *
 *   1. D1: `wrangler d1 export --remote` -> backups/<YYYYMMDD>/d1.sql, plus the pieces a
 *      restore needs (`d1.sql.restore/`, scripts/lib/dump.mjs), so the backup is proven
 *      loadable while it is taken.
 *   2. R2: every object the database points at (visit photos, representatives' portraits,
 *      site icons) -> backups/r2/<key>. Objects already there are not fetched again; the
 *      keys come from D1, because wrangler cannot list a bucket.
 *   3. With --dest, copies backups/<YYYYMMDD> and backups/r2 into that folder (the Google
 *      Drive folder of README §9). Without it, prints the copy command.
 *
 * Reads only: the production database is never written from here.
 */

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { r2KeysOf } from './lib/backup.mjs'
import { writeRestorePlan } from './lib/dump.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATABASE = 'sumai-log'
const R2_BUCKET = 'sumai-log-photos'

const args = process.argv.slice(2)
const destIndex = args.indexOf('--dest')
const dest = destIndex === -1 ? null : args[destIndex + 1]
const skipPhotos = args.includes('--skip-photos')
if (destIndex !== -1 && !dest) {
  console.error('usage: node scripts/backup.mjs [--dest <folder>] [--skip-photos]')
  process.exit(2)
}

function wrangler(cliArgs, opts = {}) {
  return execFileSync('npx', ['wrangler', ...cliArgs], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    ...opts,
  })
}

function todayStamp() {
  const d = new Date()
  const jst = new Date(d.getTime() + 9 * 3600 * 1000)
  return jst.toISOString().slice(0, 10).replaceAll('-', '')
}

const stamp = todayStamp()
const dayDir = resolve(root, 'backups', stamp)
const r2Dir = resolve(root, 'backups', 'r2')
mkdirSync(dayDir, { recursive: true })
mkdirSync(r2Dir, { recursive: true })

// 1. D1
const dumpPath = resolve(dayDir, 'd1.sql')
console.log(`d1: export -> backups/${stamp}/d1.sql`)
wrangler(['d1', 'export', DATABASE, '--remote', '--output', dumpPath], { stdio: 'ignore' })
const plan = writeRestorePlan(dumpPath)
console.log(`d1: ${plan.tables} tables, ${plan.rows} rows (restore pieces written)`)

// 2. R2
if (!skipPhotos) {
  const query = (sql) => {
    const out = wrangler(['d1', 'execute', DATABASE, '--remote', '--json', '--command', sql])
    return JSON.parse(out)[0]?.results ?? []
  }
  const keys = r2KeysOf({
    photos: query('SELECT display_key, thumb_key FROM photos'),
    vendors: query(
      'SELECT representative_photo_key, favicon_key FROM vendors WHERE representative_photo_key IS NOT NULL OR favicon_key IS NOT NULL',
    ),
  })
  let fetched = 0
  for (const key of keys) {
    const file = resolve(r2Dir, key)
    if (existsSync(file)) continue
    mkdirSync(dirname(file), { recursive: true })
    wrangler(['r2', 'object', 'get', `${R2_BUCKET}/${key}`, '--file', file, '--remote'], {
      stdio: 'ignore',
    })
    fetched++
  }
  console.log(`r2: ${keys.length} objects, ${fetched} fetched now -> backups/r2/`)
}

// 3. Copy
if (dest) {
  const target = resolve(dest)
  mkdirSync(target, { recursive: true })
  cpSync(dayDir, resolve(target, stamp), { recursive: true })
  if (!skipPhotos) cpSync(r2Dir, resolve(target, 'r2'), { recursive: true })
  console.log(`copied to ${target} (${readdirSync(target).length} entries)`)
} else {
  console.log(`copy: cp -R backups/${stamp} backups/r2 <Drive folder of README §9>`)
}
console.log(`restore check: npm run db:restore:local -- backups/${stamp}/d1.sql`)
