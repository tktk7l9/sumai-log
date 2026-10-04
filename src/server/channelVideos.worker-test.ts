import { describe, expect, it } from 'vitest'

import { channelVideoListInput, channelVideoWatchedInput } from './channelVideos.schema'

// Imported from ./channelVideos.schema, not ./channelVideos: see the comment in videos.schema.ts
const id = '00000000-0000-4000-8000-000000000001'

describe('channelVideoListInput', () => {
  it('accepts the filters and a limit', () => {
    expect(
      channelVideoListInput.safeParse({
        channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa',
        kind: 'short',
        unwatched: true,
        q: ' ルームツアー ',
        limit: 30,
      }).data?.q,
    ).toBe('ルームツアー')
  })

  it.each([{ limit: 0 }, { limit: 3001 }, { limit: 30, kind: 'movie' }, { limit: 1.5 }])(
    'rejects %j',
    (input) => {
      expect(channelVideoListInput.safeParse(input).success).toBe(false)
    },
  )
})

describe('channelVideoWatchedInput', () => {
  it('accepts an id and a boolean, and rejects a malformed id', () => {
    expect(channelVideoWatchedInput.safeParse({ id, watched: false }).success).toBe(true)
    expect(channelVideoWatchedInput.safeParse({ id: 'x', watched: true }).success).toBe(false)
  })
})
