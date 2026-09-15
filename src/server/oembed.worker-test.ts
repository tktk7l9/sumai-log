import { describe, expect, it } from 'vitest'

import { fetchYouTubeOEmbed } from './oembed'

const VIDEO_ID = 'dQw4w9WgXcQ'

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('fetchYouTubeOEmbed', () => {
  it('200 なら題名・チャンネル・サムネを返す', async () => {
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

  it('非 200 なら null', async () => {
    const fetchImpl = (async () => jsonResponse({}, 404)) as typeof fetch
    expect(await fetchYouTubeOEmbed(VIDEO_ID, fetchImpl)).toBeNull()
  })

  it('例外（ネットワークエラー等）なら null', async () => {
    const fetchImpl = (async () => {
      throw new Error('network down')
    }) as typeof fetch
    expect(await fetchYouTubeOEmbed(VIDEO_ID, fetchImpl)).toBeNull()
  })

  it('JSON が不正なら null', async () => {
    const fetchImpl = (async () => new Response('not json', { status: 200 })) as typeof fetch
    expect(await fetchYouTubeOEmbed(VIDEO_ID, fetchImpl)).toBeNull()
  })

  it('thumbnail_url が無ければ youtubeThumbnailUrl で補う', async () => {
    const fetchImpl = (async () =>
      jsonResponse({ title: 'テスト動画', author_name: 'テストch' })) as typeof fetch
    const result = await fetchYouTubeOEmbed(VIDEO_ID, fetchImpl)
    expect(result?.thumbnailUrl).toBe(`https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`)
  })

  it('author_name が無ければ channel は null', async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        title: 'テスト動画',
        thumbnail_url: 'https://i.ytimg.com/x.jpg',
      })) as typeof fetch
    const result = await fetchYouTubeOEmbed(VIDEO_ID, fetchImpl)
    expect(result?.channel).toBeNull()
  })

  it('title が無い/文字列でなければ null', async () => {
    const fetchImpl = (async () => jsonResponse({ author_name: 'x' })) as typeof fetch
    expect(await fetchYouTubeOEmbed(VIDEO_ID, fetchImpl)).toBeNull()
  })

  it('5 秒の AbortSignal を渡す（実際には待たず、signal だけ確認する）', async () => {
    let capturedInit: RequestInit | undefined
    const neverResolves = new Promise<Response>(() => {})
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedInit = init
      return neverResolves
    }) as typeof fetch

    // 呼び出しだけ開始し、内側の fetchImpl が呼ばれるまでマイクロタスクを進める。
    // Promise 自体は待たない（5 秒のタイムアウトを実際に待たないため）。
    void fetchYouTubeOEmbed(VIDEO_ID, fetchImpl)
    await Promise.resolve()
    await Promise.resolve()

    expect(capturedInit?.signal).toBeInstanceOf(AbortSignal)
    expect(capturedInit?.signal?.aborted).toBe(false)
  })
})
