import { createMiddleware, createStart } from '@tanstack/react-start'

import { isTrustedMutation } from './lib/csrf'
import { applySecurityHeaders, securityHeadersInit } from './lib/securityHeaders'
import { requireUser } from './server/auth'

/**
 * 全リクエスト（SSR・server function・server route）の入口で認証を強制する。
 * 個別のルートで付け忘れが起きないよう、必ずグローバルミドルウェアで行う。
 *
 * 変更系は先に Origin を見る。Access の Cookie が別サイトから送られても、
 * 同じ Origin からしか通さない。そのあと認証を強制する。
 */
const authMiddleware = createMiddleware().server(async ({ next, request }) => {
  if (
    !isTrustedMutation({
      method: request.method,
      origin: request.headers.get('origin'),
      requestUrl: request.url,
    })
  ) {
    throw new Response('この操作は許可されていません。', {
      status: 403,
      headers: securityHeadersInit({ 'content-type': 'text/plain; charset=utf-8' }),
    })
  }

  const user = await requireUser(request)
  try {
    const result = await next({ context: { user } })
    applySecurityHeaders(result.response.headers)
    return result
  } catch (e) {
    // ルートハンドラが throw new Response(...)（404 など）で抜けると、通常の
    // return と違ってここを通らずセキュリティヘッダが付かずに配信されてしまう。
    if (e instanceof Response) {
      applySecurityHeaders(e.headers)
      throw e
    }
    throw e
  }
})

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [authMiddleware],
  }
})
