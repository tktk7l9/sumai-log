import { describe, expect, it } from 'vitest'

import { videoInput } from './videos.schema'

/**
 * saveVideo は createServerFn でラップされているため、TanStack Start の
 * サーバーランタイム（AsyncLocalStorage の Start context）が無い素の
 * vitest workers テストから直接呼ぶと「No Start context found」で落ちる
 * （validator に届く前の話）。実質的な検証は validator である videoInput
 * 自体を見れば足りるので、ここでは videoInput.safeParse を直接確認する
 * （src/server/events.worker-test.ts と同じパターン）。
 *
 * `./videos` からではなく `./videos.schema` から import しているのは、
 * videos.ts が（saveVideo の中で使う）currentActorEmail 経由で
 * `@tanstack/react-start/server` の getRequest を静的 import しており、それが
 * TanStack Start の Vite プラグイン無しのこの素の vitest workers テストからは
 * 解決できない virtual specifier（`#tanstack-router-entry`）を踏んで落ちるため
 * （詳細は videos.schema.ts のコメント）。
 */
const base = {
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  title: 'テスト動画',
  channel: null,
  thumbnailUrl: null,
  watchedOn: null,
  watchedBy: 'both' as const,
  tags: [] as string[],
  takeaways: null,
  vendorId: null,
}

describe('videoInput', () => {
  it('YouTube でない URL は拒否する（path=url、メッセージは「YouTube の URL を入れてください」）', () => {
    const result = videoInput.safeParse({ ...base, url: 'https://example.com/video' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['url'])
      expect(result.error.issues[0]?.message).toBe('YouTube の URL を入れてください')
    }
  })

  it('youtu.be の短縮 URL（クエリ付き）は正規化された url と videoId になる', () => {
    const result = videoInput.safeParse({
      ...base,
      url: 'https://youtu.be/dQw4w9WgXcQ?si=abc',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      expect(result.data.videoId).toBe('dQw4w9WgXcQ')
    }
  })

  it('題名が空なら拒否する', () => {
    const result = videoInput.safeParse({ ...base, title: '' })
    expect(result.success).toBe(false)
  })

  it('題名が 300 文字を超えたら拒否する', () => {
    const result = videoInput.safeParse({ ...base, title: 'あ'.repeat(301) })
    expect(result.success).toBe(false)
  })

  it('タグは 11 個で拒否する', () => {
    const result = videoInput.safeParse({
      ...base,
      tags: Array.from({ length: 11 }, (_, i) => `tag${i}`),
    })
    expect(result.success).toBe(false)
  })

  it('31 文字のタグは拒否する', () => {
    const result = videoInput.safeParse({ ...base, tags: ['a'.repeat(31)] })
    expect(result.success).toBe(false)
  })

  it('10 個 × 30 文字のタグは通る', () => {
    const result = videoInput.safeParse({
      ...base,
      tags: Array.from({ length: 10 }, () => 'a'.repeat(30)),
    })
    expect(result.success).toBe(true)
  })

  it('takeaways が 4000 文字を超えたら拒否する', () => {
    const result = videoInput.safeParse({ ...base, takeaways: 'あ'.repeat(4001) })
    expect(result.success).toBe(false)
  })

  it('watchedBy が enum の範囲外なら拒否する', () => {
    const result = videoInput.safeParse({ ...base, watchedBy: 'someone' })
    expect(result.success).toBe(false)
  })
})
