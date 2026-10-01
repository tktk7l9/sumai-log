import { describe, expect, it } from 'vitest'

import { siteC } from './siteC'

const SPEC = (label: string, value: string) =>
  `<p class="system-total_area"><span class="system-total_area-span-01">${label}</span><span class="system-total_area-span-02">${value}</span></p>`

const LIST = `
<ul class="system-list">
<li>
<a class="" href="https://example.com/works/p1/">
 <p class="cate-icon"><span class="x">注文住宅</span></p>
<p class="system-ttl-01">【テスト市】見本の家</p>
<p class="system-area">テスト市</p>
${SPEC('延べ床面積', '100㎡')}
${SPEC('UA値', '0.37W(㎡・K)')}
${SPEC('C値', '0.8㎠/㎡')}
</a></li>
<li>
<a class="" href="https://example.com/works/p2/">
<p class="system-ttl-01">数値のない家</p>
</a></li>
<li><a href="https://example.com/works/p3/"><p class="system-area">名前なし</p></a></li>
</ul>
<a href="https://example.com/works/page/2/">2</a><a href="https://example.com/works/page/3/">3</a>`

describe('siteC.parseList', () => {
  const page = siteC.parseList(LIST, 'https://example.com/works/')

  it('reads the specs shown on the list', () => {
    expect(page.entries[0]).toEqual({
      url: 'https://example.com/works/p1/',
      title: '【テスト市】見本の家',
      category: '注文住宅',
      location: 'テスト市',
      floorAreaTsubo: 30.25,
      uaValue: 0.37,
      cValue: 0.8,
    })
  })

  it('leaves what the item does not show null, and skips items without a title', () => {
    expect(page.entries[1]).toEqual({
      url: 'https://example.com/works/p2/',
      title: '数値のない家',
      category: null,
      location: null,
      floorAreaTsubo: null,
      uaValue: null,
      cValue: null,
    })
    expect(page.entries).toHaveLength(2)
  })

  it('follows the pagination', () => {
    expect(page.pageUrls).toEqual([
      'https://example.com/works/page/2/',
      'https://example.com/works/page/3/',
    ])
  })

  it('returns nothing when the list is missing', () => {
    expect(siteC.parseList('<p>none</p>', 'https://example.com/works/').entries).toEqual([])
  })

  it('returns nothing when the page url is broken', () => {
    expect(siteC.parseList(LIST, 'not a url')).toEqual({ entries: [], pageUrls: [] })
  })
})

describe('siteC.parseDetail', () => {
  it('finds the embedded tour video', () => {
    const html =
      '<div class="wysiwyg"><p><iframe title="YouTube video player" src="https://www.youtube.com/embed/abcdefghijk?si=x"></iframe></p></div>'
    expect(siteC.parseDetail(html)).toEqual({ youtubeVideoId: 'abcdefghijk' })
  })

  it('returns null when there is no video', () => {
    expect(siteC.parseDetail('<div class="wysiwyg"><p>本文</p></div>')).toEqual({
      youtubeVideoId: null,
    })
  })
})
