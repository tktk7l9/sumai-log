import { describe, expect, it } from 'vitest'

import { workVideoInput, workWatchedInput } from './works.schema'

// Imported from ./works.schema, not ./works: see the comment in videos.schema.ts
const id = '00000000-0000-4000-8000-000000000001'

describe('workWatchedInput', () => {
  it('accepts an id and a boolean', () => {
    expect(workWatchedInput.safeParse({ id, watched: true }).success).toBe(true)
  })

  it('rejects a malformed id and a non-boolean', () => {
    expect(workWatchedInput.safeParse({ id: 'x', watched: true }).success).toBe(false)
    expect(workWatchedInput.safeParse({ id, watched: 'yes' }).success).toBe(false)
  })
})

describe('workVideoInput', () => {
  it.each([
    'https://www.youtube.com/watch?v=abcdefghijk',
    ' https://youtu.be/abcdefghijk?si=x ',
    'https://www.youtube.com/embed/abcdefghijk',
    'https://www.youtube.com/shorts/abcdefghijk',
  ])('normalizes %s to the video id', (url) => {
    const result = workVideoInput.safeParse({ id, url })
    expect(result.success && result.data).toEqual({ id, videoId: 'abcdefghijk' })
  })

  it('treats null and an empty string as "remove the video"', () => {
    expect(workVideoInput.parse({ id, url: null })).toEqual({ id, videoId: null })
    expect(workVideoInput.parse({ id, url: '  ' })).toEqual({ id, videoId: null })
  })

  it('rejects a URL that is not a YouTube video, with the reason on the url field', () => {
    const result = workVideoInput.safeParse({ id, url: 'https://example.com/video' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['url'])
      expect(result.error.issues[0]?.message).toBe('YouTube の URL を入れてください')
    }
  })
})
