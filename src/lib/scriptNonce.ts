/**
 * The script policy of the HTML pages, rolled out in two stages (report-only 2026-10-14,
 * enforced 2026-10-19).
 *
 * The enforced CSP (`SECURITY_HEADERS` in ./securityHeaders.ts) limits frames, objects, images
 * and connections but has no `script-src`, so the browser runs any script. This module adds
 * the script half: `script-src 'self' 'nonce-…'` plus the hosts the pages really load scripts
 * from (SCRIPT_HOSTS), with a fresh nonce for every response.
 *
 * Stage 1 (`SCRIPT_POLICY_MODE = 'report-only'`): the policy went out as
 * `Content-Security-Policy-Report-Only` beside the enforced CSP, which stayed as it was. The
 * browser blocks nothing in that mode and only reports, in the DevTools console, what it would
 * block. Stage 2 (`'enforce'`, after that console stayed clean): the same directives join the
 * enforced `Content-Security-Policy` and the report-only header is no longer sent. Either way
 * an HTML response carries exactly one header of each kind it uses (`set`, never appended).
 *
 * The Worker entry (src/server.ts) passes every response through applyScriptNonce. Only
 * text/html with a body is touched: HTMLRewriter stamps the nonce, while streaming, on each
 * inline JavaScript <script> (Mantine's colour scheme script, the zod setting and TanStack's
 * hydration scripts), and the policy header is set. Static assets (Workers Assets) never
 * reach the Worker.
 *
 * No 'strict-dynamic': it would make the browser ignore 'self' and the host sources, and the
 * Web Analytics beacon that Cloudflare injects at the edge (after the Worker) has no nonce.
 * No 'unsafe-eval': nothing evaluates strings. Zod's JIT probe (`new Function`) is switched
 * off before any module runs (src/lib/zodJitless.ts). The vector renderer of the Maps
 * JavaScript API compiles WebAssembly and starts workers from blob: URLs, hence
 * 'wasm-unsafe-eval' and `worker-src blob:` (see VECTOR_MAP_ALLOWANCES).
 *
 * Trust boundary: HTMLRewriter cannot tell TanStack's inline scripts from injected ones, so any
 * inline <script> that reaches the server-rendered HTML gets the nonce. The nonce is safe only
 * while the server never emits untrusted markup: React escapes text, and the app has no
 * raw-HTML sink (src/lib/trustBoundary.test.ts fails on one). Imported mail bodies and fetched
 * vendor news must stay text.
 */

export const CSP_HEADER = 'content-security-policy'
export const CSP_REPORT_ONLY_HEADER = 'content-security-policy-report-only'

export type ScriptPolicyMode = 'report-only' | 'enforce'

/**
 * Stage 2 since 2026-10-19: five days of report-only use left the owner's console clean.
 * 'report-only' is the way back if a screen ever breaks, and the way to try a changed policy
 * before enforcing it (AGENTS.md, "Script policy").
 */
export const SCRIPT_POLICY_MODE: ScriptPolicyMode = 'enforce'

/**
 * Where the pages load scripts from, besides 'self' and the nonce. Measured on every screen
 * with headless Chrome on 2026-10-14; keep it to hosts that really serve the scripts. Google
 * documents a wider list for the Maps JavaScript API (*.googleapis.com, *.gstatic.com,
 * *.google.com, *.ggpht.com, *.googleusercontent.com, 'unsafe-eval', blob:) and says to trim it
 * until nothing is reported; those wildcards also serve content anyone can upload, which would
 * let injected markup load a script past the policy.
 */
export const SCRIPT_HOSTS = [
  // Maps JavaScript API (the map tab and place details). Its loader copies our nonce from the
  // first script[nonce] of the page onto the bootstrap (/maps/api/js), and the API onto every
  // script it adds, so these loads already pass by the nonce. The host keeps the map working
  // if one ever comes without it
  'https://maps.googleapis.com',
  // Cloudflare Web Analytics beacon, injected at the edge on sumai-log.app (not on
  // workers.dev). A host, not a file: the injected path carries a version (beacon.min.js/v…)
  'https://static.cloudflareinsights.com',
] as const

/**
 * What the vector renderer of the Maps JavaScript API needs (measured 2026-10-14 with a
 * vector map): its webgl module starts workers from blob: URLs and it compiles WebAssembly,
 * in the page and in those workers. The map renders as raster today (no Map ID, so
 * DEMO_MAP_ID) and uses neither, but a vector Map ID in GOOGLE_MAPS_MAP_ID would break under
 * the enforced policy without them. Both can only be used by a script that already runs.
 * 'wasm-unsafe-eval' allows WebAssembly only (Google lists the wider 'unsafe-eval'); eval()
 * and new Function stay blocked.
 */
export const VECTOR_MAP_ALLOWANCES = {
  scriptSrc: "'wasm-unsafe-eval'",
  workerSrc: 'blob:',
} as const

/** The directives this module adds, for one nonce. */
export function scriptPolicy(nonce: string): string {
  return [
    `script-src 'self' 'nonce-${nonce}' ${VECTOR_MAP_ALLOWANCES.scriptSrc} ${SCRIPT_HOSTS.join(' ')}`,
    `worker-src ${VECTOR_MAP_ALLOWANCES.workerSrc}`,
  ].join('; ')
}

/** 128 random bits, base64. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes))
}

/** The subset of Cloudflare's HTMLRewriter used here (fakes stand in for it in tests). */
export interface ScriptElement {
  getAttribute(name: string): string | null
  hasAttribute(name: string): boolean
  setAttribute(name: string, value: string): unknown
}
export interface Rewriter {
  on(selector: string, handlers: { element(el: ScriptElement): void }): Rewriter
  transform(response: Response): Response
}

// The JavaScript MIME type essences. A <script> whose type is one of them (ASCII
// case-insensitive, surrounding ASCII whitespace stripped, no parameters) runs as a classic
// script, "module" runs as a module script, and the browser runs no other type.
// https://html.spec.whatwg.org/multipage/scripting.html#prepare-the-script-element
// https://mimesniff.spec.whatwg.org/#javascript-mime-type
const JAVASCRIPT_TYPES = new Set([
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
])

/** The script's type string, derived from `type` / `language` as the HTML spec does. */
function scriptType(el: ScriptElement): string {
  const type = el.getAttribute('type')
  const language = el.getAttribute('language')
  if (type === '' || (type === null && !language)) return 'text/javascript'
  if (type !== null) return type.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '')
  return `text/${language}`
}

/**
 * True only for inline classic or module JavaScript, the one kind of <script> that needs the
 * nonce. Left unstamped:
 * - `src`: an external script. 'self' and the host sources decide whether it loads; a nonce
 *   would let it load from anywhere.
 * - `href` / `xlink:href`: an SVG <script> loads its file from these (it has no `src`), so a
 *   nonce would let an off-list script load.
 * - any other type: data blocks (application/json, ld+json) never run, and importmap and
 *   speculationrules are not used here and stay blocked.
 * HTMLRewriter hands attribute values over raw (character references are not decoded), so a
 * type spelled with one never matches and that script stays blocked: errors fall on the
 * blocking side.
 */
export function isInlineJavaScript(el: ScriptElement): boolean {
  if (el.hasAttribute('src') || el.hasAttribute('href') || el.hasAttribute('xlink:href')) {
    return false
  }
  const type = scriptType(el).toLowerCase()
  return type === 'module' || JAVASCRIPT_TYPES.has(type)
}

function workersRewriter(): Rewriter {
  const ctor = (globalThis as unknown as { HTMLRewriter?: new () => Rewriter }).HTMLRewriter
  if (!ctor) throw new Error('HTMLRewriter is not available outside the Workers runtime')
  return new ctor()
}

function isHtml(contentType: string | null): boolean {
  return (contentType ?? '').trim().toLowerCase().startsWith('text/html')
}

/**
 * Gives an HTML response a fresh nonce: stamps it on every inline JavaScript <script> and sets
 * the script policy for it. In 'report-only' mode the policy is the
 * Content-Security-Policy-Report-Only header and the enforced CSP is left as it is; in
 * 'enforce' mode the policy is appended to the enforced CSP. Other responses pass untouched.
 */
export function applyScriptNonce(
  response: Response,
  {
    nonce = createNonce(),
    rewriter = workersRewriter,
    mode = SCRIPT_POLICY_MODE,
  }: { nonce?: string; rewriter?: () => Rewriter; mode?: ScriptPolicyMode } = {},
): Response {
  if (!response.body || !isHtml(response.headers.get('content-type'))) return response

  const headers = new Headers(response.headers)
  const policy = scriptPolicy(nonce)
  if (mode === 'enforce') {
    const base = headers.get(CSP_HEADER)
    headers.set(CSP_HEADER, base ? `${base}; ${policy}` : policy)
    headers.delete(CSP_REPORT_ONLY_HEADER)
  } else {
    headers.set(CSP_REPORT_ONLY_HEADER, policy)
  }
  // The body now differs per request: a validator would let a 304 pair an old body (old
  // nonce) with a new header (new nonce), and every inline script would fail the policy.
  headers.delete('etag')
  headers.delete('content-length')

  const stamped = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
  return rewriter()
    .on('script', {
      element(el) {
        if (isInlineJavaScript(el)) el.setAttribute('nonce', nonce)
      },
    })
    .transform(stamped)
}
