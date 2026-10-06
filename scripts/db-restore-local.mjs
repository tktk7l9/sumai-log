#!/usr/bin/env node
/**
 * Loads a `wrangler d1 export` file into the local D1 (the one `npm run dev` uses).
 *
 *   node scripts/db-restore-local.mjs <dump.sql> [--plan-only]
 *
 * The export cannot be run back as it is (see scripts/lib/dump.mjs), so this writes the
 * reordered pieces next to the dump (`<dump>.restore/0-drop.sql` … `3-rest.sql`) and runs
 * them against the local database, dropping the tables of the dump first. The pieces are
 * the same for the production database; the owner runs those by hand with `--remote`
 * (production writes never come from here, AGENTS.md).
 *
 * `npm run backup` already writes the pieces, so for a backup folder this only runs them.
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { writeRestorePlan } from './lib/dump.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATABASE = 'sumai-log'

const args = process.argv.slice(2)
const planOnly = args.includes('--plan-only')
const dump = args.find((a) => !a.startsWith('--'))
if (!dump) {
  console.error('usage: node scripts/db-restore-local.mjs <dump.sql> [--plan-only]')
  process.exit(2)
}
const dumpPath = resolve(root, dump)
if (!existsSync(dumpPath)) {
  console.error(`not found: ${dumpPath}`)
  process.exit(2)
}

const { dir, files, tables, rows } = writeRestorePlan(dumpPath)
console.log(`plan: ${tables} tables, ${rows} rows -> ${dir}`)
if (planOnly) process.exit(0)

for (const file of files) {
  console.log(`local: ${basename(file)}`)
  execFileSync('npx', ['wrangler', 'd1', 'execute', DATABASE, '--local', '--file', file], {
    cwd: root,
    stdio: ['ignore', 'ignore', 'inherit'],
  })
}
console.log('done. For production the owner runs the same files with --remote, in this order.')
