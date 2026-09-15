import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchYouTubeOEmbed } from './oembed'

const VIDEO_ID = 'dQw4w9WgXcQ'

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('fetchYouTubeOEmbed', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

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

  it('title は videoInput の上限（300 文字）を超えないよう切り詰める', async () => {
    const fetchImpl = (async () => jsonResponse({ title: 'あ'.repeat(400) })) as typeof fetch
    const result = await fetchYouTubeOEmbed(VIDEO_ID, fetchImpl)
    expect(result?.title).toHaveLength(300)
  })

  it('channel は videoInput の上限（200 文字）を超えないよう切り詰める', async () => {
    const fetchImpl = (async () =>
      jsonResponse({ title: 'x', author_name: 'い'.repeat(300) })) as typeof fetch
    const result = await fetchYouTubeOEmbed(VIDEO_ID, fetchImpl)
    expect(result?.channel).toHaveLength(200)
  })

  it('timeoutMs を小さくすると実際にすぐタイムアウトして null を返す（5 秒は待たない）', async () => {
    const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted', 'AbortError'))
        })
      })) as typeof fetch
    const result = await fetchYouTubeOEmbed(VIDEO_ID, fetchImpl, 20)
    expect(result).toBeNull()
  })

  it('timeoutMs を省略すると既定の 5000ms で AbortSignal.timeout を呼ぶ', async () => {
    const spy = vi.spyOn(AbortSignal, 'timeout')
    const neverResolves = new Promise<Response>(() => {})
    const fetchImpl = (async () => neverResolves) as typeof fetch

    // Promise 自体は待たない（実際に 5 秒のタイムアウトを待たないため）。
    // fetchImpl が呼ばれ、その中で AbortSignal.timeout が呼ばれるところまで
    // マイクロタスクを進めれば spy の呼び出し引数は確認できる。
    void fetchYouTubeOEmbed(VIDEO_ID, fetchImpl)
    await Promise.resolve()
    await Promise.resolve()

    expect(spy).toHaveBeenCalledWith(5000)
  })
})
