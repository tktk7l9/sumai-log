import { describe, expect, it } from 'vitest'

import { resolveSourceCore } from './sourcesFetcher'

/** build(url) が Response を返すフェイク fetch。実際の YouTube は一切叩かない */
function fakeFetch(build: (url: string, init?: RequestInit) => Response | null): typeof fetch {
  return (async (url: string | URL, init?: RequestInit) => {
    const res = build(String(url), init)
    if (!res) throw new Error(`unexpected url: ${String(url)}`)
    return res
  }) as typeof fetch
}

const CHANNEL_URL = 'https://www.youtube.com/@example-house'
const CHANNEL_ID = `UC${'a'.repeat(22)}`

function channelHtml(overrides: Partial<Record<'title' | 'description' | 'image', string>> = {}) {
  const title = overrides.title ?? '架空チャンネル'
  const description = overrides.description ?? '架空チャンネルの説明'
  const image = overrides.image ?? 'https://yt3.googleusercontent.com/fake=s900'
  return `
    <html><head>
      <meta property="og:title" content="${title}">
      <meta property="og:description" content="${description}">
      <meta property="og:image" content="${image}">
    </head><body>
      <script>var x = {"channelId":"${CHANNEL_ID}"};</script>
    </body></html>
  `
}

describe('resolveSourceCore', () => {
  it('YouTube チャンネルでない URL はエラー（fetch しない）', async () => {
    const fetchImpl = fakeFetch(() => {
      throw new Error('fetch されるべきではない')
    })
    const result = await resolveSourceCore('https://example.com/blog', fetchImpl)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('YouTube')
  })

  it('YouTube チャンネル URL を取得して og:title/description/image/channelId を返す', async () => {
    const fetchImpl = fakeFetch((url) => {
      expect(url).toBe(CHANNEL_URL)
      return new Response(channelHtml(), { status: 200 })
    })
    const result = await resolveSourceCore(CHANNEL_URL, fetchImpl)
    expect(result).toEqual({
      ok: true,
      fields: {
        name: '架空チャンネル',
        description: '架空チャンネルの説明',
        avatarUrl: 'https://yt3.googleusercontent.com/fake=s900',
        handle: '@example-house',
        channelId: CHANNEL_ID,
      },
    })
  })

  it('Accept-Language: ja と Cookie: CONSENT=YES+1 を送る', async () => {
    const fetchImpl = fakeFetch((_url, init) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('accept-language')).toBe('ja')
      expect(headers.get('cookie')).toBe('CONSENT=YES+1')
      return new Response(channelHtml(), { status: 200 })
    })
    const result = await resolveSourceCore(CHANNEL_URL, fetchImpl)
    expect(result.ok).toBe(true)
  })

  it('/channel/UC… の URL は URL 由来の channelId を優先し、handle は null', async () => {
    const channelUrl = `https://www.youtube.com/channel/${CHANNEL_ID}`
    const fetchImpl = fakeFetch(() => new Response(channelHtml(), { status: 200 }))
    const result = await resolveSourceCore(channelUrl, fetchImpl)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.fields.channelId).toBe(CHANNEL_ID)
      expect(result.fields.handle).toBeNull()
    }
  })

  it('許可ホスト外の og:image は avatarUrl に採用しない（null）', async () => {
    const fetchImpl = fakeFetch(
      () =>
        new Response(channelHtml({ image: 'https://evil.example/avatar.jpg' }), { status: 200 }),
    )
    const result = await resolveSourceCore(CHANNEL_URL, fetchImpl)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.fields.avatarUrl).toBeNull()
  })

  it('HTTP エラーはそのステータスをエラーに含める', async () => {
    const fetchImpl = fakeFetch(() => new Response('not found', { status: 404 }))
    const result = await resolveSourceCore(CHANNEL_URL, fetchImpl)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('404')
  })

  it('content-length が上限を超えていれば取得を諦める', async () => {
    const fetchImpl = fakeFetch(
      () =>
        new Response('x', {
          status: 200,
          headers: { 'content-length': String(2_000_000) },
        }),
    )
    const result = await resolveSourceCore(CHANNEL_URL, fetchImpl)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('取得')
  })

  it('fetch が例外を投げてもクラッシュせずエラーを返す', async () => {
    const fetchImpl = (async () => {
      throw new Error('network down')
    }) as typeof fetch
    const result = await resolveSourceCore(CHANNEL_URL, fetchImpl)
    expect(result).toEqual({ ok: false, error: 'network down' })
  })

  it('リダイレクト先が許可されていなければエラー', async () => {
    const fetchImpl = fakeFetch((url) => {
      if (url === CHANNEL_URL) {
        return new Response(null, { status: 302, headers: { location: 'https://localhost/evil' } })
      }
      return null
    })
    const result = await resolveSourceCore(CHANNEL_URL, fetchImpl)
    expect(result.ok).toBe(false)
  })
})
