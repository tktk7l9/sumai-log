/**
 * applyScriptNonce (src/lib/scriptNonce.ts) with the real HTMLRewriter of the Workers runtime.
 * The unit tests use a fake rewriter; this checks what the browser actually receives.
 */
import { describe, expect, it } from 'vitest'

import {
  CSP_HEADER,
  CSP_REPORT_ONLY_HEADER,
  applyScriptNonce,
  scriptPolicy,
} from '../lib/scriptNonce'

const ENFORCED = "frame-ancestors 'none'; object-src 'none'"

// The shape of a page from TanStack Start: Mantine's colour scheme script, the zod setting,
// TanStack's hydration scripts, the client entry, plus kinds that must stay unstamped
const PAGE = [
  '<!DOCTYPE html><html lang="ja"><head>',
  '<script data-mantine-script="true">try{}catch(e){}</script>',
  '<script>globalThis.x=1;document.currentScript.remove()</script>',
  '<link rel="modulepreload" href="/assets/a.js"></head><body><div id="app"></div>',
  '<script data-tsr-stream-part="">self.$_TSR={}</script>',
  '<script type="module" async="" src="/assets/index.js"></script>',
  '<script type="application/json">{"a":"</p>"}</script>',
  '<svg><script href="https://evil.example/x.js"></script></svg>',
  '<script SRC="/upper.js"></script>',
  '<script>document.currentScript.remove();/*$tsr-stream-boundary*/</script>',
  '</body></html>',
].join('')

function htmlResponse(body: BodyInit): Response {
  return new Response(body, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      [CSP_HEADER]: ENFORCED,
      etag: '"v1"',
    },
  })
}

function stampedTags(html: string): string[] {
  return [...html.matchAll(/<script\b[^>]*>/gi)].map((m) => m[0])
}

describe('applyScriptNonce with the real HTMLRewriter', () => {
  it('stamps exactly the inline JavaScript', async () => {
    const res = applyScriptNonce(htmlResponse(PAGE), { nonce: 'TESTNONCE' })
    const tags = stampedTags(await res.text())
    expect(tags.filter((t) => t.includes('nonce="TESTNONCE"'))).toEqual([
      '<script data-mantine-script="true" nonce="TESTNONCE">',
      '<script nonce="TESTNONCE">',
      '<script data-tsr-stream-part="" nonce="TESTNONCE">',
      '<script nonce="TESTNONCE">',
    ])
    // The external entry, the data block, the SVG script and the upper-case SRC stay as they were
    expect(tags.filter((t) => !t.includes('nonce='))).toEqual([
      '<script type="module" async="" src="/assets/index.js">',
      '<script type="application/json">',
      '<script href="https://evil.example/x.js">',
      '<script SRC="/upper.js">',
    ])
  })

  it('joins the policy with the same nonce to the one enforced CSP, no report-only', async () => {
    const res = applyScriptNonce(htmlResponse(PAGE), { nonce: 'TESTNONCE' })
    expect(res.headers.get(CSP_HEADER)).toBe(`${ENFORCED}; ${scriptPolicy('TESTNONCE')}`)
    expect(res.headers.get(CSP_REPORT_ONLY_HEADER)).toBeNull()
    expect(res.headers.get('etag')).toBeNull()
    await res.text()
  })

  it('stamps a page that streams in pieces, with tags cut across chunks', async () => {
    const encoder = new TextEncoder()
    const pieces = PAGE.match(/[\s\S]{1,7}/g) ?? []
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const piece of pieces) controller.enqueue(encoder.encode(piece))
        controller.close()
      },
    })
    const res = applyScriptNonce(htmlResponse(stream), { nonce: 'TESTNONCE' })
    const html = await res.text()
    expect(stampedTags(html).filter((t) => t.includes('nonce="TESTNONCE"'))).toHaveLength(4)
    // Nothing but the attributes changed
    expect(html.replaceAll(' nonce="TESTNONCE"', '')).toBe(PAGE)
  })
})
