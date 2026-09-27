import { describe, expect, it } from 'vitest'

import { resolveSourceCore } from './sourcesFetcher'

/** A fake fetch where build(url) returns the Response. Never hits the real YouTube */
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
  it('a URL that is not a YouTube channel is an error (no fetch)', async () => {
    const fetchImpl = fakeFetch(() => {
      throw new Error('fetch されるべきではない')
    })
    const result = await resolveSourceCore('https://example.com/blog', fetchImpl)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('YouTube')
  })

  it('fetches a YouTube channel URL and returns og:title/description/image/channelId', async () => {
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

  it('sends Accept-Language: ja and Cookie: CONSENT=YES+1', async () => {
    const fetchImpl = fakeFetch((_url, init) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('accept-language')).toBe('ja')
      expect(headers.get('cookie')).toBe('CONSENT=YES+1')
      return new Response(channelHtml(), { status: 200 })
    })
    const result = await resolveSourceCore(CHANNEL_URL, fetchImpl)
    expect(result.ok).toBe(true)
  })

  it('a /channel/UC… URL prefers the channelId from the URL, and handle is null', async () => {
    const channelUrl = `https://www.youtube.com/channel/${CHANNEL_ID}`
    const fetchImpl = fakeFetch(() => new Response(channelHtml(), { status: 200 }))
    const result = await resolveSourceCore(channelUrl, fetchImpl)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.fields.channelId).toBe(CHANNEL_ID)
      expect(result.fields.handle).toBeNull()
    }
  })

  it('an og:image outside the allowed hosts is not adopted as avatarUrl (null)', async () => {
    const fetchImpl = fakeFetch(
      () =>
        new Response(channelHtml({ image: 'https://evil.example/avatar.jpg' }), { status: 200 }),
    )
    const result = await resolveSourceCore(CHANNEL_URL, fetchImpl)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.fields.avatarUrl).toBeNull()
  })

  it('an HTTP error includes its status in the error', async () => {
    const fetchImpl = fakeFetch(() => new Response('not found', { status: 404 }))
    const result = await resolveSourceCore(CHANNEL_URL, fetchImpl)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('404')
  })

  it('ignores a large content-length header and reads the body (content-length itself is not looked at, given the policy of reading only the top)', async () => {
    const fetchImpl = fakeFetch(
      () =>
        new Response('x', {
          status: 200,
          headers: { 'content-length': String(2_000_000) },
        }),
    )
    const result = await resolveSourceCore(CHANNEL_URL, fetchImpl)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.fields).toEqual({
        name: null,
        description: null,
        avatarUrl: null,
        handle: '@example-house',
        channelId: null,
      })
    }
  })

  it('does not fail even when the body far exceeds 1MB, and parses with the top part only (3MB stream, <head> within the first 100KB)', async () => {
    const headBytes = new TextEncoder().encode(channelHtml())
    expect(headBytes.byteLength).toBeLessThan(100 * 1024)
    const totalBytes = 3 * 1024 * 1024
    const chunkSize = 64 * 1024

    let sent = 0
    let headSent = false
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!headSent) {
          headSent = true
          controller.enqueue(headBytes)
          sent += headBytes.byteLength
          return
        }
        if (sent >= totalBytes) {
          controller.close()
          return
        }
        // The content can be anything (it does not affect the extraction result unless
        // it matches a meta tag), so zero-fill
        const size = Math.min(chunkSize, totalBytes - sent)
        controller.enqueue(new Uint8Array(size))
        sent += size
      },
    })
    const fetchImpl = fakeFetch(() => new Response(stream, { status: 200 }))

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

  it('returns an error without crashing even when fetch throws', async () => {
    const fetchImpl = (async () => {
      throw new Error('network down')
    }) as typeof fetch
    const result = await resolveSourceCore(CHANNEL_URL, fetchImpl)
    expect(result).toEqual({ ok: false, error: 'network down' })
  })

  it('an error when the redirect target is not allowed', async () => {
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
