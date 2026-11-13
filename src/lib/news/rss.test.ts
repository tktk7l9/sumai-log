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
  it('handles 3 items: CDATA title, entities, HTML description, javascript: link', () => {
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

  it('drops an item whose link is not http(s)', () => {
    const xml = feed(`
      <item>
        <title>不正なリンク</title>
        <link>ftp://news.example.com/topics/3</link>
        <pubDate>Fri, 03 Jan 2026 09:00:00 +0900</pubDate>
      </item>
    `)
    expect(parseRss(xml)).toEqual([])
  })

  it('drops an item without a link element', () => {
    const xml = feed(`
      <item>
        <title>リンク無し</title>
        <pubDate>Fri, 03 Jan 2026 09:00:00 +0900</pubDate>
      </item>
    `)
    expect(parseRss(xml)).toEqual([])
  })

  it('drops an item without a pubDate element', () => {
    const xml = feed(`
      <item>
        <title>日付無し</title>
        <link>https://news.example.com/topics/9</link>
      </item>
    `)
    expect(parseRss(xml)).toEqual([])
  })

  it('drops an item whose pubDate cannot be read as RFC 2822', () => {
    const xml = feed(`
      <item>
        <title>日付が変</title>
        <link>https://news.example.com/topics/10</link>
        <pubDate>来週あたり</pubDate>
      </item>
    `)
    expect(parseRss(xml)).toEqual([])
  })

  it('drops an item without a title element (an empty title is meaningless)', () => {
    const xml = feed(`
      <item>
        <link>https://news.example.com/topics/11</link>
        <pubDate>Sat, 04 Jan 2026 09:00:00 +0900</pubDate>
      </item>
    `)
    expect(parseRss(xml)).toEqual([])
  })

  it('also drops an item whose title contains only whitespace', () => {
    const xml = feed(`
      <item>
        <title>   </title>
        <link>https://news.example.com/topics/11</link>
        <pubDate>Sat, 04 Jan 2026 09:00:00 +0900</pubDate>
      </item>
    `)
    expect(parseRss(xml)).toEqual([])
  })

  it('truncates title to 200 chars', () => {
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

  it('passes description through stripTags and truncates it to 300 chars', () => {
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

  it('broken XML gives an empty array (never throw)', () => {
    expect(parseRss('<rss><channel><item><title>Unclosed')).toEqual([])
    expect(parseRss('not xml at all')).toEqual([])
    expect(parseRss('')).toEqual([])
  })

  it('a channel without items gives an empty array', () => {
    expect(parseRss(feed(''))).toEqual([])
  })

  it('drops an item whose pubDate has a day out of range (the 32nd)', () => {
    const xml = feed(`
      <item>
        <title>日付が範囲外</title>
        <link>https://news.example.com/topics/20</link>
        <pubDate>Sat, 32 Sep 2026 09:00:00 +0900</pubDate>
      </item>
    `)
    expect(parseRss(xml)).toEqual([])
  })

  it('drops an item whose non-existent day (February 31) rolls over to the next month in Date.parse', () => {
    const xml = feed(`
      <item>
        <title>実在しない日付</title>
        <link>https://news.example.com/topics/21</link>
        <pubDate>Sun, 31 Feb 2026 09:00:00 +0900</pubDate>
      </item>
    `)
    expect(parseRss(xml)).toEqual([])
  })

  it('resolves a pubDate with a real day correctly (regression check for the 32nd / 31st)', () => {
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

  it('drops an item whose pubDate has an hour out of range (25) so Date.parse gives NaN', () => {
    const xml = feed(`
      <item>
        <title>時刻が範囲外</title>
        <link>https://news.example.com/topics/23</link>
        <pubDate>Sat, 12 Sep 2026 25:00:00 +0900</pubDate>
      </item>
    `)
    expect(parseRss(xml)).toEqual([])
  })

  it('drops an extreme date whose year rolls over to 5 digits in the JST conversion (the result is not YYYY-MM-DD)', () => {
    // 9999-12-31 20:00 UTC + 9 hours = 10000-01-01 05:00 JST.
    // getUTCFullYear() does not zero-pad the year to 4 digits, so plain concatenation gives
    // "10000-01-01", which does not match ^\d{4}-\d{2}-\d{2}$.
    const xml = feed(`
      <item>
        <title>極端な日付</title>
        <link>https://news.example.com/topics/24</link>
        <pubDate>Thu, 31 Dec 9999 20:00:00 +0000</pubDate>
      </item>
    `)
    expect(parseRss(xml)).toEqual([])
  })

  it('gives an empty array for input longer than MAX_INPUT_LENGTH', () => {
    expect(parseRss('a'.repeat(2_000_001))).toEqual([])
  })

  it('finishes in linear time on a feed full of unclosed <item> / <link> (hostile or broken source)', () => {
    const start = performance.now()
    expect(parseRss('<item>'.repeat(200_000))).toEqual([])
    expect(parseRss('<item>' + '<link>'.repeat(200_000) + '</item>')).toEqual([])
    expect(performance.now() - start).toBeLessThan(2000)
  })

  describe('a pubDate in the first hours of a month, written with its own offset', () => {
    const published = (pubDate: string) =>
      parseRss(
        feed(`
        <item>
          <title>月初のお知らせ</title>
          <link>https://news.example.com/topics/30</link>
          <pubDate>${pubDate}</pubDate>
        </item>
      `),
      ).map((c) => c.publishedOn)

    it('keeps 08:00 on the 1st in Japan time (still the month before in UTC)', () => {
      expect(published('Sun, 01 Nov 2026 08:00:00 +0900')).toEqual(['2026-11-01'])
    })

    it('keeps midnight of New Year in Japan time', () => {
      expect(published('Fri, 01 Jan 2027 00:00:00 +0900')).toEqual(['2027-01-01'])
    })

    it('keeps the last evening of a month written with a negative offset', () => {
      // 20:00 at -05:00 is 10:00 on 1 November in Japan
      expect(published('Sat, 31 Oct 2026 20:00:00 -0500')).toEqual(['2026-11-01'])
    })

    it('still drops a day that is not on the calendar', () => {
      expect(published('Mon, 31 Nov 2026 08:00:00 +0900')).toEqual([])
      expect(published('Mon, 29 Feb 2027 08:00:00 +0900')).toEqual([])
    })
  })

  describe('Atom', () => {
    const atom = (entries: string) => `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>テスト工務店 ブログ</title>
  <link rel="self" href="https://news.example.com/feed.atom"/>
  <updated>2026-11-05T00:00:00Z</updated>
  ${entries}
</feed>`

    it('reads <entry> with a link href, a published date and a summary', () => {
      const xml = atom(`
        <entry>
          <title>完成見学会のお知らせ</title>
          <link rel="self" href="https://news.example.com/api/1"/>
          <link rel="alternate" type="text/html" href="https://news.example.com/blog/1"/>
          <id>tag:news.example.com,2026:1</id>
          <published>2026-11-04T23:30:00Z</published>
          <updated>2026-11-08T10:00:00Z</updated>
          <summary type="html">&lt;p&gt;11月21日に開催します&lt;/p&gt;</summary>
        </entry>
      `)
      expect(parseRss(xml)).toEqual([
        {
          url: 'https://news.example.com/blog/1',
          title: '完成見学会のお知らせ',
          summary: '11月21日に開催します',
          // 23:30 UTC on the 4th is 08:30 on the 5th in Japan
          publishedOn: '2026-11-05',
        },
      ])
    })

    it('reads a link without rel, single quotes, and falls back to <updated> and <content>', () => {
      const xml = atom(`
        <entry>
          <title>お知らせ</title>
          <link rel='self' href='https://news.example.com/api/2' />
          <link href='https://news.example.com/blog/2' />
          <updated>2026-11-05T09:00:00.123+09:00</updated>
          <content type="html"><![CDATA[<p>本文です</p>]]></content>
        </entry>
      `)
      expect(parseRss(xml)).toEqual([
        {
          url: 'https://news.example.com/blog/2',
          title: 'お知らせ',
          summary: '本文です',
          publishedOn: '2026-11-05',
        },
      ])
    })

    it('drops an entry whose only links are not the page itself, or not http(s)', () => {
      const xml = atom(`
        <entry>
          <title>編集用リンクだけ</title>
          <link rel="edit" href="https://news.example.com/edit/3"/>
          <linkage href="https://news.example.com/other/3"/>
          <link rel="alternate"/>
          <updated>2026-11-05T09:00:00+09:00</updated>
        </entry>
        <entry>
          <title>怪しいリンク</title>
          <link href="javascript:alert(1)"/>
          <updated>2026-11-05T09:00:00+09:00</updated>
        </entry>
      `)
      expect(parseRss(xml)).toEqual([])
    })

    it('drops an entry without a readable date', () => {
      const xml = atom(`
        <entry>
          <title>日付なし</title>
          <link href="https://news.example.com/blog/4"/>
        </entry>
        <entry>
          <title>読めない日付</title>
          <link href="https://news.example.com/blog/5"/>
          <updated>きのう</updated>
        </entry>
        <entry>
          <title>実在しない日付</title>
          <link href="https://news.example.com/blog/6"/>
          <updated>2026-02-30T09:00:00+09:00</updated>
        </entry>
      `)
      expect(parseRss(xml)).toEqual([])
    })

    it('finishes in linear time on an entry full of unclosed <link', () => {
      const xml = atom(`<entry><title>t</title>${'<link '.repeat(100_000)}</entry>`)
      const started = performance.now()
      expect(parseRss(xml)).toEqual([])
      expect(performance.now() - started).toBeLessThan(1000)
    })
  })

  describe('RSS 1.0 (RDF)', () => {
    const rdf = (date: string) => `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel><title>テスト工務店</title></channel>
  <item rdf:about="https://news.example.com/topics/40">
    <title>構造見学会</title>
    <link>https://news.example.com/topics/40</link>
    <description>現場で開催します</description>
    <dc:date>${date}</dc:date>
  </item>
</rdf:RDF>`

    it('reads <dc:date> with an offset', () => {
      expect(parseRss(rdf('2026-11-05T08:00:00+09:00'))).toEqual([
        {
          url: 'https://news.example.com/topics/40',
          title: '構造見学会',
          summary: '現場で開催します',
          publishedOn: '2026-11-05',
        },
      ])
    })

    it('reads a date without seconds, and a date alone', () => {
      expect(parseRss(rdf('2026-11-05T08:00+09:00')).map((c) => c.publishedOn)).toEqual([
        '2026-11-05',
      ])
      expect(parseRss(rdf('2026-11-05')).map((c) => c.publishedOn)).toEqual(['2026-11-05'])
      expect(parseRss(rdf('2026-11-31'))).toEqual([])
    })
  })
})
