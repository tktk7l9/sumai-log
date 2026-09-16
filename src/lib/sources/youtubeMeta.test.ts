import { describe, expect, it } from 'vitest'

import { extractYoutubeMeta } from './youtubeMeta'

describe('extractYoutubeMeta', () => {
  it('og:title / og:description / og:image / channelId を抜き出す', () => {
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

  it('content が property より先でも読める（属性順を問わない）', () => {
    const html = `<meta content="架空チャンネル" property="og:title">`
    expect(extractYoutubeMeta(html).title).toBe('架空チャンネル')
  })

  it('シングルクォートの属性値も読める', () => {
    const single = `<meta property='og:title' content='架空チャンネル'>`
    expect(extractYoutubeMeta(single).title).toBe('架空チャンネル')
  })

  it('無クォートの属性値も読める', () => {
    const html = `<meta property=og:title content=架空チャンネル>`
    expect(extractYoutubeMeta(html).title).toBe('架空チャンネル')
  })

  it('content 属性が無いタグはスキップし、次の候補を探す（見つからなければ null）', () => {
    const html = `<meta property="og:title"><meta name="unrelated" content="x">`
    expect(extractYoutubeMeta(html).title).toBeNull()
  })

  it('name= 属性（property= の代わり）でも読める', () => {
    const html = `<meta name="og:title" content="架空チャンネル">`
    expect(extractYoutubeMeta(html).title).toBe('架空チャンネル')
  })

  it('property 値の大文字小文字を問わない', () => {
    const html = `<meta property="OG:TITLE" content="架空チャンネル">`
    expect(extractYoutubeMeta(html).title).toBe('架空チャンネル')
  })

  it('HTML エンティティを解決する', () => {
    const html = `<meta property="og:title" content="架空&amp;チャンネル">`
    expect(extractYoutubeMeta(html).title).toBe('架空&チャンネル')
  })

  it('og:description は 200 字を超えたら切り詰める', () => {
    const long = 'あ'.repeat(250)
    const html = `<meta property="og:description" content="${long}">`
    const result = extractYoutubeMeta(html)
    expect(result.description).toBe('あ'.repeat(200))
    expect(result.description?.length).toBe(200)
  })

  it('見つからない項目は null', () => {
    expect(extractYoutubeMeta('<html></html>')).toEqual({
      title: null,
      description: null,
      imageUrl: null,
      channelId: null,
    })
  })

  it('content が空文字/空白だけなら null 扱い', () => {
    const html = `<meta property="og:title" content="   ">`
    expect(extractYoutubeMeta(html).title).toBeNull()
  })

  it('同名タグが複数あれば最初の 1 件を使う', () => {
    const html = `
      <meta property="og:title" content="1件目">
      <meta property="og:title" content="2件目">
    `
    expect(extractYoutubeMeta(html).title).toBe('1件目')
  })

  it('channelId は UC で始まらなければ拾わない', () => {
    const html = `<script>{"channelId":"XXabcdefghijklmnopqrst"}</script>`
    expect(extractYoutubeMeta(html).channelId).toBeNull()
  })

  it('関係の無い meta タグは無視する', () => {
    const html = `<meta charset="utf-8"><meta name="description" content="無関係">`
    expect(extractYoutubeMeta(html).title).toBeNull()
    expect(extractYoutubeMeta(html).description).toBeNull()
  })

  it('入力が上限を超える場合はすべて null（巨大な HTML を舐めない）', () => {
    const huge = `<meta property="og:title" content="x">${'a'.repeat(2_000_001)}`
    expect(extractYoutubeMeta(huge)).toEqual({
      title: null,
      description: null,
      imageUrl: null,
      channelId: null,
    })
  })
})
