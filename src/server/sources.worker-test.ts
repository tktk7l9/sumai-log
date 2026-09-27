import { describe, expect, it } from 'vitest'

import { resolveSourceInput, sourceInput } from './sources.schema'

/**
 * saveSource/resolveSource are wrapped in createServerFn, so calling them directly from a
 * plain vitest workers test, which has no TanStack Start server runtime (the Start context
 * of AsyncLocalStorage), fails with "No Start context found" (before even reaching the
 * validator). Looking at the validators sourceInput/resolveSourceInput themselves is
 * enough for the substantive verification, so here safeParse is checked directly (same
 * pattern as src/server/videos.worker-test.ts).
 *
 * The import is from `./sources.schema` rather than `./sources` because sources.ts
 * statically imports getRequest of `@tanstack/react-start/server` via currentActorEmail
 * (used inside saveSource), and that hits a virtual specifier that cannot be resolved from
 * this plain vitest workers test without the TanStack Start Vite plugin, and fails
 * (details are in the comment of sources.schema.ts).
 */
const base = {
  url: 'https://www.youtube.com/@example-house',
  name: 'テストチャンネル',
  genre: 'knowledge' as const,
  description: null,
  handle: '@example-house',
  channelId: null,
  avatarUrl: null,
  vendorId: null,
  affiliation: null,
  sortOrder: 0,
}

describe('sourceInput', () => {
  it('kind becomes youtube for a YouTube channel URL', () => {
    const result = sourceInput.safeParse(base)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.kind).toBe('youtube')
  })

  it('kind becomes site for a URL that is not in YouTube channel form', () => {
    const result = sourceInput.safeParse({ ...base, url: 'https://example.com/blog' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.kind).toBe('site')
  })

  it('rejects a URL that does not start with https (http included)', () => {
    expect(sourceInput.safeParse({ ...base, url: 'ftp://example.com' }).success).toBe(false)
    expect(sourceInput.safeParse({ ...base, url: 'http://example.com' }).success).toBe(false)
  })

  it('rejects a URL on a disallowed host (SSRF guard)', () => {
    const result = sourceInput.safeParse({ ...base, url: 'https://localhost/feed' })
    expect(result.success).toBe(false)
  })

  it('rejects an empty URL', () => {
    const result = sourceInput.safeParse({ ...base, url: '' })
    expect(result.success).toBe(false)
  })

  it('rejects an empty name', () => {
    const result = sourceInput.safeParse({ ...base, name: '' })
    expect(result.success).toBe(false)
  })

  it('rejects an unknown genre', () => {
    const result = sourceInput.safeParse({ ...base, genre: 'unknown' })
    expect(result.success).toBe(false)
  })

  it('rejects an unknown affiliation', () => {
    const result = sourceInput.safeParse({ ...base, affiliation: 'unknown' })
    expect(result.success).toBe(false)
  })

  it('allows null for affiliation', () => {
    const result = sourceInput.safeParse({ ...base, affiliation: null })
    expect(result.success).toBe(true)
  })

  it('allows known affiliations (including the Kouzou-juku map)', () => {
    for (const affiliation of ['iedukuri100', 'miratsugu', 'kouzou-cram']) {
      expect(sourceInput.safeParse({ ...base, affiliation }).success).toBe(true)
    }
  })

  it('rejects a description over 200 characters', () => {
    const result = sourceInput.safeParse({ ...base, description: 'あ'.repeat(201) })
    expect(result.success).toBe(false)
  })

  it('description normalizes an empty string to null', () => {
    const result = sourceInput.safeParse({ ...base, description: '' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.description).toBeNull()
  })

  it('drops avatarUrl to null when outside the allowed hosts (discards silently without rejecting the save)', () => {
    const result = sourceInput.safeParse({ ...base, avatarUrl: 'https://evil.example/a.jpg' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.avatarUrl).toBeNull()
  })

  it('avatarUrl remains when on an allowed host', () => {
    const url = 'https://yt3.googleusercontent.com/fake=s900'
    const result = sourceInput.safeParse({ ...base, avatarUrl: url })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.avatarUrl).toBe(url)
  })

  it('id can be given (for updates)', () => {
    const id = '11111111-1111-1111-1111-111111111111'
    const result = sourceInput.safeParse({ ...base, id })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.id).toBe(id)
  })

  it('rejects a malformed vendorId', () => {
    const result = sourceInput.safeParse({ ...base, vendorId: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })

  it('rejects a sortOrder that is not an integer', () => {
    const result = sourceInput.safeParse({ ...base, sortOrder: 1.5 })
    expect(result.success).toBe(false)
  })
})

describe('resolveSourceInput', () => {
  it('accepts a URL', () => {
    const result = resolveSourceInput.safeParse({ url: 'https://www.youtube.com/@example-house' })
    expect(result.success).toBe(true)
  })

  it('rejects an empty URL', () => {
    const result = resolveSourceInput.safeParse({ url: '' })
    expect(result.success).toBe(false)
  })
})
