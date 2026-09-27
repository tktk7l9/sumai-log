import { describe, expect, it } from 'vitest'

import { extractYoutubeMeta } from './youtubeMeta'

describe('extractYoutubeMeta', () => {
  it('extracts og:title / og:description / og:image / channelId', () => {
    const html = `
      <html><head>
        <meta property="og:title" content="架空チャンネル">
        <meta property="og:description" content="架空チャンネルの説明です">
        <meta property="og:image" content="https://yt3.googleusercontent.com/fake=s900">
      </head><body>
        <script>var ytInitialData = {"channelId":"UCabcdefghijklmnopqrst"};</script>
      </body></html>
    `
    expect(extractYoutubeMeta(html)).toEqual({
      title: '架空チャンネル',
      description: '架空チャンネルの説明です',
      imageUrl: 'https://yt3.googleusercontent.com/fake=s900',
      channelId: 'UCabcdefghijklmnopqrst',
    })
  })

  it('reads content even when it comes before property (attribute order does not matter)', () => {
    const html = `<meta content="架空チャンネル" property="og:title">`
    expect(extractYoutubeMeta(html).title).toBe('架空チャンネル')
  })

  it('also reads single-quoted attribute values', () => {
    const single = `<meta property='og:title' content='架空チャンネル'>`
    expect(extractYoutubeMeta(single).title).toBe('架空チャンネル')
  })

  it('also reads unquoted attribute values', () => {
    const html = `<meta property=og:title content=架空チャンネル>`
    expect(extractYoutubeMeta(html).title).toBe('架空チャンネル')
  })

  it('skips a tag without a content attribute and looks for the next candidate (null when none is found)', () => {
    const html = `<meta property="og:title"><meta name="unrelated" content="x">`
    expect(extractYoutubeMeta(html).title).toBeNull()
  })

  it('also reads the name= attribute (in place of property=)', () => {
    const html = `<meta name="og:title" content="架空チャンネル">`
    expect(extractYoutubeMeta(html).title).toBe('架空チャンネル')
  })

  it('ignores the case of the property value', () => {
    const html = `<meta property="OG:TITLE" content="架空チャンネル">`
    expect(extractYoutubeMeta(html).title).toBe('架空チャンネル')
  })

  it('resolves HTML entities', () => {
    const html = `<meta property="og:title" content="架空&amp;チャンネル">`
    expect(extractYoutubeMeta(html).title).toBe('架空&チャンネル')
  })

  it('truncates og:description when it exceeds 200 characters', () => {
    const long = 'あ'.repeat(250)
    const html = `<meta property="og:description" content="${long}">`
    const result = extractYoutubeMeta(html)
    expect(result.description).toBe('あ'.repeat(200))
    expect(result.description?.length).toBe(200)
  })

  it('returns null for items that are not found', () => {
    expect(extractYoutubeMeta('<html></html>')).toEqual({
      title: null,
      description: null,
      imageUrl: null,
      channelId: null,
    })
  })

  it('treats content that is empty or whitespace only as null', () => {
    const html = `<meta property="og:title" content="   ">`
    expect(extractYoutubeMeta(html).title).toBeNull()
  })

  it('uses the first one when there are several tags of the same name', () => {
    const html = `
      <meta property="og:title" content="1件目">
      <meta property="og:title" content="2件目">
    `
    expect(extractYoutubeMeta(html).title).toBe('1件目')
  })

  it('does not pick up a channelId that does not start with UC', () => {
    const html = `<script>{"channelId":"XXabcdefghijklmnopqrst"}</script>`
    expect(extractYoutubeMeta(html).channelId).toBeNull()
  })

  it('ignores unrelated meta tags', () => {
    const html = `<meta charset="utf-8"><meta name="description" content="無関係">`
    expect(extractYoutubeMeta(html).title).toBeNull()
    expect(extractYoutubeMeta(html).description).toBeNull()
  })

  it('returns null for everything when the input exceeds the limit (does not scan a huge HTML)', () => {
    const huge = `<meta property="og:title" content="x">${'a'.repeat(2_000_001)}`
    expect(extractYoutubeMeta(huge)).toEqual({
      title: null,
      description: null,
      imageUrl: null,
      channelId: null,
    })
  })
})
