import { describe, expect, it } from 'vitest'

import { memoDefaultsOf } from './videoMemo'

const ID = 'dQw4w9WgXcQ'

describe('memoDefaultsOf', () => {
  it('fills the memo from the channel video: url, title, channel, thumbnail and vendor', () => {
    expect(
      memoDefaultsOf(ID, {
        videoId: ID,
        title: '平屋のルームツアー',
        channel: '甲工務店',
        vendorId: 'v1',
      }),
    ).toEqual({
      url: `https://www.youtube.com/watch?v=${ID}`,
      title: '平屋のルームツアー',
      channel: '甲工務店',
      thumbnailUrl: `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`,
      vendorId: 'v1',
    })
  })

  it('still fills the url and thumbnail when the video is not a channel video', () => {
    expect(memoDefaultsOf(ID, null)).toEqual({
      url: `https://www.youtube.com/watch?v=${ID}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`,
    })
  })
})
