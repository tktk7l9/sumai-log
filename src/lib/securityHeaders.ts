/**
 * 全レスポンスに付けるブラウザ向けの防御ヘッダ。
 *
 * Cloudflare Access の内側でも、クリックジャッキングや MIME スニッフィングは
 * アプリ側で止める。CSP は Vite / Mantine のインラインを壊さない範囲に留める
 * （`frame-ancestors` と `object-src` と `base-uri` だけ）。
 */

export const SECURITY_HEADERS = {
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'cross-origin-opener-policy': 'same-origin',
  'content-security-policy': "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
} as const

/** 既存の Headers に上書きで載せる。 */
export function applySecurityHeaders(headers: Headers): Headers {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value)
  }
  return headers
}

/** `new Response` の headers に混ぜる用。 */
export function securityHeadersInit(extra?: HeadersInit): Headers {
  const headers = new Headers(extra)
  return applySecurityHeaders(headers)
}
