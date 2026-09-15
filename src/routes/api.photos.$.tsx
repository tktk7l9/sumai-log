import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'

import { getDb } from '../db/client'
import { visits } from '../db/schema'
import { isIdLike } from '../lib/ids'
import { isManagedPhotoKey, photoKeys, sniffImageType, validatePhotoUpload } from '../lib/photos'
import { securityHeadersInit } from '../lib/securityHeaders'
import { currentActorEmail } from '../server/members'
import { insertPhoto } from '../server/repository'
import { deletePhotoObjects, getPhotosBucket } from '../server/storage'

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: securityHeadersInit({ 'content-type': 'application/json; charset=utf-8' }),
  })
}

function notFound() {
  return new Response('Not Found', {
    status: 404,
    headers: securityHeadersInit({ 'content-type': 'text/plain; charset=utf-8' }),
  })
}

const MAX_UPLOAD_CONTENT_LENGTH = 6 * 1024 * 1024

/**
 * 写真のアップロード（POST /api/photos）と配信（GET /api/photos/<key>）。
 *
 * 本来は別ファイル（`api.photos.tsx` + `api.photos.$.tsx`）に分けたかったが、
 * このバージョンの TanStack Router は `$` スプラットを「0 文字にもマッチしうる」
 * ものとして扱い、しかも一致度が同点のときは子ノード（スプラット）を親の
 * 完全一致ノードより優先する（`isFrameMoreSpecific` の depth タイブレーク）。
 * その結果、`/api/photos` への POST がスプラット側の GET ハンドラの読み取り
 * （ハンドラなし）に化けて SSR フォールバックへ流れ、200 の HTML が返って
 * アップロードが無言で失敗する（実機で確認済み: `POST /api/photos` に
 * ハンドラ側の console.log が一度も出ない）。`/api/photos` という完全一致
 * ルートを別途登録しないことでこの衝突自体を無くし、1 ファイルで
 * POST と GET の両方を扱う。認証は src/start.ts のグローバルミドルウェアが
 * 適用済み。
 */
export const Route = createFileRoute('/api/photos/$')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        // アップロード URL は `/api/photos` ちょうど。スプラットに何か付いていたら別物
        if (params._splat) return notFound()

        const contentLength = Number(request.headers.get('content-length'))
        if (contentLength > MAX_UPLOAD_CONTENT_LENGTH) {
          return json(413, { error: '画像が大きすぎます' })
        }

        const form = await request.formData()
        const visitId = String(form.get('visitId') ?? '')
        const display = form.get('display')
        const thumb = form.get('thumb')
        const width = Number(form.get('width'))
        const height = Number(form.get('height'))

        if (!isIdLike(visitId)) return json(400, { error: '見学記録の指定が不正です' })
        if (!(display instanceof File) || !(thumb instanceof File))
          return json(400, { error: '画像を選んでください' })
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
        const [visit] = await db
          .select({ id: visits.id })
          .from(visits)
          .where(eq(visits.id, visitId))
          .limit(1)
        if (!visit) return json(404, { error: '見学記録が見つかりません' })

        const actor = await currentActorEmail()
        const photoId = crypto.randomUUID()
        const keys = photoKeys(visitId, photoId)
        const bucket = getPhotosBucket()
        try {
          await bucket.put(keys.displayKey, displayBytes, { httpMetadata: { contentType: type } })
          await bucket.put(keys.thumbKey, thumbBytes, { httpMetadata: { contentType: thumbType } })
          await insertPhoto(db, { id: photoId, visitId, ...keys, width, height }, actor)
        } catch (error) {
          await deletePhotoObjects([keys.displayKey, keys.thumbKey])
          throw error
        }
        return json(200, { id: photoId, ...keys })
      },
      GET: async ({ params, request }) => {
        const key = `photos/${params._splat ?? ''}`
        if (!isManagedPhotoKey(key)) return notFound()
        const object = await getPhotosBucket().get(key)
        if (!object) return notFound()
        const etag = object.httpEtag
        if (request.headers.get('if-none-match') === etag) {
          return new Response(null, {
            status: 304,
            headers: securityHeadersInit({
              'cache-control': 'private, max-age=31536000, immutable',
              etag,
            }),
          })
        }
        return new Response(object.body, {
          headers: securityHeadersInit({
            'content-type': object.httpMetadata?.contentType ?? 'image/jpeg',
            'content-length': String(object.size),
            'cache-control': 'private, max-age=31536000, immutable',
            etag,
          }),
        })
      },
    },
  },
})
