import { describe, expect, it } from 'vitest'

import { parseRss } from './rss'

function feed(items: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>テスト工務店 お知らせ</title>
    ${items}
  </channel>
</rss>`
}

describe('parseRss', () => {
  it('CDATA 題名・エンティティ・HTML description・javascript: リンクの3件を扱う', () => {
    const xml = feed(`
      <item>
        <title><![CDATA[【完成見学会】平屋の家]]></title>
        <link>https://news.example.com/topics/1</link>
        <pubDate>Sat, 12 Sep 2026 09:00:00 +0900</pubDate>
        <description><![CDATA[<p>詳細は &amp; こちら</p>]]></description>
      </item>
      <item>
        <title>資材価格 &amp; 工期のお知らせ</title>
        <link>https://news.example.com/topics/2</link>
        <pubDate>Wed, 01 Jan 2026 00:00:00 GMT</pubDate>
        <description>本文はタグなし。</description>
      </item>
      <item>
        <title>怪しいリンク</title>
        <link>javascript:alert(1)</link>
        <pubDate>Thu, 02 Jan 2026 09:00:00 +0900</pubDate>
      </item>
    `)

    expect(parseRss(xml)).toEqual([
      {
        url: 'https://news.example.com/topics/1',
        title: '【完成見学会】平屋の家',
        summary: '詳細は & こちら',
        publishedOn: '2026-09-12',
      },
      {
        url: 'https://news.example.com/topics/2',
        title: '資材価格 & 工期のお知らせ',
        summary: '本文はタグなし。',
        publishedOn: '2026-01-01',
      },
    ])
  })

  it('http(s) 以外の link を持つ item は落ちる', () => {
    const xml = feed(`
      <item>
        <title>不正なリンク</title>
        <link>ftp://news.example.com/topics/3</link>
        <pubDate>Fri, 03 Jan 2026 09:00:00 +0900</pubDate>
      </item>
    `)
    expect(parseRss(xml)).toEqual([])
  })

  it('link 要素が無い item は落ちる', () => {
    const xml = feed(`
      <item>
        <title>リンク無し</title>
        <pubDate>Fri, 03 Jan 2026 09:00:00 +0900</pubDate>
      </item>
    `)
    expect(parseRss(xml)).toEqual([])
  })

  it('pubDate 要素が無い item は落ちる', () => {
    const xml = feed(`
      <item>
        <title>日付無し</title>
        <link>https://news.example.com/topics/9</link>
      </item>
    `)
    expect(parseRss(xml)).toEqual([])
  })

  it('pubDate が RFC 2822 として読めない item は落ちる', () => {
    const xml = feed(`
      <item>
        <title>日付が変</title>
        <link>https://news.example.com/topics/10</link>
        <pubDate>来週あたり</pubDate>
      </item>
    `)
    expect(parseRss(xml)).toEqual([])
  })

  it('title 要素が無い item は落ちる（タイトルが空では意味が無いため）', () => {
    const xml = feed(`
      <item>
        <link>https://news.example.com/topics/11</link>
        <pubDate>Sat, 04 Jan 2026 09:00:00 +0900</pubDate>
      </item>
    `)
    expect(parseRss(xml)).toEqual([])
  })

  it('title の中身が空白だけの item も落ちる', () => {
    const xml = feed(`
      <item>
        <title>   </title>
        <link>https://news.example.com/topics/11</link>
        <pubDate>Sat, 04 Jan 2026 09:00:00 +0900</pubDate>
      </item>
    `)
    expect(parseRss(xml)).toEqual([])
  })

  it('title は200字に切り詰める', () => {
    const longTitle = 'あ'.repeat(500)
    const xml = feed(`
      <item>
        <title>${longTitle}</title>
        <link>https://news.example.com/topics/13</link>
        <pubDate>Sat, 04 Jan 2026 09:00:00 +0900</pubDate>
      </item>
    `)
    const result = parseRss(xml)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('あ'.repeat(200))
    expect(result[0].title.length).toBe(200)
  })

  it('description は stripTags のうえ 300 字に切り詰める', () => {
    const long = '本'.repeat(310)
    const xml = feed(`
      <item>
        <title>長い説明</title>
        <link>https://news.example.com/topics/12</link>
        <pubDate>Sun, 05 Jan 2026 09:00:00 +0900</pubDate>
        <description><![CDATA[<p>${long}</p>]]></description>
      </item>
    `)
    const result = parseRss(xml)
    expect(result).toHaveLength(1)
    expect(result[0].summary).toBe('本'.repeat(300))
    expect(result[0].summary?.length).toBe(300)
  })

  it('壊れた XML は空配列（never throw）', () => {
    expect(parseRss('<rss><channel><item><title>Unclosed')).toEqual([])
    expect(parseRss('not xml at all')).toEqual([])
    expect(parseRss('')).toEqual([])
  })

  it('item が無いチャンネルは空配列', () => {
    expect(parseRss(feed(''))).toEqual([])
  })

  it('日が範囲外（32日）の pubDate を持つ item は落ちる', () => {
    const xml = feed(`
      <item>
        <title>日付が範囲外</title>
        <link>https://news.example.com/topics/20</link>
        <pubDate>Sat, 32 Sep 2026 09:00:00 +0900</pubDate>
      </item>
    `)
    expect(parseRss(xml)).toEqual([])
  })

  it('実在しない日（2月31日）が Date.parse で翌月へ繰り上がる item は落ちる', () => {
    const xml = feed(`
      <item>
        <title>実在しない日付</title>
        <link>https://news.example.com/topics/21</link>
        <pubDate>Sun, 31 Feb 2026 09:00:00 +0900</pubDate>
      </item>
    `)
    expect(parseRss(xml)).toEqual([])
  })

  it('実在する日の pubDate は正しく解決する（32日・31日の回帰確認）', () => {
    const xml = feed(`
      <item>
        <title>正しい日付</title>
        <link>https://news.example.com/topics/22</link>
        <pubDate>Thu, 15 Jan 2026 09:00:00 +0900</pubDate>
      </item>
    `)
    const result = parseRss(xml)
    expect(result).toHaveLength(1)
    expect(result[0].publishedOn).toBe('2026-01-15')
  })

  it('時刻が範囲外（25時）で Date.parse が NaN になる pubDate の item は落ちる', () => {
    const xml = feed(`
      <item>
        <title>時刻が範囲外</title>
        <link>https://news.example.com/topics/23</link>
        <pubDate>Sat, 12 Sep 2026 25:00:00 +0900</pubDate>
      </item>
    `)
    expect(parseRss(xml)).toEqual([])
  })

  it('JST 変換で年が5桁に繰り上がる極端な日付は落ちる（結果が YYYY-MM-DD にならない）', () => {
    // 9999年12月31日20:00 UTC + 9時間 = 10000年1月1日05:00 JST。
    // getUTCFullYear() は年を4桁にゼロ埋めしないため、そのまま連結すると
    // 「10000-01-01」になり ^\d{4}-\d{2}-\d{2}$ に一致しない。
    const xml = feed(`
      <item>
        <title>極端な日付</title>
        <link>https://news.example.com/topics/24</link>
        <pubDate>Thu, 31 Dec 9999 20:00:00 +0000</pubDate>
      </item>
    `)
    expect(parseRss(xml)).toEqual([])
  })

  it('MAX_INPUT_LENGTH を超える入力は空配列', () => {
    expect(parseRss('a'.repeat(2_000_001))).toEqual([])
  })
})
