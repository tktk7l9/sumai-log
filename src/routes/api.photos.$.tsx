import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'

import { getDb } from '../db/client'
import { visits } from '../db/schema'
import { isIdLike } from '../lib/ids'
import { isManagedPhotoKey, photoKeys, sniffImageType, validatePhotoUpload } from '../lib/photos'
import { securityHeadersInit } from '../lib/securityHeaders'
import { currentActorEmail } from '../server/members'
import { insertPhoto } from '../server/repository'
import { cleanupFailedUpload, getPhotosBucket } from '../server/storage'

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
 * Photo upload (POST /api/photos) and delivery (GET /api/photos/<key>).
 *
 * The original intent was to split this into separate files (`api.photos.tsx` +
 * `api.photos.$.tsx`), but this version of TanStack Router treats the `$` splat as
 * something that "can also match 0 characters", and when the match score is tied it
 * prefers the child node (the splat) over the parent exact-match node (the depth
 * tiebreak in `isFrameMoreSpecific`). As a result, a POST to `/api/photos` turns into
 * a lookup of the GET handler on the splat side (no handler), flows into the SSR
 * fallback, returns 200 HTML, and the upload fails silently (confirmed on a real
 * device: the console.log on the handler side never appears for `POST /api/photos`).
 * Not registering a separate exact-match route named `/api/photos` removes the
 * collision itself, and 1 file handles both POST and GET. Authentication is already
 * applied by the global middleware in src/start.ts.
 */
export const Route = createFileRoute('/api/photos/$')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        // The upload URL is exactly `/api/photos`. Anything in the splat means a different thing
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
          await cleanupFailedUpload([keys.displayKey, keys.thumbKey], error)
        }
        return json(200, { id: photoId, ...keys })
      },
      GET: async ({ params, request }) => {
        // The R2 key of a visit photo always starts with `photos/`, while the splat carries
        // only what is left after photoUrl strips it (see the isManagedPhotoKey comment below).
        // The vendor representative photo and favicon use the `vendors/` key as is in the URL
        // (photoUrl strips only `photos/`, so `vendors/` arrives in the splat unchanged).
        const splat = params._splat ?? ''
        const key = splat.startsWith('vendors/') ? splat : `photos/${splat}`
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
