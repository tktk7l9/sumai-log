import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  CSP_HEADER,
  CSP_REPORT_ONLY_HEADER,
  SCRIPT_HOSTS,
  SCRIPT_POLICY_MODE,
  applyScriptNonce,
  createNonce,
  isInlineJavaScript,
  scriptPolicy,
  type Rewriter,
  type ScriptElement,
} from './scriptNonce'
import { SECURITY_HEADERS } from './securityHeaders'

const ENFORCED = SECURITY_HEADERS['content-security-policy']

/** Records the handlers so tests can feed them fake <script> elements. */
function fakeRewriter() {
  const calls: { selector: string; handler: (el: ScriptElement) => void }[] = []
  const transformed: Response[] = []
  const rewriter: Rewriter = {
    on(selector, handlers) {
      calls.push({ selector, handler: handlers.element })
      return rewriter
    },
    transform(response) {
      transformed.push(response)
      return response
    },
  }
  return { rewriter: () => rewriter, calls, transformed }
}

/** A fake <script>. Names are lowercase, as HTMLRewriter reports them. */
function script(attrs: Record<string, string>) {
  return {
    attrs,
    getAttribute: (name: string) => (name in attrs ? attrs[name]! : null),
    hasAttribute: (name: string) => name in attrs,
    setAttribute(name: string, value: string) {
      attrs[name] = value
    },
  }
}

function html(headers: Record<string, string> = {}) {
  return new Response('<html><script>1</script></html>', {
    status: 200,
    statusText: 'OK',
    headers: {
      'content-type': 'text/html; charset=utf-8',
      [CSP_HEADER]: ENFORCED,
      ...headers,
    },
  })
}

describe('scriptPolicy', () => {
  it('allows this origin, the nonce, the map and the beacon, and blob: workers for vector maps', () => {
    expect(scriptPolicy('abc')).toBe(
      "script-src 'self' 'nonce-abc' 'wasm-unsafe-eval' https://maps.googleapis.com https://static.cloudflareinsights.com; worker-src blob:",
    )
  })

  it("never allows inline code, eval or 'strict-dynamic'", () => {
    const policy = scriptPolicy('abc')
    expect(policy).not.toContain("'unsafe-inline'")
    expect(policy).not.toContain("'unsafe-eval'")
    // 'strict-dynamic' would make the browser ignore the hosts, and the beacon Cloudflare
    // injects at the edge carries no nonce
    expect(policy).not.toContain("'strict-dynamic'")
  })

  it('lists exact https hosts, no wildcard', () => {
    for (const host of SCRIPT_HOSTS) expect(host).toMatch(/^https:\/\/[a-z0-9.-]+$/)
  })
})

describe('the enforced CSP it joins', () => {
  it('has no directive of its own that the script policy would duplicate', () => {
    // A repeated directive is ignored by the browser, so 'enforce' must not meet one
    for (const name of ['script-src', 'worker-src', 'default-src', 'child-src']) {
      expect(ENFORCED.split(';').map((d) => d.trim().split(/\s+/)[0])).not.toContain(name)
    }
  })
})

describe('SCRIPT_POLICY_MODE', () => {
  it('is report-only in stage 1', () => {
    expect(SCRIPT_POLICY_MODE).toBe('report-only')
  })
})

describe('createNonce', () => {
  it('returns 128 random bits as base64, different every call', () => {
    const a = createNonce()
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/)
    expect(createNonce()).not.toBe(a)
  })
})

describe('isInlineJavaScript', () => {
  it.each<[string, Record<string, string>]>([
    ['no attributes (TanStack and the zod setting)', {}],
    ["Mantine's colour scheme script", { 'data-mantine-script': 'true' }],
    ['an empty type', { type: '' }],
    ['text/javascript', { type: 'text/javascript' }],
    ['a JavaScript MIME type in any case', { type: 'Application/JavaScript' }],
    ['a legacy JavaScript MIME type', { type: 'text/x-ecmascript' }],
    ['a type wrapped in ASCII whitespace', { type: ' text/javascript\n' }],
    ['type=module', { type: 'module' }],
    ['type=MODULE', { type: 'MODULE' }],
    ['an empty type that overrides language', { type: '', language: 'vbscript' }],
    ['language=javascript without a type', { language: 'JavaScript' }],
    ['an empty language without a type', { language: '' }],
    ['nomodule', { nomodule: '' }],
  ])('stamps %s', (_label, attrs) => {
    expect(isInlineJavaScript(script(attrs))).toBe(true)
  })

  it.each<[string, Record<string, string>]>([
    ['an external script', { src: '/assets/index.js' }],
    ['an empty src', { src: '' }],
    ['an external module', { type: 'module', src: '/assets/index.js' }],
    ['an SVG <script href> (SVG 2)', { href: 'https://evil.example/x.js' }],
    ['an SVG <script xlink:href> (SVG 1.1)', { 'xlink:href': 'https://evil.example/x.js' }],
    ['application/ld+json (a data block)', { type: 'application/ld+json' }],
    ['application/json', { type: 'application/json' }],
    ['text/plain', { type: 'text/plain' }],
    ['importmap', { type: 'importmap' }],
    ['speculationrules', { type: 'speculationrules' }],
    ['a JavaScript type with parameters', { type: 'text/javascript; charset=utf-8' }],
    ['a type wrapped in non-ASCII whitespace', { type: ' text/javascript' }],
    ['a type spelled with a character reference (arrives raw)', { type: 'text&#47;javascript' }],
    ['language=vbscript without a type', { language: 'vbscript' }],
  ])('does not stamp %s', (_label, attrs) => {
    expect(isInlineJavaScript(script(attrs))).toBe(false)
  })

  it('knows every JavaScript MIME type essence of the HTML spec, and nothing past them', () => {
    const essences = [
      'application/ecmascript',
      'application/javascript',
      'application/x-ecmascript',
      'application/x-javascript',
      'text/ecmascript',
      'text/javascript',
      'text/javascript1.0',
      'text/javascript1.1',
      'text/javascript1.2',
      'text/javascript1.3',
      'text/javascript1.4',
      'text/javascript1.5',
      'text/jscript',
      'text/livescript',
      'text/x-ecmascript',
      'text/x-javascript',
    ]
    for (const type of essences) expect(isInlineJavaScript(script({ type })), type).toBe(true)
    expect(isInlineJavaScript(script({ type: 'text/javascript1.6' }))).toBe(false)
  })
})

describe('applyScriptNonce, report-only (stage 1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('adds the policy as report-only and leaves the enforced CSP exactly as it was', () => {
    const out = applyScriptNonce(html(), { nonce: 'N', rewriter: fakeRewriter().rewriter })
    expect(out.headers.get(CSP_REPORT_ONLY_HEADER)).toBe(scriptPolicy('N'))
    expect(out.headers.get(CSP_HEADER)).toBe(ENFORCED)
  })

  it('sends one report-only header even when the response already had one', () => {
    const out = applyScriptNonce(html({ [CSP_REPORT_ONLY_HEADER]: "script-src 'none'" }), {
      nonce: 'N',
      rewriter: fakeRewriter().rewriter,
    })
    expect(out.headers.get(CSP_REPORT_ONLY_HEADER)).toBe(scriptPolicy('N'))
  })

  it('stamps only inline JavaScript, keeps status and type, and drops the validators', () => {
    const fake = fakeRewriter()
    const out = applyScriptNonce(html({ etag: '"x"', 'content-length': '31' }), {
      nonce: 'N',
      rewriter: fake.rewriter,
    })

    expect(out.status).toBe(200)
    expect(out.statusText).toBe('OK')
    expect(out.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(out.headers.get('etag')).toBeNull()
    expect(out.headers.get('content-length')).toBeNull()

    expect(fake.calls).toHaveLength(1)
    expect(fake.calls[0]!.selector).toBe('script')
    const inline = script({})
    const moduleScript = script({ type: 'module' })
    const external = script({ type: 'module', src: '/assets/index.js' })
    const data = script({ type: 'application/json' })
    const svgExternal = script({ href: 'https://evil.example/x.js' })
    for (const el of [inline, moduleScript, external, data, svgExternal]) {
      fake.calls[0]!.handler(el)
    }
    expect(inline.attrs.nonce).toBe('N')
    expect(moduleScript.attrs.nonce).toBe('N')
    expect(external.attrs.nonce).toBeUndefined()
    expect(data.attrs.nonce).toBeUndefined()
    expect(svgExternal.attrs.nonce).toBeUndefined()
  })

  it('uses a fresh nonce for every response', () => {
    const fake = fakeRewriter()
    const a = applyScriptNonce(html(), { rewriter: fake.rewriter })
    const b = applyScriptNonce(html(), { rewriter: fake.rewriter })
    expect(a.headers.get(CSP_REPORT_ONLY_HEADER)).not.toBe(b.headers.get(CSP_REPORT_ONLY_HEADER))
  })

  it.each([
    [
      'JSON (a server function)',
      new Response('{}', {
        headers: { 'content-type': 'application/json', [CSP_HEADER]: ENFORCED },
      }),
    ],
    ['a body without a content-type', new Response(new Uint8Array([120]))],
    [
      'a photo',
      new Response(new Uint8Array([255, 216]), { headers: { 'content-type': 'image/jpeg' } }),
    ],
    [
      'an HTML response without a body',
      new Response(null, { status: 304, headers: { 'content-type': 'text/html' } }),
    ],
  ])('passes %s through untouched', (_label, response) => {
    const fake = fakeRewriter()
    expect(applyScriptNonce(response, { rewriter: fake.rewriter })).toBe(response)
    expect(fake.calls).toHaveLength(0)
  })

  it('needs no options for the responses it leaves alone', () => {
    const json = new Response('{}', { headers: { 'content-type': 'application/json' } })
    expect(applyScriptNonce(json)).toBe(json)
  })

  it('recognises the content type in any case and with spaces', () => {
    const fake = fakeRewriter()
    const out = applyScriptNonce(
      new Response('<p>', { headers: { 'content-type': ' Text/HTML;charset=UTF-8' } }),
      { nonce: 'N', rewriter: fake.rewriter },
    )
    expect(out.headers.get(CSP_REPORT_ONLY_HEADER)).toBe(scriptPolicy('N'))
  })

  it('uses the Workers HTMLRewriter by default', () => {
    const fake = fakeRewriter()
    vi.stubGlobal(
      'HTMLRewriter',
      class {
        constructor() {
          return fake.rewriter()
        }
      },
    )
    applyScriptNonce(html(), { nonce: 'N' })
    expect(fake.transformed).toHaveLength(1)
  })

  it('fails loudly outside the Workers runtime instead of sending a nonce nobody stamped', () => {
    expect(() => applyScriptNonce(html(), { nonce: 'N' })).toThrow(/HTMLRewriter/)
  })
})

describe('applyScriptNonce, enforce (stage 2)', () => {
  it('appends the policy to the enforced CSP and sends no report-only header', () => {
    const out = applyScriptNonce(html({ [CSP_REPORT_ONLY_HEADER]: "script-src 'none'" }), {
      nonce: 'N',
      rewriter: fakeRewriter().rewriter,
      mode: 'enforce',
    })
    expect(out.headers.get(CSP_HEADER)).toBe(`${ENFORCED}; ${scriptPolicy('N')}`)
    expect(out.headers.get(CSP_REPORT_ONLY_HEADER)).toBeNull()
  })

  it('still sends the policy when the response had no CSP', () => {
    const out = applyScriptNonce(
      new Response('<p>', { headers: { 'content-type': 'text/html' } }),
      {
        nonce: 'N',
        rewriter: fakeRewriter().rewriter,
        mode: 'enforce',
      },
    )
    expect(out.headers.get(CSP_HEADER)).toBe(scriptPolicy('N'))
  })
})
