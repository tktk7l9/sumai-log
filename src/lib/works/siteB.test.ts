import { describe, expect, it } from 'vitest'

import { siteB } from './siteB'

const LIST = `
<ul class="menu"><li><a href="https://example.com/housing/newly">新築</a></li></ul>
<ul class="works-list bottom-md">
  <li>
    <a href="https://example.com/works/newly/2026/0001.html">
      <div class="works-list_img"><img src="https://example.com/a.jpg" alt=""></div>
      <p class="font-sm">新築</p>          <h2 class="font-md">テストの家（てすと）</h2>
    </a>
  </li>
  <li>
    <a href="https://example.com/works/reform/2025/0002.html">
      <h2 class="font-md">種別のない家</h2>
    </a>
  </li>
  <li><a href="https://example.com/works/newly/2024/0003.html"><p class="font-sm">新築</p></a></li>
</ul>
<a href="https://example.com/works/page/2/">2</a>`

describe('siteB.parseList', () => {
  const page = siteB.parseList(LIST, 'https://example.com/works/')

  it('reads title and category of the items inside the works list only', () => {
    expect(page.entries).toEqual([
      {
        url: 'https://example.com/works/newly/2026/0001.html',
        title: 'テストの家（てすと）',
        category: '新築',
      },
      {
        url: 'https://example.com/works/reform/2025/0002.html',
        title: '種別のない家',
        category: null,
      },
    ])
  })

  it('follows the pagination', () => {
    expect(page.pageUrls).toEqual(['https://example.com/works/page/2/'])
  })

  it('returns nothing when the list is missing', () => {
    expect(siteB.parseList('<p>none</p>', 'https://example.com/works/').entries).toEqual([])
  })

  it('returns nothing when the page url is broken', () => {
    expect(siteB.parseList(LIST, 'not a url')).toEqual({ entries: [], pageUrls: [] })
  })
})

const detail = (body: string) => `<div class="works_container"><h1>テストの家</h1>${body}</div>`

describe('siteB.parseDetail', () => {
  it('reads the completion month', () => {
    expect(siteB.parseDetail(detail('<p>竣工：2026年6月</p>'))).toEqual({ completedOn: '2026-06' })
    expect(siteB.parseDetail(detail('<p>竣工:2025年12月</p>'))).toEqual({ completedOn: '2025-12' })
  })

  it('keeps the year alone when there is no month', () => {
    expect(siteB.parseDetail(detail('<p>竣工：2024年</p>'))).toEqual({ completedOn: '2024' })
  })

  it('returns null when the page does not say', () => {
    expect(siteB.parseDetail(detail('<p>本文</p>'))).toEqual({ completedOn: null })
  })

  it('recognises nothing on a page that is not a detail page', () => {
    expect(siteB.parseDetail('<h1>メンテナンス中</h1><p>竣工：2026年6月</p>')).toEqual({})
  })
})
