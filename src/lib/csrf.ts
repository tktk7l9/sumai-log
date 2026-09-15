/**
 * 変更系リクエストの Origin 検査。
 *
 * Cloudflare Access の Cookie は SameSite が緩いことがあり、別サイトからの
 * POST でも JWT が付いて認証を通ることがある。ブラウザは Origin を偽造できない
 * ので、変更系は「このアプリ自身からの要求」だけを受ける。
 *
 * GET / HEAD / OPTIONS は読むだけ（またはプリフライト）なので検査しない。
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function isTrustedMutation({
  method,
  origin,
  requestUrl,
}: {
  method: string
  origin: string | null | undefined
  requestUrl: string
}): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return true
  if (!origin || origin.trim() === '') return false

  try {
    return new URL(origin).origin === new URL(requestUrl).origin
  } catch {
    return false
  }
}
