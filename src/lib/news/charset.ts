/**
 * Detects the character encoding of a vendor news body. design.md does not say so, but
 * html-list sources (older company sites without RSS) sometimes return Shift_JIS / EUC-JP.
 * Always reading them as UTF-8 garbles the body, and because `url` is the key for detecting
 * new items and title updates are not tracked by design (once saved it cannot be fixed), the
 * garbled text becomes permanent.
 *
 * Priority: the `charset` of the HTTP `Content-Type` header -> a naive sniff of
 * `<meta charset="…">` / `<meta http-equiv="Content-Type" content="…charset=…">`
 * in the first 2KB of the body -> `'utf-8'` when neither exists.
 *
 * The sniff peeks as Latin-1 (1 byte = 1 code point; in every encoding the bytes in the ASCII
 * range keep their order, so the contents of the `<meta>` tag alone can be read safely even
 * before the real charset is known). No external HTML parser is used; the `<meta …>` tags are
 * found with regular expressions only (following the policy of design.md §1).
 */

const CONTENT_TYPE_CHARSET = /charset\s*=\s*["']?([\w-]+)/i
const META_TAG = /<meta\b[^>]*>/gi
const CHARSET_IN_ATTR = /charset\s*=\s*["']?([\w-]+)/i

export const DEFAULT_CHARSET = 'utf-8'

/** Number of leading body bytes to sniff. Most `<meta charset>` tags fit in here. */
const HEAD_SNIFF_BYTES = 2048

function sniffMetaCharset(headBytes: Uint8Array): string | null {
  const head = headBytes.subarray(0, HEAD_SNIFF_BYTES)
  const text = new TextDecoder('iso-8859-1').decode(head)
  for (const tag of text.matchAll(META_TAG)) {
    const found = CHARSET_IN_ATTR.exec(tag[0])?.[1]
    if (found) return found
  }
  return null
}

/**
 * `contentType` is the value of `response.headers.get('content-type')` (null when absent).
 * `headBytes` is the bytes of the body (pass only the head or the whole body; internally only
 * the first HEAD_SNIFF_BYTES are looked at). The return value is a label string that can be
 * passed to `TextDecoder` as is (the caller must fall back to utf-8 for an unknown label).
 */
export function detectCharset(contentType: string | null, headBytes: Uint8Array): string {
  const fromHeader = contentType ? CONTENT_TYPE_CHARSET.exec(contentType)?.[1] : null
  if (fromHeader) return fromHeader

  const fromMeta = sniffMetaCharset(headBytes)
  if (fromMeta) return fromMeta

  return DEFAULT_CHARSET
}
