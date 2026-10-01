import { describe, expect, it } from 'vitest'

import {
  EMPTY_PLAYER_INFO,
  LISTENING_MESSAGE,
  YOUTUBE_EMBED_ORIGIN,
  embedUrl,
  mergePlayerInfo,
  readPlayerMessage,
  shouldMarkWatched,
} from './watch'

describe('readPlayerMessage', () => {
  it('reads the numbers of an infoDelivery message sent as a JSON string', () => {
    const raw = JSON.stringify({
      event: 'infoDelivery',
      info: { currentTime: 12.5, duration: 600, playerState: 1, videoData: { title: 'x' } },
    })
    expect(readPlayerMessage(raw)).toEqual({ currentTime: 12.5, duration: 600, playerState: 1 })
  })

  it('reads a partial infoDelivery (the player usually sends only what changed)', () => {
    expect(
      readPlayerMessage(JSON.stringify({ event: 'infoDelivery', info: { currentTime: 3 } })),
    ).toEqual({
      currentTime: 3,
    })
  })

  it('reads initialDelivery the same way, and onStateChange as the player state', () => {
    expect(
      readPlayerMessage(JSON.stringify({ event: 'initialDelivery', info: { duration: 90 } })),
    ).toEqual({
      duration: 90,
    })
    expect(readPlayerMessage(JSON.stringify({ event: 'onStateChange', info: 0 }))).toEqual({
      playerState: 0,
    })
  })

  it.each([
    ['not a string', { event: 'infoDelivery' }],
    ['not JSON', 'hello'],
    ['JSON that is not an object', '5'],
    ['JSON null', 'null'],
    ['another event', JSON.stringify({ event: 'onReady' })],
    ['infoDelivery without info', JSON.stringify({ event: 'infoDelivery', info: null })],
    ['infoDelivery with a non-object info', JSON.stringify({ event: 'infoDelivery', info: 5 })],
    ['onStateChange without a number', JSON.stringify({ event: 'onStateChange', info: 'x' })],
    [
      'non-finite numbers only',
      JSON.stringify({ event: 'infoDelivery', info: { currentTime: 'x' } }),
    ],
  ])('returns null for %s', (_name, raw) => {
    expect(readPlayerMessage(raw)).toBeNull()
  })
})

describe('mergePlayerInfo', () => {
  it('keeps what the patch does not carry', () => {
    const first = mergePlayerInfo(EMPTY_PLAYER_INFO, { duration: 600 })
    expect(mergePlayerInfo(first, { currentTime: 30 })).toEqual({
      currentTime: 30,
      duration: 600,
      playerState: -1,
    })
  })
})

describe('shouldMarkWatched', () => {
  it('is true at 90% of the length', () => {
    expect(shouldMarkWatched({ currentTime: 540, duration: 600, playerState: 1 })).toBe(true)
    expect(shouldMarkWatched({ currentTime: 539, duration: 600, playerState: 1 })).toBe(false)
  })

  it('is true when the player reports the end, whatever the position', () => {
    expect(shouldMarkWatched({ currentTime: 0, duration: 0, playerState: 0 })).toBe(true)
  })

  it('is false while the length is unknown (a live stream, or before the first message)', () => {
    expect(shouldMarkWatched({ currentTime: 50, duration: 0, playerState: 1 })).toBe(false)
    expect(shouldMarkWatched(EMPTY_PLAYER_INFO)).toBe(false)
  })
})

describe('embedUrl', () => {
  it('points at the no-cookie host with the JS API on and the page origin', () => {
    expect(embedUrl('abcdefghijk', 'https://example.test')).toBe(
      'https://www.youtube-nocookie.com/embed/abcdefghijk?enablejsapi=1&playsinline=1&rel=0&origin=https%3A%2F%2Fexample.test',
    )
    expect(YOUTUBE_EMBED_ORIGIN).toBe('https://www.youtube-nocookie.com')
  })

  it('has a listening message the player understands', () => {
    expect(JSON.parse(LISTENING_MESSAGE)).toEqual({
      event: 'listening',
      id: 'sumai-log',
      channel: 'widget',
    })
  })
})
