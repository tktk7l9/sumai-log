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

// Leave a little headroom above the body limit for the multipart overhead (boundary, field names, etc.)
const MAX_UPLOAD_CONTENT_LENGTH = FAVICON_UPLOAD_MAX_BYTES + 4_096

/**
 * Manual upload of the site icon (POST /api/vendor-favicon/<vendorId>).
 * The only alternative path for servers that refuse access from Cloudflare (see the README
 * section on handling sites that refuse fetching). Same shape as `/api/vendor-photos/$vendorId`
 * (a raw route receives multipart), but the validation, R2 write and DB update logic is
 * gathered in uploadVendorFaviconCore in vendorImagesFetcher.ts (as the file split rule in
 * AGENTS.md says, so that worker tests can call it directly without going through the HTTP
 * layer). Delivery uses the existing `/api/photos/<key>` (it handles vendors/… keys as is).
 * Authentication is already applied by the global middleware in src/start.ts.
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
