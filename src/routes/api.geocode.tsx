import { createFileRoute } from '@tanstack/react-router'

import { getDb } from '../db/client'
import { securityHeadersInit } from '../lib/securityHeaders'
import { geocodeAddress } from '../server/geocode'

/** 認証は src/start.ts のグローバルミドルウェアが適用済み */
export const Route = createFileRoute('/api/geocode')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams.get('q')?.trim() ?? ''
        const headers = securityHeadersInit({ 'content-type': 'application/json; charset=utf-8' })
        if (q.length === 0 || q.length > 200) {
          return new Response(JSON.stringify({ error: '住所を入力してください' }), {
            status: 400,
            headers,
          })
        }
        const hit = await geocodeAddress(getDb(), q)
        if (!hit) {
          return new Response(JSON.stringify({ error: '住所から座標を引けませんでした' }), {
            status: 404,
            headers,
          })
        }
        return new Response(JSON.stringify(hit), { status: 200, headers })
      },
    },
  },
})
