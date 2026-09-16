import { createFileRoute } from '@tanstack/react-router'

import { getDb } from '../db/client'
import { isIdLike } from '../lib/ids'
import { securityHeadersInit } from '../lib/securityHeaders'
import {
  FAVICON_UPLOAD_MAX_BYTES,
  FAVICON_UPLOAD_TOO_LARGE_ERROR,
  FAVICON_UPLOAD_WRONG_TYPE_ERROR,
  VENDOR_NOT_FOUND_ERROR,
  uploadVendorFaviconCore,
} from '../server/vendorImagesFetcher'

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: securityHeadersInit({ 'content-type': 'application/json; charset=utf-8' }),
  })
}

// multipart のオーバーヘッド（boundary・フィールド名等）ぶんだけ本体の上限より少し余裕を持たせる
const MAX_UPLOAD_CONTENT_LENGTH = FAVICON_UPLOAD_MAX_BYTES + 4_096

/**
 * サイトのアイコンの手動アップロード（POST /api/vendor-favicon/<vendorId>）。
 * Cloudflare からのアクセスを拒否するサーバー（README「取得を拒否するサイトへの対応」参照）
 * 向けの唯一の代替経路。`/api/vendor-photos/$vendorId` と同じ形（raw route で multipart を
 * 受け取る）だが、検証・R2 書き込み・DB 更新のロジックは vendorImagesFetcher.ts の
 * uploadVendorFaviconCore に集約している（AGENTS.md のファイル分割ルール通り。
 * worker テストから HTTP 層を経由せず直接叩けるようにするため）。配信は既存の
 * `/api/photos/<key>`（vendors/… キーもそのまま扱える）。認証は src/start.ts の
 * グローバルミドルウェアが適用済み。
 */
export const Route = createFileRoute('/api/vendor-favicon/$vendorId')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const vendorId = params.vendorId
        if (!isIdLike(vendorId)) return json(400, { error: '業者の指定が不正です' })

        const contentLength = Number(request.headers.get('content-length'))
        if (contentLength > MAX_UPLOAD_CONTENT_LENGTH) {
          return json(413, { error: FAVICON_UPLOAD_TOO_LARGE_ERROR })
        }

        const form = await request.formData()
        const file = form.get('file')
        if (!(file instanceof File)) return json(400, { error: '画像を選んでください' })

        const bytes = new Uint8Array(await file.arrayBuffer())
        const result = await uploadVendorFaviconCore(getDb(), vendorId, bytes)
        if (!result.ok) {
          const status =
            result.error === VENDOR_NOT_FOUND_ERROR
              ? 404
              : result.error === FAVICON_UPLOAD_TOO_LARGE_ERROR
                ? 413
                : result.error === FAVICON_UPLOAD_WRONG_TYPE_ERROR
                  ? 415
                  : 400
          return json(status, { error: result.error })
        }
        return json(200, { key: result.key })
      },
    },
  },
})
