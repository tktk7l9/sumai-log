import { createFileRoute } from '@tanstack/react-router'

import { securityHeadersInit } from '../lib/securityHeaders'
import { canonicalYouTubeUrl, parseYouTubeId } from '../lib/youtube'
import { fetchYouTubeOEmbed } from '../server/oembed'

/** 認証は src/start.ts のグローバルミドルウェアが適用済み */
export const Route = createFileRoute('/api/oembed')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const raw = new URL(request.url).searchParams.get('url')?.trim() ?? ''
        const headers = securityHeadersInit({ 'content-type': 'application/json; charset=utf-8' })

        if (raw.length > 500) {
          return new Response(JSON.stringify({ error: 'YouTube の URL を入れてください' }), {
            status: 400,
            headers,
          })
        }

        const videoId = parseYouTubeId(raw)
        if (!videoId) {
          return new Response(JSON.stringify({ error: 'YouTube の URL を入れてください' }), {
            status: 400,
            headers,
          })
        }

        const hit = await fetchYouTubeOEmbed(videoId)
        if (!hit) {
          return new Response(JSON.stringify({ error: '自動取得できませんでした' }), {
            status: 404,
            headers,
          })
        }

        headers.set('cache-control', 'private, max-age=86400')
        return new Response(
          JSON.stringify({
            videoId,
            title: hit.title,
            channel: hit.channel,
            thumbnailUrl: hit.thumbnailUrl,
            canonicalUrl: canonicalYouTubeUrl(videoId),
          }),
          { status: 200, headers },
        )
      },
    },
  },
})
