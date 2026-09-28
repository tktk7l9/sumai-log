import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchYouTubeOEmbed } from './oembed'

const VIDEO_ID = 'dQw4w9WgXcQ'

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('fetchYouTubeOEmbed', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the title, channel and thumbnail on 200', async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        title: 'テスト動画',
        author_name: 'テストch',
        thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hq.jpg',
      })) as typeof fetch
    expect(await fetchYouTubeOEmbed(VIDEO_ID, fetchImpl)).toEqual({
      title: 'テスト動画',
      channel: 'テストch',
      thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hq.jpg',
    })
  })

  it('null on non-200', async () => {
    const fetchImpl = (async () => jsonResponse({}, 404)) as typeof fetch
    expect(await fetchYouTubeOEmbed(VIDEO_ID, fetchImpl)).toBeNull()
  })

  it('null on an exception (network error etc.)', async () => {
    const fetchImpl = (async () => {
      throw new Error('network down')
    }) as typeof fetch
    expect(await fetchYouTubeOEmbed(VIDEO_ID, fetchImpl)).toBeNull()
  })

  it('null when the JSON is invalid', async () => {
    const fetchImpl = (async () => new Response('not json', { status: 200 })) as typeof fetch
    expect(await fetchYouTubeOEmbed(VIDEO_ID, fetchImpl)).toBeNull()
  })

  it('fills in with youtubeThumbnailUrl when thumbnail_url is missing', async () => {
    const fetchImpl = (async () =>
      jsonResponse({ title: 'テスト動画', author_name: 'テストch' })) as typeof fetch
    const result = await fetchYouTubeOEmbed(VIDEO_ID, fetchImpl)
    expect(result?.thumbnailUrl).toBe(`https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`)
  })

  it('channel is null when author_name is missing', async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        title: 'テスト動画',
        thumbnail_url: 'https://i.ytimg.com/x.jpg',
      })) as typeof fetch
    const result = await fetchYouTubeOEmbed(VIDEO_ID, fetchImpl)
    expect(result?.channel).toBeNull()
  })

  it('null when title is missing / not a string', async () => {
    const fetchImpl = (async () => jsonResponse({ author_name: 'x' })) as typeof fetch
    expect(await fetchYouTubeOEmbed(VIDEO_ID, fetchImpl)).toBeNull()
  })

  it('truncates title so it does not exceed the videoInput limit (300 characters)', async () => {
    const fetchImpl = (async () => jsonResponse({ title: 'あ'.repeat(400) })) as typeof fetch
    const result = await fetchYouTubeOEmbed(VIDEO_ID, fetchImpl)
    expect(result?.title).toHaveLength(300)
  })

  it('truncates channel so it does not exceed the videoInput limit (200 characters)', async () => {
    const fetchImpl = (async () =>
      jsonResponse({ title: 'x', author_name: 'い'.repeat(300) })) as typeof fetch
    const result = await fetchYouTubeOEmbed(VIDEO_ID, fetchImpl)
    expect(result?.channel).toHaveLength(200)
  })

  it('with a small timeoutMs it really times out right away and returns null (does not wait 5 seconds)', async () => {
    const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted', 'AbortError'))
        })
      })) as typeof fetch
    const result = await fetchYouTubeOEmbed(VIDEO_ID, fetchImpl, 20)
    expect(result).toBeNull()
  })

  it('calls AbortSignal.timeout with the default 5000ms when timeoutMs is omitted', async () => {
    const spy = vi.spyOn(AbortSignal, 'timeout')
    const neverResolves = new Promise<Response>(() => {})
    const fetchImpl = (async () => neverResolves) as typeof fetch

    // Do not await the Promise itself (so as not to really wait for the 5 second timeout).
    // Advancing the microtasks up to the point where fetchImpl is called and
    // AbortSignal.timeout is called inside it is enough to check the spy's call arguments.
    void fetchYouTubeOEmbed(VIDEO_ID, fetchImpl)
    await Promise.resolve()
    await Promise.resolve()

    expect(spy).toHaveBeenCalledWith(5000)
  })
})
