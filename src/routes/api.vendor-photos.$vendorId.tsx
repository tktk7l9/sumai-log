import { createFileRoute } from '@tanstack/react-router'

import { getDb } from '../db/client'
import { isIdLike } from '../lib/ids'
import { sniffImageType, validatePhotoUpload, vendorImageKeys } from '../lib/photos'
import { securityHeadersInit } from '../lib/securityHeaders'
import { setVendorRepresentativePhotoKey, vendorExists } from '../server/repository'
import { cleanupFailedUpload, getPhotosBucket } from '../server/storage'

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: securityHeadersInit({ 'content-type': 'application/json; charset=utf-8' }),
  })
}

const MAX_UPLOAD_CONTENT_LENGTH = 6 * 1024 * 1024

/**
 * 代表者の顔写真のアップロード（POST /api/vendor-photos/<vendorId>）。
 * `/api/photos/$` と同じ形（端末側 Canvas で縮小済みの display/thumb をまとめて受け取る）。
 * 配信は既存の `/api/photos/<key>`（src/routes/api.photos.$.tsx）が
 * `vendors/…` キーもそのまま扱えるので、こちらは POST だけを持つ（GET は無い）。
 * 認証は src/start.ts のグローバルミドルウェアが適用済み。
 */
export const Route = createFileRoute('/api/vendor-photos/$vendorId')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const vendorId = params.vendorId
        if (!isIdLike(vendorId)) return json(400, { error: '業者の指定が不正です' })

        const contentLength = Number(request.headers.get('content-length'))
        if (contentLength > MAX_UPLOAD_CONTENT_LENGTH) {
          return json(413, { error: '画像が大きすぎます' })
        }

        const form = await request.formData()
        const display = form.get('display')
        const thumb = form.get('thumb')
        const width = Number(form.get('width'))
        const height = Number(form.get('height'))

        if (!(display instanceof File) || !(thumb instanceof File)) {
          return json(400, { error: '画像を選んでください' })
        }
        const problem = validatePhotoUpload({
          displaySize: display.size,
          thumbSize: thumb.size,
          width,
          height,
        })
        if (problem) return json(problem.status, { error: problem.message })

        const [displayBytes, thumbBytes] = await Promise.all([
          display.arrayBuffer(),
          thumb.arrayBuffer(),
        ])
        const type = sniffImageType(new Uint8Array(displayBytes).subarray(0, 16))
        const thumbType = sniffImageType(new Uint8Array(thumbBytes).subarray(0, 16))
        if (!type || !thumbType) return json(415, { error: '画像ファイルではありません' })

        const db = getDb()
        if (!(await vendorExists(db, vendorId))) return json(404, { error: '業者が見つかりません' })

        const keys = vendorImageKeys(vendorId)
        const bucket = getPhotosBucket()
        try {
          await bucket.put(keys.displayKey, displayBytes, { httpMetadata: { contentType: type } })
          await bucket.put(keys.thumbKey, thumbBytes, { httpMetadata: { contentType: thumbType } })
          await setVendorRepresentativePhotoKey(db, vendorId, keys.displayKey)
        } catch (error) {
          await cleanupFailedUpload([keys.displayKey, keys.thumbKey], error)
        }
        return json(200, { ...keys })
      },
    },
  },
})
