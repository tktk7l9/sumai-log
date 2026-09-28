import { describe, expect, it } from 'vitest'

import { videoInput } from './videos.schema'

/**
 * saveVideo is wrapped in createServerFn, so calling it directly from a plain
 * vitest workers test, which has no TanStack Start server runtime (the Start
 * context in AsyncLocalStorage), fails with "No Start context found"
 * (before it even reaches the validator). Checking the validator, videoInput
 * itself, is enough for real validation, so here we check videoInput.safeParse
 * directly (same pattern as src/server/events.worker-test.ts).
 *
 * We import from `./videos.schema` instead of `./videos` because videos.ts
 * statically imports getRequest from `@tanstack/react-start/server` via
 * currentActorEmail (used inside saveVideo), and that hits a virtual specifier
 * (`#tanstack-router-entry`) that cannot be resolved from this plain vitest
 * workers test without the TanStack Start Vite plugin, so it fails
 * (details in the comment in videos.schema.ts).
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
  it('rejects a non-YouTube URL (path=url, message is "YouTube の URL を入れてください" (Enter a YouTube URL))', () => {
    const result = videoInput.safeParse({ ...base, url: 'https://example.com/video' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['url'])
      expect(result.error.issues[0]?.message).toBe('YouTube の URL を入れてください')
    }
  })

  it('turns a youtu.be short URL (with query) into a normalized url and videoId', () => {
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

  it('rejects an empty title', () => {
    const result = videoInput.safeParse({ ...base, title: '' })
    expect(result.success).toBe(false)
  })

  it('rejects a title longer than 300 characters', () => {
    const result = videoInput.safeParse({ ...base, title: 'あ'.repeat(301) })
    expect(result.success).toBe(false)
  })

  it('rejects 11 tags', () => {
    const result = videoInput.safeParse({
      ...base,
      tags: Array.from({ length: 11 }, (_, i) => `tag${i}`),
    })
    expect(result.success).toBe(false)
  })

  it('rejects a tag of 31 characters', () => {
    const result = videoInput.safeParse({ ...base, tags: ['a'.repeat(31)] })
    expect(result.success).toBe(false)
  })

  it('accepts 10 tags x 30 characters', () => {
    const result = videoInput.safeParse({
      ...base,
      tags: Array.from({ length: 10 }, () => 'a'.repeat(30)),
    })
    expect(result.success).toBe(true)
  })

  it('rejects takeaways longer than 4000 characters', () => {
    const result = videoInput.safeParse({ ...base, takeaways: 'あ'.repeat(4001) })
    expect(result.success).toBe(false)
  })

  it('rejects a watchedBy outside the enum', () => {
    const result = videoInput.safeParse({ ...base, watchedBy: 'someone' })
    expect(result.success).toBe(false)
  })
})
