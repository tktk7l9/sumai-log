import { describe, expect, it } from 'vitest'

import { matchedFromSummaries, type ChannelSummary } from './summary'

const CH_A = 'UCaaaaaaaaaaaaaaaaaaaaaa'
const CH_B = 'UCbbbbbbbbbbbbbbbbbbbbbb'

describe('matchedFromSummaries', () => {
  const summaries: ChannelSummary[] = [
    {
      channelId: CH_A,
      channel: '甲工務店',
      total: 5,
      watched: 1,
      kinds: {
        video: { total: 2, watched: 1 },
        short: { total: 3, watched: 0 },
        live: { total: 0, watched: 0 },
      },
    },
    {
      channelId: CH_B,
      channel: '乙の会',
      total: 1,
      watched: 1,
      kinds: {
        video: { total: 1, watched: 1 },
        short: { total: 0, watched: 0 },
        live: { total: 0, watched: 0 },
      },
    },
  ]

  it.each([
    [{}, 6],
    [{ channelId: CH_A }, 5],
    [{ kind: 'video' as const }, 3],
    [{ unwatched: true }, 4],
    [{ channelId: CH_A, kind: 'short' as const, unwatched: true }, 3],
    [{ channelId: CH_B, unwatched: true }, 0],
    [{ channelId: 'UCnobody' }, 0],
  ])('%o -> %i', (filter, expected) => {
    expect(matchedFromSummaries(summaries, filter)).toBe(expected)
  })
})
