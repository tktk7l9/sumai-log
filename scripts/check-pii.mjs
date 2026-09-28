#!/usr/bin/env node
/**
 * Check whether real data has slipped into what is being committed.
 *
 *   node scripts/check-pii.mjs            # tracked files in the working tree
 *   node scripts/check-pii.mjs --staged   # only the content about to be committed
 *
 * Even though item 1 of AGENTS.md says "do not commit PII", writing it down alone does
 * not enforce it. A machine checks instead of a person being careful.
 *
 * The words to look for are **taken from `.dev.vars`**. The two users' e-mails and
 * display names exist only there, so there is no need to create and commit a separate
 * list of forbidden words
 * (this avoids the circular problem of the list itself becoming PII).
 *
 * In an environment without .dev.vars (right after a clone in CI, etc.) there are simply
 * no words to match against, so that part is skipped. To really protect in CI, run it
 * locally where the real data exists, or put it in pre-commit.
 *
 * Coordinates are checked by shape (scripts/lib/pii.mjs), not against a list, so that
 * part runs everywhere, including CI.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { findCoordinateLines } from './lib/pii.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const devVarsPath = resolve(root, '.dev.vars')

const hasDevVars = existsSync(devVarsPath)
if (!hasDevVars) {
  console.log(
    'No .dev.vars: names and e-mails are not checked (run this where the real data is). Coordinates are still checked.',
  )
}

/**
 * The words to match are taken from .dev.vars. The two users' e-mails and display names
 * exist only there, so there is no need to create and commit a separate list of forbidden words.
 *   ACCESS_ALLOWED_EMAILS=a@x,b@y   -> a@x, b@y
 *   MEMBERS=a@x:name:color,b@y:name:color   -> a@x, name, b@y, name
 */
function unquote(v) {
  return v.length >= 2 && v[0] === v[v.length - 1] && (v[0] === '"' || v[0] === "'")
    ? v.slice(1, -1)
    : v
}
const vars = Object.fromEntries(
  (hasDevVars ? readFileSync(devVarsPath, 'utf8') : '')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), unquote(l.slice(i + 1).trim())]
    }),
)
const MIN_LENGTH = 2
const secrets = new Set()
for (const email of (vars.ACCESS_ALLOWED_EMAILS ?? '').split(',')) {
  const v = email.trim().toLowerCase()
  if (v.length >= MIN_LENGTH && !v.endsWith('@example.com')) secrets.add(v)
}
for (const entry of (vars.MEMBERS ?? '').split(',')) {
  const [email, name] = entry.split(':').map((s) => s.trim())
  if (email && email.length >= MIN_LENGTH && !email.endsWith('@example.com'))
    secrets.add(email.toLowerCase())
  if (name && name.length >= MIN_LENGTH && !['甲', '乙'].includes(name)) secrets.add(name)
}
if (vars.DEV_IDENTITY_EMAIL && !vars.DEV_IDENTITY_EMAIL.endsWith('@example.com')) {
  secrets.add(vars.DEV_IDENTITY_EMAIL.trim().toLowerCase())
}
const secretList = [...secrets]

const staged = process.argv.includes('--staged')

/** Exclude generated files and files that are expected to contain real data in the first place */
const SKIP = /^(worker-configuration\.d\.ts|src\/routeTree\.gen\.ts)$/

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

/**
 * The list of files to check.
 *
 * With --staged, read **the index content**. Reading the working tree would block
 * the commit when a dirty file is left unstaged, and conversely would let PII
 * through when it is staged and then removed locally.
 * What goes into the commit is the index content, so check that.
 */
const files = (
  staged ? git(['diff', '--cached', '--name-only', '--diff-filter=ACMR']) : git(['ls-files'])
)
  .split('\n')
  .filter(Boolean)
  .filter((file) => !SKIP.test(file))

const hits = []
const coordinateHits = []
for (const file of files) {
  let content
  try {
    content = staged ? git(['show', `:${file}`]) : readFileSync(resolve(root, file), 'utf8')
  } catch {
    continue // skip binaries and unreadable files
  }
  for (const secret of secretList) {
    if (!content.includes(secret)) continue
    const line = content.split('\n').findIndex((text) => text.includes(secret)) + 1
    hits.push({ file, line, secret })
  }
  for (const line of findCoordinateLines(content)) coordinateHits.push({ file, line })
}

if (hits.length === 0 && coordinateHits.length === 0) {
  const scope = staged ? 'staged files' : 'tracked files'
  console.log(
    `No real data found (${secretList.length} words and coordinates checked against ${files.length} ${scope}).`,
  )
  process.exit(0)
}

console.error('Real data is mixed into what is being committed (AGENTS.md 1):')
for (const hit of hits) {
  // Do not print the found word itself. If the output stays in a log, that is a leak too
  const masked = `${hit.secret.slice(0, 1)}... (${hit.secret.length} characters)`
  console.error(`  ${hit.file}:${hit.line}  ${masked}`)
}
for (const hit of coordinateHits) {
  // The value is not printed, for the same reason
  console.error(`  ${hit.file}:${hit.line}  coordinates (5 or more decimal places)`)
}
console.error(
  '\nReplace them with made-up values. Real data goes in only through .dev.vars and seed.local.json.',
)
if (coordinateHits.length > 0) {
  console.error(
    'A made-up or public-landmark coordinate can be added to ALLOWED_COORDINATES in scripts/lib/pii.mjs.',
  )
}
process.exit(1)
