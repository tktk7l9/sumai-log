/**
 * Pins public/_headers, the headers Workers Static Assets puts on the files it serves.
 *
 * Without it every asset is `Cache-Control: public, max-age=0, must-revalidate`: each repeat
 * load, PWA relaunch and pull to refresh asked the server about 50-60 files again before any
 * script ran. Files under /assets/ carry a content hash in their name (Vite), so they can be
 * kept for a year; a deploy renames them, and a page left open recovers through
 * src/lib/staleChunk.ts.
 *
 * Exactly one rule: Cloudflare joins the values of rules that match the same path with a comma,
 * so a second rule that also matches /assets/* would corrupt the header. Everything else
 * (favicon, manifest, icons: fixed names) keeps the default and is revalidated. Security headers
 * do not belong here either: the Worker sets them (src/lib/securityHeaders.ts).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const FILE = fileURLToPath(new URL('../../public/_headers', import.meta.url))

type Rule = { path: string; headers: string[] }

/** The rules of a _headers file: a path line, then its indented header lines. `#` is a comment. */
function rulesOf(text: string): Rule[] {
  const rules: Rule[] = []
  for (const line of text.split('\n')) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue
    if (/^\s/.test(line)) rules.at(-1)?.headers.push(line.trim())
    else rules.push({ path: line.trim(), headers: [] })
  }
  return rules
}

describe('public/_headers', () => {
  it('caches the content-hashed files under /assets/ for a year, and has no other rule', () => {
    expect(rulesOf(readFileSync(FILE, 'utf8'))).toEqual([
      { path: '/assets/*', headers: ['Cache-Control: public, max-age=31536000, immutable'] },
    ])
  })
})
